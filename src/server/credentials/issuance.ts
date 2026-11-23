import "server-only";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { canIssueGeneralistCredential } from "../domain/credentials";
import { capstoneDatabaseNow } from "../capstone/clock";

/**
 * Internal transaction helper, called only by verified owner finalization/recovery.
 * attemptId is the unique issuance idempotency key. The attempt row lock serializes
 * concurrent retries; an existing credential's code, status and consent never change.
 * UUIDv4 uses cryptographic randomness, rather than an internal/sequential primary key.
 * Immutable attempt pins bind blueprint/policy versions; the audit also snapshots them.
 */
export async function issueCredentialForFinalizedPass(tx: Prisma.TransactionClient, attemptId: string, actorUserId: string) {
  await tx.$queryRaw`SELECT "id" FROM "AssessmentAttempt" WHERE "id" = ${attemptId} FOR UPDATE`;
  const attempt = await tx.assessmentAttempt.findUniqueOrThrow({ where: { id: attemptId }, select: {
    mode: true, track: true, status: true, passed: true, finalScore: true, finalizedAt: true, isSyntheticFixture: true,
    capstoneBlueprint: { select: { version: true } }, scoringPolicy: { select: { version: true } }, reviewCase: { select: { status: true } },
  } });
  if (!canIssueGeneralistCredential({ ...attempt, finalScore: attempt.finalScore?.toNumber() ?? null,
    blueprintVersion: attempt.capstoneBlueprint?.version ?? null, scoringPolicyVersion: attempt.scoringPolicy?.version ?? null,
    reviewStatus: attempt.reviewCase?.status ?? null })) return null;
  const existing = await tx.credential.findUnique({ where: { attemptId } });
  if (existing) return existing;
  // PostgreSQL now() is anchored to transaction start, which can precede finalization;
  // use the database's current clock so issuance never appears to predate the finalized pass.
  const issuedAt = await capstoneDatabaseNow(tx);
  const credential = await tx.credential.create({ data: { attemptId, publicSlug: randomUUID(), track: "GENERALIST",
    competencies: ["G1", "G2", "G3", "G4", "G5", "G6"], status: "ACTIVE", publicShareEnabled: false,
    issuedAt, isDemo: true, demoLabel: "DEMO - SYNTHETIC", publicFields: ["TRACK", "ISSUED_AT", "COMPETENCIES"] } });
  // A failed audit append rolls back issuance and finalization together; raw judging records are never changed.
  await tx.auditEvent.create({ data: { eventKey: `credential:${attemptId}:issued:v1`, actorUserId,
    action: "CREDENTIAL_ISSUED", targetType: "Credential", targetId: credential.id, createdAt: issuedAt,
    metadataJson: { demoLabel: "DEMO - SYNTHETIC", credentialCode: credential.publicSlug, attemptId,
      competencies: credential.competencies, blueprintVersion: attempt.capstoneBlueprint!.version,
      scoringPolicyVersion: attempt.scoringPolicy!.version, issuedAt: credential.issuedAt.toISOString(), publicShareEnabled: false } } });
  return credential;
}
