import "server-only";
import { createHmac } from "node:crypto";
import type { PrismaClient, Prisma } from "@prisma/client";
import { normalizeEmail } from "../../lib/registration";

// Conservative Closed Alpha budgets bound KDF/account-creation work across instances.
// Limits count all non-honeypot requests, including invalid and duplicate-email submissions.
// The SQL counter cap is GLOBAL_LIMIT + 1; changing that bound needs an additive migration.
export const REGISTRATION_GLOBAL_LIMIT = 30;
export const REGISTRATION_EMAIL_LIMIT = 5;

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

/**
 * Fail-closed shared limit BEFORE validation/KDF/existence lookup. A global budget also covers
 * email rotation and spoofed headers: no untrusted forwarded IP is used as an abuse boundary.
 * HMAC subject keys use AUTH_SECRET, not plain email hashes susceptible to dictionary lookup.
 * The global lock orders concurrent requests; expired subject rows are pruned in small batches.
 */
export async function consumeRegistrationBudget(db: PrismaClient, email: unknown, secret: string): Promise<boolean> {
  if (secret.length < 32) throw new Error("Registration limiter is unavailable.");
  const key = (value: string) => createHmac("sha256", secret).update(`registration-v1:${value}`).digest("hex");
  const globalKey = key("global");
  const subjectKey = key(`email:${normalizeEmail(typeof email === "string" ? email.slice(0, 1024) : "")}`);
  return db.$transaction(async (tx) => {
    if (!await spend(tx, globalKey, REGISTRATION_GLOBAL_LIMIT)) return false;
    await tx.$executeRaw`DELETE FROM "RegistrationRateLimit" WHERE "keyHash" IN (
      SELECT "keyHash" FROM "RegistrationRateLimit" WHERE "expiresAt" <= clock_timestamp()
        AND "keyHash" <> ${globalKey} ORDER BY "expiresAt" LIMIT 100)`;
    return spend(tx, subjectKey, REGISTRATION_EMAIL_LIMIT);
  });
}
