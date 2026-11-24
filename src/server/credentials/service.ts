import "server-only";
import { randomUUID } from "node:crypto";
import { type Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { requireAdmin, requireCandidate } from "../../lib/auth";
import { AuthorizationError } from "../auth/guards";
import { capstoneDatabaseNow } from "../capstone/clock";
import { credentialPrivateSelect as privateSelect, credentialPrivateView as privateView } from "./projection";
import { appealSelect, appealOrder } from "../appeals/projection";
import { effectiveResult } from "../domain/effective-result";

const codeSchema = z.uuidv4();
const lifecycleSchema = z.object({ status: z.enum(["ACTIVE", "SUSPENDED", "REVOKED"]), reason: z.string().trim().min(1).max(4000) }).strict();
/** Fresh sole-owner RBAC on every administrative service, independent of page/action guards. */
async function requireCredentialAdmin() {
  const owner = await requireAdmin();
  if (owner.role !== "ADMIN_REVIEWER" || owner.accountCode !== "admin-michael") throw new AuthorizationError(403);
  return owner;
}

/** Candidate identity always comes from a freshly verified session, never from posted ownership fields. */
async function requireCredentialCandidate() {
  const candidate = await requireCandidate();
  if (candidate.role !== "CANDIDATE") throw new AuthorizationError(403);
  return candidate;
}

/** Read earned records for the current candidate only; private records remain visible after sharing withdrawal or lifecycle restrictions. */
export async function listCandidateCredentials(db: PrismaClient, attemptId?: string) {
  const candidate = await requireCredentialCandidate();
  if (attemptId !== undefined) z.string().min(1).max(100).parse(attemptId);
  const records = await db.credential.findMany({ where: { attempt: { candidateId: candidate.id, ...(attemptId ? { id: attemptId } : {}) } },
    select: privateSelect, orderBy: { issuedAt: "desc" } });
  return records.map(privateView);
}

/** Use attempt-then-credential lock order to match issuance and PostgreSQL's credential eligibility trigger. */
async function lockCredential(tx: Prisma.TransactionClient, code: string) {
  const reference = await tx.credential.findUnique({ where: { publicSlug: code }, select: { attemptId: true } });
  if (!reference) throw new AuthorizationError(403);
  await tx.$queryRaw`SELECT "id" FROM "AssessmentAttempt" WHERE "id" = ${reference.attemptId} FOR UPDATE`;
  await tx.$queryRaw`SELECT "id" FROM "Credential" WHERE "publicSlug" = ${code}::uuid FOR UPDATE`;
  return tx.credential.findUniqueOrThrow({ where: { publicSlug: code }, select: {
    id: true, status: true, publicShareEnabled: true, attempt: { select: { candidateId: true } },
  } });
}

/**
 * An explicit desired consent value makes retries idempotent; no inverse/toggle mutation is trusted.
 * Ownership is rechecked under locks. Every actual transition appends an immutable audit event
 * in the same transaction. Restricting a credential never erases its owner's sharing preference.
 */
export async function setCredentialSharing(db: PrismaClient, credentialCode: string, enabled: boolean) {
  const candidate = await requireCredentialCandidate();
  const code = codeSchema.parse(credentialCode); z.boolean().parse(enabled);
  return db.$transaction(async (tx) => {
    const record = await lockCredential(tx, code);
    if (record.attempt.candidateId !== candidate.id) throw new AuthorizationError(403);
    if (record.publicShareEnabled === enabled) return;
    await tx.credential.update({ where: { id: record.id }, data: { publicShareEnabled: enabled } });
    await tx.auditEvent.create({ data: { eventKey: `credential:consent:${randomUUID()}`, actorUserId: candidate.id,
      action: "CREDENTIAL_SHARING_CHANGED", targetType: "Credential", targetId: record.id,
      metadataJson: { demoLabel: "DEMO - SYNTHETIC", credentialCode: code, previous: record.publicShareEnabled, enabled } } });
  });
}

/** Inspect issued records as the active owner; public consent is never required for the owner's administrative inventory. */
export async function listAdminCredentials(db: PrismaClient) {
  await requireCredentialAdmin();
  const records = await db.credential.findMany({ select: { ...privateSelect,
    attempt: { select: { ...privateSelect.attempt.select, candidate: { select: { user: { select: { name: true } } } } } } },
    orderBy: { issuedAt: "desc" }, take: 100 });
  return records.map((record) => ({ ...privateView(record), candidateName: record.attempt.candidate.user.name }));
}

/**
 * Owner lifecycle changes require a nonblank reason. No-op retries create no duplicate event;
 * every real transition preserves old status/reason in the append-only audit. Reinstatement
 * retains historical suspension/revocation timestamps and honors the candidate's current consent.
 */
export async function changeCredentialStatus(db: PrismaClient, credentialCode: string, input: unknown) {
  const owner = await requireCredentialAdmin();
  const code = codeSchema.parse(credentialCode); const { status, reason } = lifecycleSchema.parse(input);
  return db.$transaction(async (tx) => {
    const record = await lockCredential(tx, code);
    if (record.status === status) return;
    const now = await capstoneDatabaseNow(tx);
    await tx.credential.update({ where: { id: record.id }, data: { status,
      ...(status === "SUSPENDED" ? { suspendedAt: now } : status === "REVOKED" ? { revokedAt: now } : {}) } });
    await tx.auditEvent.create({ data: { eventKey: `credential:lifecycle:${randomUUID()}`, actorUserId: owner.id,
      action: "CREDENTIAL_STATUS_CHANGED", targetType: "Credential", targetId: record.id,
      metadataJson: { demoLabel: "DEMO - SYNTHETIC", credentialCode: code, previous: record.status, status, reason } } });
  });
}

/**
 * Anonymous verification returns a strict evidence-only DTO. Status, consent, finalized
 * eligibility and frozen pins are predicates, never explanations for an unavailable code.
 * Candidate names, internal IDs, raw votes, and private audit reasons are never selected.
 * Numeric original/revised scores are read only for eligibility and never published.
 * No cache is used: the public route also sets no-store to honor withdrawal immediately.
 */
export async function getPublicCredential(db: PrismaClient, credentialCode: string) {
  const parsed = codeSchema.safeParse(credentialCode);
  if (!parsed.success) return null;
  const record = await db.credential.findFirst({ where: { publicSlug: parsed.data, status: "ACTIVE", publicShareEnabled: true, isDemo: true,
    publicFields: { hasEvery: ["TRACK", "ISSUED_AT", "COMPETENCIES"] },
    competencies: { hasEvery: ["G1", "G2", "G3", "G4", "G5", "G6"] }, track: "GENERALIST",
    attempt: { mode: "CAPSTONE", track: "GENERALIST", status: "FINALIZED", isSyntheticFixture: true,
      capstoneBlueprintId: { not: null }, scoringPolicyId: { not: null }, reviewCase: { status: "FINALIZED" } } },
    select: {
      publicSlug: true, issuedAt: true, track: true, competencies: true,
      attempt: { select: { deterministicScore: true, writtenScore: true, finalScore: true,
        appeals: { select: { status: appealSelect.status, disposition: appealSelect.disposition, resolvedDeterministicScore: true, resolvedWrittenScore: true, resolvedFinalScore: true }, orderBy: [...appealOrder] },
        capstoneBlueprint: { select: { version: true } }, scoringPolicy: { select: { version: true } } } },
    },
  });
  if (!record || record.competencies.length !== 6 || !effectiveResult(record.attempt).passed) return null;
  return { credentialCode: record.publicSlug, status: "ACTIVE" as const, issuedAt: record.issuedAt.toISOString(), track: record.track,
    competencies: record.competencies, blueprintVersion: record.attempt.capstoneBlueprint!.version,
    scoringPolicyVersion: record.attempt.scoringPolicy!.version };
}
