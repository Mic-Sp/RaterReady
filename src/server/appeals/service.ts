import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { requireAdmin, requireCandidate } from "../../lib/auth";
import { AuthorizationError } from "../auth/guards";
import { capstoneDatabaseNow } from "../capstone/clock";
import { appealSubmissionSchema, scoreAppealAdjustment } from "../domain/appeals";
import { effectiveResult } from "../domain/effective-result";
import { validateOwnerScores } from "../domain/adjudication";
import { issueCredentialForFinalizedPass } from "../credentials/issuance";
import { appealSelect, appealOrder, appealView } from "./projection";

const attemptSelect = { id: true, candidateId: true, mode: true, track: true, status: true, isSyntheticFixture: true,
  deterministicScore: true, writtenScore: true, finalScore: true, finalizedAt: true,
  reviewCase: { select: { id: true, status: true, finalScoresJson: true } },
  appeals: { select: appealSelect, orderBy: [...appealOrder] },
  capstoneBlueprint: { select: { slots: { where: { writtenPrompt: { not: null } }, select: { position: true } } } },
  responses: { select: { id: true, position: true } },
} as const satisfies Prisma.AssessmentAttemptSelect;

/** The active pilot owner alone may inspect/resolve appeals; authorization is repeated in each public service. */
async function requireAppealAdmin() {
  const owner = await requireAdmin();
  if (owner.role !== "ADMIN_REVIEWER" || owner.accountCode !== "admin-michael") throw new AuthorizationError(403);
  return owner;
}

/** Parent-first locks serialize submission, resolution, credential changes and duplicate requests. The base grade stays finalized. */
async function loadFinalized(tx: Prisma.TransactionClient, attemptId: string) {
  await tx.$queryRaw`SELECT "id" FROM "AssessmentAttempt" WHERE "id" = ${attemptId} FOR UPDATE`;
  const attempt = await tx.assessmentAttempt.findUniqueOrThrow({ where: { id: attemptId }, select: attemptSelect });
  if (attempt.mode !== "CAPSTONE" || attempt.track !== "GENERALIST" || attempt.status !== "FINALIZED" || !attempt.isSyntheticFixture
    || attempt.reviewCase?.status !== "FINALIZED" || attempt.finalScore === null) throw new Error("A finalized reviewed Generalist capstone is required.");
  return attempt;
}

/** One OPEN appeal per owned finalized attempt. Retries return the original reference without replacing evidence or duplicating audit events. */
export async function submitGradingAppeal(db: PrismaClient, attemptId: string, input: unknown) {
  const candidate = await requireCandidate();
  if (candidate.role !== "CANDIDATE") throw new AuthorizationError(403);
  const id = z.string().min(1).max(100).parse(attemptId); const evidence = appealSubmissionSchema.parse(input);
  return db.$transaction(async (tx) => {
    const attempt = await loadFinalized(tx, id);
    if (attempt.candidateId !== candidate.id) throw new AuthorizationError(403);
    const open = attempt.appeals.find((a) => a.status === "OPEN");
    if (open) return appealView(open);
    const result = effectiveResult(attempt);
    const appeal = await tx.assessmentAppeal.create({ data: { attemptId: id, publicReference: randomUUID(), ...evidence,
      submittedAt: await capstoneDatabaseNow(tx), beforeScoreJson: result } });
    await tx.auditEvent.create({ data: { eventKey: `appeal:${appeal.id}:submitted:v1`, actorUserId: candidate.id,
      action: "GRADING_APPEAL_SUBMITTED", targetType: "AssessmentAppeal", targetId: appeal.id,
      // Evidence remains immutable in the appeal row. Audit metadata retains its hash rather than copying candidate prose.
      metadataJson: { demoLabel: "DEMO - SYNTHETIC", reference: appeal.publicReference, attemptId: id, reason: evidence.reason,
        evidenceHash: createHash("sha256").update(evidence.evidenceNote).digest("hex"), beforeScore: result } } });
    return appealView(appeal);
  }, { timeout: 15000 });
}

/** Owner-only appeal inventory, bounded independently for pending and resolved history. No grading keys enter the console DTO. */
export async function listAdminAppeals(db: PrismaClient) {
  await requireAppealAdmin();
  const select = { ...appealSelect, attemptId: true, attempt: { select: { candidate: { select: { user: { select: { name: true } } } } } } } as const;
  const [pending, resolved] = await Promise.all([
    db.assessmentAppeal.findMany({ where: { status: "OPEN" }, select, orderBy: { submittedAt: "asc" }, take: 50 }),
    db.assessmentAppeal.findMany({ where: { status: "RESOLVED" }, select, orderBy: { resolvedAt: "desc" }, take: 50 }),
  ]);
  const project = (a: typeof pending[number]) => ({ ...appealView(a), attemptId: a.attemptId, candidateName: a.attempt.candidate.user.name });
  return { pending: pending.map(project), resolved: resolved.map(project) };
}

