import "server-only";
import type { Prisma } from "@prisma/client";
import type { CandidateCredential } from "../../lib/credential-content";

/** Private owned-record projection omits candidate names, grading details and internal credential IDs. */
export const credentialPrivateSelect = { publicSlug: true, status: true, publicShareEnabled: true, track: true, competencies: true, issuedAt: true,
  attempt: { select: { id: true, capstoneBlueprint: { select: { version: true } }, scoringPolicy: { select: { version: true } } } } } as const;

/** Called only after candidate ownership or admin authorization; never used as a public verification DTO. */
export function credentialPrivateView(record: Prisma.CredentialGetPayload<{ select: typeof credentialPrivateSelect }>): CandidateCredential {
  return { credentialCode: record.publicSlug, status: record.status, publicShareEnabled: record.publicShareEnabled,
    track: record.track, competencies: record.competencies, issuedAt: record.issuedAt.toISOString(), attemptId: record.attempt.id,
    blueprintVersion: record.attempt.capstoneBlueprint?.version ?? null, scoringPolicyVersion: record.attempt.scoringPolicy?.version ?? null };
}
