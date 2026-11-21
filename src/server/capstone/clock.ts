import "server-only";
import type { Prisma } from "@prisma/client";

/** Shared lock order: candidate first, then attempt. Auth guards still run before every public entry. */
export async function lockCapstoneCandidate(tx: Prisma.TransactionClient, candidateId: string) {
  const rows = await tx.$queryRaw<{ userId: string }[]>`SELECT "userId" FROM "CandidateProfile" WHERE "userId" = ${candidateId} FOR UPDATE`;
  if (!rows.length) throw new Error("Capstone unavailable.");
  const profile = await tx.candidateProfile.findUniqueOrThrow({ where: { userId: candidateId }, select: { selectedLevel: true, timeMultiplier: true,
    user: { select: { role: true, accountStatus: true, isSyntheticFixture: true } } } });
  if (profile.user.role !== "CANDIDATE" || profile.user.accountStatus !== "ACTIVE" || !profile.user.isSyntheticFixture) throw new Error("Capstone unavailable.");
  return profile;
}

/** PostgreSQL wall-clock after lock acquisition is the only authority for saves, expiry and final submission. */
export async function capstoneDatabaseNow(tx: Prisma.TransactionClient): Promise<Date> {
  const [row] = await tx.$queryRaw<{ now: Date }[]>`SELECT date_trunc('milliseconds', clock_timestamp()) AS now`;
  return row.now;
}
