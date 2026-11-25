import "server-only";
import type { Prisma } from "@prisma/client";

/** Shared lock order: candidate first, then attempt. Auth guards run before entry; account identity is independent of synthetic exam content. */
export async function lockCapstoneCandidate(tx: Prisma.TransactionClient, candidateId: string) {
  const rows = await tx.$queryRaw<{ userId: string }[]>`SELECT "userId" FROM "CandidateProfile" WHERE "userId" = ${candidateId} FOR UPDATE`;
  if (!rows.length) throw new Error("Capstone unavailable.");
  // Hold a coherent account snapshot through readiness/start: email/status changes wait until
  // the attempt transaction commits. Token flows lock User but never CandidateProfile.
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${candidateId} FOR SHARE`;
  const profile = await tx.candidateProfile.findUniqueOrThrow({ where: { userId: candidateId }, select: { selectedLevel: true, timeMultiplier: true,
    user: { select: { role: true, accountStatus: true, isSyntheticFixture: true, emailVerifiedAt: true } } } });
  // Live candidates may use labeled synthetic fixtures; scenario/blueprint checks remain authoritative.
  if (profile.user.role !== "CANDIDATE" || profile.user.accountStatus !== "ACTIVE") throw new Error("Capstone unavailable.");
  return profile;
}

/** PostgreSQL wall-clock after lock acquisition is the only authority for saves, expiry and final submission. */
export async function capstoneDatabaseNow(tx: Prisma.TransactionClient): Promise<Date> {
  const [row] = await tx.$queryRaw<{ now: Date }[]>`SELECT date_trunc('milliseconds', clock_timestamp()) AS now`;
  return row.now;
}
