import "server-only";
import { createHmac } from "node:crypto";
import type { PrismaClient, Prisma } from "@prisma/client";
import { normalizeEmail } from "../../lib/registration";

// Conservative Closed Alpha budgets bound KDF/account-creation work across instances.
// Limits count all non-honeypot requests, including invalid and duplicate-email submissions.
// The SQL counter cap is GLOBAL_LIMIT + 1; changing that bound needs an additive migration.
export const REGISTRATION_GLOBAL_LIMIT = 30;
export const REGISTRATION_EMAIL_LIMIT = 5;
export const JUDGE_HEALTH_CHECK_LIMIT = 3;

/** Atomic, database-clock fixed window; saturated counters cannot overflow under prolonged abuse. */
async function spend(tx: Prisma.TransactionClient, keyHash: string, limit: number): Promise<boolean> {
  const [row] = await tx.$queryRaw<{ attemptCount: number }[]>`
    INSERT INTO "RegistrationRateLimit" ("keyHash", "attemptCount", "windowStartedAt", "expiresAt")
    VALUES (${keyHash}, 1, date_trunc('milliseconds', clock_timestamp()), date_trunc('milliseconds', clock_timestamp()) + interval '15 minutes')
    ON CONFLICT ("keyHash") DO UPDATE SET
      "attemptCount" = CASE WHEN "RegistrationRateLimit"."expiresAt" <= clock_timestamp() THEN 1
        ELSE LEAST("RegistrationRateLimit"."attemptCount" + 1, ${limit + 1}) END,
      "windowStartedAt" = CASE WHEN "RegistrationRateLimit"."expiresAt" <= clock_timestamp()
        THEN date_trunc('milliseconds', clock_timestamp()) ELSE "RegistrationRateLimit"."windowStartedAt" END,
      "expiresAt" = CASE WHEN "RegistrationRateLimit"."expiresAt" <= clock_timestamp()
        THEN date_trunc('milliseconds', clock_timestamp()) + interval '15 minutes' ELSE "RegistrationRateLimit"."expiresAt" END
    RETURNING "attemptCount"`;
  return row.attemptCount <= limit;
}

/** A single shared quota across server instances. Call only after sole-owner authorization. */
export async function consumeJudgeHealthCheckBudget(db: PrismaClient, secret: string): Promise<boolean> {
  if (secret.length < 32) throw new Error("Health check limiter unavailable.");
  // Fixed HMAC namespace keeps probes separate from registration and account recovery counters.
  const key = createHmac("sha256", secret).update("judge-health-check:v1:global").digest("hex");
  return db.$transaction((tx) => spend(tx, key, JUDGE_HEALTH_CHECK_LIMIT));
}

/**
 * Fail-closed shared limit BEFORE validation/KDF/existence lookup. A global budget also covers
 * email rotation and spoofed headers: no untrusted forwarded IP is used as an abuse boundary.
 * HMAC subject keys use AUTH_SECRET, not plain email hashes susceptible to dictionary lookup.
 * The global lock orders concurrent requests; expired rows are pruned in small unlocked batches.
 */
export async function consumeRegistrationBudget(db: PrismaClient, email: unknown, secret: string): Promise<boolean> {
  return consumeBudget(db, normalizeEmail(typeof email === "string" ? email.slice(0, 1024) : ""), secret, "registration-v1");
}

/** Shared lifecycle budgets retain separate request/consumption namespaces; no raw emails or tokens are stored. */
export async function consumeLifecycleBudget(db: PrismaClient, operation: string, subject: string, secret: string): Promise<boolean> {
  return consumeBudget(db, subject.slice(0, 1024), secret, `account-lifecycle:${operation}`);
}

/** Reuse the additive budget table and its <=31 counter cap; namespace separation prevents cross-flow interference. */
async function consumeBudget(db: PrismaClient, subject: string, secret: string, namespace: string): Promise<boolean> {
  if (secret.length < 32) throw new Error("Registration limiter is unavailable.");
  const key = (value: string) => createHmac("sha256", secret).update(`${namespace}:${value}`).digest("hex");
  const globalKey = key("global");
  const subjectKey = key(`email:${subject}`);
  return db.$transaction(async (tx) => {
    if (!await spend(tx, globalKey, REGISTRATION_GLOBAL_LIMIT)) return false;
    // Other lifecycle namespaces lock different global rows. Skip locks during cleanup so
    // an expired row being refreshed cannot block/deadlock this flow or be deleted after refresh.
    await tx.$executeRaw`DELETE FROM "RegistrationRateLimit" WHERE "keyHash" IN (
      SELECT "keyHash" FROM "RegistrationRateLimit" WHERE "expiresAt" <= clock_timestamp()
        AND "keyHash" <> ${globalKey} ORDER BY "expiresAt" LIMIT 100 FOR UPDATE SKIP LOCKED)`;
    return spend(tx, subjectKey, REGISTRATION_EMAIL_LIMIT);
  });
}
