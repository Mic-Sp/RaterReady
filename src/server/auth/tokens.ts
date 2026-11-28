import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { AuthTokenPurpose, Prisma } from "@prisma/client";
import { z } from "zod";

const purposeSchema = z.enum(["EMAIL_VERIFICATION", "PASSWORD_RESET"]);
const rawTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const lifetimes: Record<AuthTokenPurpose, number> = { EMAIL_VERIFICATION: 24 * 60 * 60 * 1000, PASSWORD_RESET: 60 * 60 * 1000 };

/** Hash a generated 256-bit bearer secret for storage/lookup; never persist or log its plaintext. */
export function hashAuthToken(rawToken: string): string {
  return createHash("sha256").update(rawTokenSchema.parse(rawToken), "utf8").digest("hex");
}

/**
 * Internal storage primitive, not a Server Action. Call inside a transaction after the
 * workflow's authorization/rate-limit checks. Returns the secret once for delivery; only its
 * hash reaches PostgreSQL. Database time and a user lock bind lifetime/security version.
 */
export async function issueAuthToken(tx: Prisma.TransactionClient, userId: string, purpose: AuthTokenPurpose) {
  purposeSchema.parse(purpose);
  const [user] = await tx.$queryRaw<{ sessionVersion: number }[]>`
    SELECT "sessionVersion" FROM "User" WHERE "id" = ${userId} AND "accountStatus" = 'ACTIVE' FOR UPDATE`;
  if (!user) throw new Error("Auth token is unavailable.");
  const [clock] = await tx.$queryRaw<{ now: Date }[]>`SELECT date_trunc('milliseconds', clock_timestamp()) AS now`;
  const rawToken = randomBytes(32).toString("base64url");
  const expiresAt = new Date(clock.now.getTime() + lifetimes[purpose]);
  const { id } = await tx.authToken.create({ data: { userId, purpose, tokenHash: hashAuthToken(rawToken),
    sessionVersion: user.sessionVersion, createdAt: clock.now, expiresAt }, select: { id: true } });
  return { id, rawToken, expiresAt };
}

/**
 * Consume once using PostgreSQL time, exact purpose and the current account security version.
 * Call within the SAME transaction as the verification/password change: rollback must
 * restore token usability if that change fails. All invalid/replayed/expired inputs return null.
 */
export async function consumeAuthToken(tx: Prisma.TransactionClient, rawToken: string, purpose: AuthTokenPurpose) {
  if (!rawTokenSchema.safeParse(rawToken).success || !purposeSchema.safeParse(purpose).success) return null;
  const tokenHash = hashAuthToken(rawToken);
  // Lock account before token (also the issuance lock order). A concurrent password/status/email
  // change cannot race the security-version check or the workflow's subsequent account update.
  const [user] = await tx.$queryRaw<{ id: string; sessionVersion: number }[]>`
    SELECT u."id", u."sessionVersion" FROM "User" u JOIN "AuthToken" t ON t."userId" = u."id"
    WHERE t."tokenHash" = ${tokenHash} AND t."purpose" = ${purpose}::"AuthTokenPurpose"
      AND u."accountStatus" = 'ACTIVE' FOR UPDATE OF u`;
  if (!user) return null;
  const [consumed] = await tx.$queryRaw<{ userId: string; purpose: AuthTokenPurpose }[]>`
    UPDATE "AuthToken" SET "consumedAt" = date_trunc('milliseconds', clock_timestamp())
    WHERE "tokenHash" = ${tokenHash} AND "purpose" = ${purpose}::"AuthTokenPurpose"
      AND "userId" = ${user.id} AND "sessionVersion" = ${user.sessionVersion}
      AND "consumedAt" IS NULL AND "expiresAt" > clock_timestamp()
    RETURNING "userId", "purpose"`;
  return consumed ?? null;
}