/** Inspect candidate evidence alongside the current finalized result and the original rubric-first review; no answer keys are returned. */
export async function inspectAdminAppeal(db: PrismaClient, reference: string) {
  await requireAppealAdmin();
  const appeal = await db.assessmentAppeal.findUniqueOrThrow({ where: { publicReference: z.uuidv4().parse(reference) } });
  const attempt = await db.assessmentAttempt.findUniqueOrThrow({ where: { id: appeal.attemptId }, select: attemptSelect });
  const slots = attempt.capstoneBlueprint?.slots ?? [];
  const responses = attempt.responses.filter((r) => slots.some((s) => s.position === r.position));
  return { appeal: appealView(appeal), attemptId: attempt.id, reviewCaseId: attempt.reviewCase!.id, currentResult: effectiveResult(attempt),
    prompts: responses, originalOwnerScores: validateOwnerScores(attempt.reviewCase!.finalScoresJson, responses.map((r) => r.id)) };
}

/**
 * OPEN -> RESOLVED is immutable and atomic with the disposition audit and credential issuance.
 * UPHELD preserves the effective grade; ADJUSTED appends a 40/30/25/5 revision. Original
 * AssessmentAttempt scores, owner preliminary/final evaluations and AI votes are never overwritten.
 */
export async function resolveGradingAppeal(db: PrismaClient, reference: string, input: unknown) {
  const owner = await requireAppealAdmin();
  const data = z.discriminatedUnion("disposition", [
    z.object({ disposition: z.literal("UPHELD"), rationale: z.string().trim().min(1).max(12000) }).strict(),
    z.object({ disposition: z.literal("ADJUSTED"), rationale: z.string().trim().min(1).max(12000), adjustment: z.unknown() }).strict(),
  ]).parse(input);
  const code = z.uuidv4().parse(reference);
  return db.$transaction(async (tx) => {
    const lookup = await tx.assessmentAppeal.findUniqueOrThrow({ where: { publicReference: code }, select: { attemptId: true } });
    const attempt = await loadFinalized(tx, lookup.attemptId);
    const appeal = await tx.assessmentAppeal.findUniqueOrThrow({ where: { publicReference: code } });
    if (appeal.status !== "OPEN") throw new Error("This appeal is already resolved. Its disposition cannot be replaced.");
    const before = effectiveResult(attempt);
    const adjustment = data.disposition === "ADJUSTED" ? scoreAppealAdjustment(data.adjustment) : null;
    if (adjustment) {
      const slots = attempt.capstoneBlueprint!.slots;
      validateOwnerScores(adjustment.scores.written, attempt.responses.filter((r) => slots.some((s) => s.position === r.position)).map((r) => r.id));
    }
    const result = adjustment?.result ?? { deterministicScore: before.deterministicScore!, writtenScore: before.writtenScore!, finalScore: before.finalScore!, passed: before.passed };
    const now = await capstoneDatabaseNow(tx);
    // Preserve strict revision order even for resolutions occurring within the same database millisecond.
    const last = attempt.appeals.reduce((latest, a) => Math.max(latest, a.resolvedAt?.getTime() ?? 0), 0);
    const resolvedAt = new Date(Math.max(now.getTime(), last + 1));
    const resolved = await tx.assessmentAppeal.update({ where: { id: appeal.id }, data: { status: "RESOLVED", disposition: data.disposition,
      dispositionRationale: data.rationale, resolvedById: owner.id, resolvedAt,
      resolutionScoresJson: adjustment ? adjustment.scores : { upheld: true, ...result },
      resolvedDeterministicScore: result.deterministicScore, resolvedWrittenScore: result.writtenScore, resolvedFinalScore: result.finalScore } });
    await tx.auditEvent.create({ data: { eventKey: `appeal:${appeal.id}:resolved:v1`, actorUserId: owner.id,
      action: "GRADING_APPEAL_RESOLVED", targetType: "AssessmentAppeal", targetId: appeal.id,
      metadataJson: { demoLabel: "DEMO - SYNTHETIC", reference: code, attemptId: attempt.id, disposition: data.disposition,
        rationale: data.rationale, beforeScore: before, afterScore: result, correctedScores: adjustment?.scores ?? null } } });
    const credential = await tx.credential.findUnique({ where: { attemptId: attempt.id } });
    if (!result.passed && credential?.status === "ACTIVE") {
      await tx.credential.update({ where: { id: credential.id }, data: { status: "SUSPENDED", suspendedAt: resolvedAt } });
      await tx.auditEvent.create({ data: { eventKey: `appeal:${appeal.id}:credential-restricted:v1`, actorUserId: owner.id,
        action: "CREDENTIAL_STATUS_CHANGED", targetType: "Credential", targetId: credential.id,
        metadataJson: { demoLabel: "DEMO - SYNTHETIC", previous: "ACTIVE", status: "SUSPENDED", reference: code,
          reason: "Resolved appeal adjusted the finalized score below 85." } } });
    }
    if (result.passed) await issueCredentialForFinalizedPass(tx, attempt.id, owner.id);
    return appealView(resolved);
  }, { timeout: 15000 });
}
