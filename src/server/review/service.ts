import "server-only";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { requireAdmin } from "../../lib/auth";
import { AuthorizationError } from "../auth/guards";
import type { AuthIdentity } from "../auth/accounts";
import { capstoneDatabaseNow } from "../capstone/clock";
import { computeFinalizedScore, validateOwnerScores } from "../domain/adjudication";
import { writtenVoteSchema, writtenVotesAgree } from "../ai/written-contract";
import { issueCredentialForFinalizedPass } from "../credentials/issuance";

const idSchema = z.string().min(1).max(100);
const finalInputSchema = z.object({ scores: z.unknown(), rationale: z.string().trim().min(1).max(12000) }).strict();
const reviewSelect = {
  id: true, status: true, ownerId: true, ownerPreliminaryJson: true, ownerPreliminarySavedAt: true,
  finalScoresJson: true, rationale: true, finalizedAt: true,
} as const;

/** Fresh Auth.js authorization is required inside EVERY exported query/mutation, never from caller-provided identity. */
async function requireOwner() {
  const owner = await requireAdmin();
  if (owner.role !== "ADMIN_REVIEWER" || owner.accountCode !== "admin-michael") throw new AuthorizationError(403);
  return owner;
}

/** Attempt-first locking matches grading workers and serializes saves/finalization; a fresh DB check rejects revoked owners. */
async function loadReview(tx: Prisma.TransactionClient, attemptId: string, owner: AuthIdentity) {
  await tx.$queryRaw`SELECT "id" FROM "AssessmentAttempt" WHERE "id" = ${attemptId} FOR UPDATE`;
  const active = await tx.user.findUnique({ where: { id: owner.id }, select: {
    role: true, accountCode: true, accountStatus: true, sessionVersion: true, isSyntheticFixture: true,
  } });
  if (!active || active.role !== "ADMIN_REVIEWER" || active.accountCode !== "admin-michael"
    || active.accountStatus !== "ACTIVE" || !active.isSyntheticFixture || active.sessionVersion !== owner.sessionVersion) throw new AuthorizationError(403);
  // Stage 1 deliberately does not SELECT triggerReason, gradingReasons, jobs or receipts.
  const attempt = await tx.assessmentAttempt.findUniqueOrThrow({ where: { id: attemptId }, select: {
    id: true, mode: true, track: true, status: true, isSyntheticFixture: true, submissionKey: true, submittedAt: true,
    deterministicScore: true, reviewCase: { select: reviewSelect },
    appeals: { where: { status: "RESOLVED", disposition: "ADJUSTED" }, select: { id: true }, take: 1 },
    scoringPolicy: { select: { evaluationJudgmentPoints: true, rubricApplicationPoints: true,
      factualVerificationPoints: true, writtenJustificationPoints: true, passingThreshold: true } },
    capstoneBlueprint: { select: { slots: { where: { writtenPrompt: { not: null } }, orderBy: { position: "asc" },
      select: { position: true, writtenPrompt: true } } } },
    responses: { orderBy: { position: "asc" }, select: { id: true, position: true, writtenJustification: true,
      scenario: { select: { id: true, version: true, demoLabel: true, prompt: true, responseA: true, responseB: true, evidenceJson: true,
        rubric: { select: { id: true, version: true, criteriaJson: true, demoLabel: true } } } } } },
  } });
  const review = attempt.reviewCase;
  if (attempt.mode !== "CAPSTONE" || attempt.track !== "GENERALIST" || !attempt.isSyntheticFixture
    || !attempt.submissionKey || !attempt.submittedAt || !["SUBMITTED", "GRADING", "PENDING_REVIEW", "FINALIZED"].includes(attempt.status)
    || !review || (review.ownerId !== null && review.ownerId !== owner.id)) throw new Error("A submitted owner-review capstone is required.");
  const slots = attempt.capstoneBlueprint?.slots ?? [];
  const responses = attempt.responses.filter((r) => slots.some((s) => s.position === r.position));
  if (slots.length !== 3 || responses.length !== 3) throw new Error("Three frozen written prompts are required.");
  return { attempt, review, responses, slots };
}

type ReviewState = Awaited<ReturnType<typeof loadReview>>;

/** A timestamp alone or malformed JSON never unlocks votes; every designated response must have persisted criterion scores. */
function preliminaryScores(state: ReviewState, owner: AuthIdentity) {
  if (!state.review.ownerPreliminarySavedAt || !state.review.ownerPreliminaryJson || state.review.ownerId !== owner.id)
    throw new Error("Persist independent preliminary scores before inspecting AI votes or finalizing.");
  return validateOwnerScores(state.review.ownerPreliminaryJson, state.responses.map((r) => r.id));
}

/** Stage 1 DTO contains only independent task materials and owner work, including no agreement/routing hints. */
function independentView({ attempt, review, responses, slots }: ReviewState) {
  return { stage: "PRELIMINARY" as const, demoLabel: "DEMO - SYNTHETIC", attemptId: attempt.id, reviewId: review.id,
    preliminarySavedAt: review.ownerPreliminarySavedAt?.toISOString() ?? null, preliminaryScores: review.ownerPreliminaryJson,
    prompts: responses.map((r) => ({ responseId: r.id, position: r.position,
      writtenPrompt: slots.find((s) => s.position === r.position)!.writtenPrompt!, writtenJustification: r.writtenJustification ?? "",
      scenario: r.scenario })) };
}

/** Stage 1 admin query: judge outputs and even agreement flags are excluded at the database projection boundary. */
export async function inspectIndependentReview(db: PrismaClient, attemptId: string) {
  const owner = await requireOwner();
  const id = idSchema.parse(attemptId);
  return db.$transaction(async (tx) => independentView(await loadReview(tx, id, owner)));
}

/** Stage 2 admin query: read immutable vote receipts ONLY after validating server-persisted preliminary scores. */
export async function inspectUnlockedReview(db: PrismaClient, attemptId: string) {
  const owner = await requireOwner();
  const id = idSchema.parse(attemptId);
  return db.$transaction(async (tx) => {
    const state = await loadReview(tx, id, owner);
    const preliminary = preliminaryScores(state, owner);
    const receipts = await tx.aiGradingReceipt.findMany({ where: { attemptId: id }, orderBy: [{ responseId: "asc" }, { judgeSlot: "asc" }],
      select: { id: true, responseId: true, judgeSlot: true, rubricId: true, modelVersion: true, promptVersion: true,
        demoLabel: true, status: true, rawVoteJson: true, errorCode: true } });
    const routing = await tx.reviewCase.findUniqueOrThrow({ where: { id: state.review.id }, select: { triggerReason: true, gradingReasons: true } });
    return { ...independentView(state), stage: "ADJUDICATION" as const, preliminaryScores: preliminary, ...routing,
      status: state.review.status, finalScores: state.review.finalScoresJson, rationale: state.review.rationale,
      votes: state.responses.map((r) => {
        const judges = [1, 2].map((judgeSlot) => {
          const receipt = receipts.find((v) => v.responseId === r.id && v.judgeSlot === judgeSlot);
          if (!receipt) return { judgeSlot, status: "AWAITING_RECEIPT" as const, vote: null };
          const parsed = writtenVoteSchema.safeParse(receipt.rawVoteJson);
          return { receiptId: receipt.id, judgeSlot, rubricId: receipt.rubricId, modelVersion: receipt.modelVersion,
            promptVersion: receipt.promptVersion, demoLabel: receipt.demoLabel, status: receipt.status, errorCode: receipt.errorCode,
            vote: receipt.status === "SUCCEEDED" && parsed.success ? parsed.data : null };
        });
        const [first, second] = judges;
        return { responseId: r.id, judges, agreement: first.vote && second.vote ? writtenVotesAgree(first.vote, second.vote) : null };
      }) };
  });
}

/**
 * Persist all three independent scores once, atomically with their append-only audit snapshot.
 * Identical retries are safe; changed scores are rejected so AI exposure can never rewrite the independent baseline.
 */
export async function savePreliminaryReview(db: PrismaClient, attemptId: string, input: unknown) {
  const owner = await requireOwner();
  const id = idSchema.parse(attemptId);
  return db.$transaction(async (tx) => {
    const state = await loadReview(tx, id, owner);
    const scores = validateOwnerScores(input, state.responses.map((r) => r.id));
    if (state.review.ownerPreliminaryJson !== null) {
      if (JSON.stringify(preliminaryScores(state, owner)) !== JSON.stringify(scores)) throw new Error("Independent preliminary scores are immutable.");
      return { savedAt: state.review.ownerPreliminarySavedAt!.toISOString() };
    }
    if (!["PENDING", "IN_REVIEW"].includes(state.review.status) || state.attempt.status === "FINALIZED") throw new Error("Review is closed.");
    const now = await capstoneDatabaseNow(tx);
    await tx.reviewCase.update({ where: { id: state.review.id }, data: {
      ownerId: owner.id, ownerPreliminaryJson: scores, ownerPreliminarySavedAt: now, status: "IN_REVIEW",
    } });
    await tx.auditEvent.create({ data: { eventKey: `review:${state.review.id}:preliminary:v1`, actorUserId: owner.id,
      action: "OWNER_PRELIMINARY_SAVED", targetType: "ReviewCase", targetId: state.review.id,
      metadataJson: { demoLabel: "DEMO - SYNTHETIC", attemptId: id, scores, savedAt: now.toISOString() } } });
    return { savedAt: now.toISOString() };
  });
}

/**
 * Sole-owner final sign-off is atomic with the immutable final audit snapshot and 100-point result.
 * The schema permits one aggregate ReviewCase per attempt: resolving it requires all three owner
 * scores and all six settled receipts. Missing/pending judges never imply zero written points.
 * No model/job/receipt is updated and no client-supplied total is accepted. A finalized
 * pass issues exactly one private credential in this same transaction.
 */
export async function finalizeOwnerReview(db: PrismaClient, attemptId: string, input: unknown) {
  const owner = await requireOwner();
  const id = idSchema.parse(attemptId);
  const parsed = finalInputSchema.parse(input);
  return db.$transaction(async (tx) => {
    const state = await loadReview(tx, id, owner);
    preliminaryScores(state, owner);
    const scores = validateOwnerScores(parsed.scores, state.responses.map((r) => r.id));
    const policy = state.attempt.scoringPolicy;
    if (!policy || policy.evaluationJudgmentPoints !== 40 || policy.rubricApplicationPoints !== 30
      || policy.factualVerificationPoints !== 25 || policy.writtenJustificationPoints !== 5 || !policy.passingThreshold.equals(85)
      || state.attempt.deterministicScore === null) throw new Error("Invalid frozen scoring policy or subtotal.");
    const result = computeFinalizedScore(state.attempt.deterministicScore.toNumber(), scores);
    if (state.review.status === "FINALIZED") {
      if (state.attempt.appeals.length) throw new Error("This result has an appeal revision. Inspect the current finalized result instead of replaying original adjudication.");
      if (state.attempt.status !== "FINALIZED" || JSON.stringify(validateOwnerScores(state.review.finalScoresJson, state.responses.map((r) => r.id))) !== JSON.stringify(scores)
        || state.review.rationale !== parsed.rationale) throw new Error("Final adjudication is immutable.");
      await issueCredentialForFinalizedPass(tx, id, owner.id);
      return result;
    }
    if (!["PENDING", "IN_REVIEW"].includes(state.review.status) || state.attempt.status === "FINALIZED") throw new Error("Review is closed.");
    const jobs = await tx.aiGradingJob.findMany({ where: { response: { attemptId: id } }, select: { id: true, responseId: true, judgeSlot: true, status: true } });
    const receipts = await tx.aiGradingReceipt.findMany({ where: { attemptId: id }, select: { id: true, jobId: true, responseId: true, judgeSlot: true, status: true } });
    if (jobs.length !== 6 || receipts.length !== 6 || state.responses.some((r) => [1, 2].some((slot) => !jobs.some((job) =>
      job.responseId === r.id && job.judgeSlot === slot && ["SUCCEEDED", "FAILED", "TIMED_OUT", "INVALID_OUTPUT"].includes(job.status)
      && receipts.some((receipt) => receipt.jobId === job.id && receipt.responseId === r.id && receipt.judgeSlot === slot && receipt.status === job.status)))))
      throw new Error("All six written judge jobs must settle with immutable receipts before finalization.");
    const now = await capstoneDatabaseNow(tx);
    await tx.reviewCase.update({ where: { id: state.review.id }, data: {
      status: "FINALIZED", finalScoresJson: scores, rationale: parsed.rationale, finalizedAt: now,
    } });
    // This explicit unresolved check also fails closed if the review relation is expanded in a later release.
    if (await tx.reviewCase.count({ where: { attemptId: id, status: { not: "FINALIZED" } } })) throw new Error("Unresolved review cases remain.");
    await tx.assessmentAttempt.update({ where: { id }, data: { status: "FINALIZED", finalizedAt: now,
      writtenScore: new Prisma.Decimal(result.writtenScore), finalScore: new Prisma.Decimal(result.finalScore), passed: result.passed } });
    await tx.auditEvent.create({ data: { eventKey: `review:${state.review.id}:final:v1`, actorUserId: owner.id,
      action: "OWNER_REVIEW_FINALIZED", targetType: "ReviewCase", targetId: state.review.id,
      metadataJson: { demoLabel: "DEMO - SYNTHETIC", attemptId: id, preliminaryScores: state.review.ownerPreliminaryJson!,
        finalScores: scores, rationale: parsed.rationale, receiptIds: receipts.map((r) => r.id).sort(), ...result, finalizedAt: now.toISOString() } } });
    await issueCredentialForFinalizedPass(tx, id, owner.id);
    return result;
  }, { timeout: 15000 });
}

/** Resolve a review URL on the server after fresh sole-owner authorization; no posted attempt identity is trusted. */
export async function resolveReviewAttempt(db: PrismaClient, reviewCaseId: string): Promise<string> {
  await requireOwner();
  const review = await db.reviewCase.findUniqueOrThrow({ where: { id: idSchema.parse(reviewCaseId) }, select: { attemptId: true } });
  return review.attemptId;
}

/** Persisted preliminary scores choose the stage. URL parameters and browser state can never unlock AI data. */
export async function inspectReviewCase(db: PrismaClient, reviewCaseId: string) {
  const attemptId = await resolveReviewAttempt(db, reviewCaseId);
  const independent = await inspectIndependentReview(db, attemptId);
  return independent.preliminarySavedAt ? inspectUnlockedReview(db, attemptId) : independent;
}

/**
 * Owner-only operational allowlist. Before independent scoring every case reports its
 * mandatory pilot audit reason; disagreement/fallback details unlock with preliminary scores.
 * Job counts are aggregate metadata, never raw votes. No provider spend or quota is invented.
 */
export async function getReviewConsole(db: PrismaClient) {
  await requireOwner();
  const eligible = { attempt: { mode: "CAPSTONE" as const, track: "GENERALIST" as const,
    isSyntheticFixture: true, submissionKey: { not: null }, submittedAt: { not: null } } };
  const pending = { ...eligible, status: { in: ["PENDING" as const, "IN_REVIEW" as const] } };
  const completed = { ...eligible, status: "FINALIZED" as const };
  const select = { id: true, status: true, triggerReason: true, ownerPreliminarySavedAt: true, finalizedAt: true,
    attempt: { select: { id: true, submittedAt: true, candidate: { select: { user: { select: { name: true } } } } } } } as const;
  const [queue, history, pendingDepth, finalizedCount, syntheticJobs, liveJobs] = await Promise.all([
    db.reviewCase.findMany({ where: pending, select, orderBy: { createdAt: "asc" }, take: 50 }),
    db.reviewCase.findMany({ where: completed, select, orderBy: { finalizedAt: "desc" }, take: 25 }),
    db.reviewCase.count({ where: pending }), db.reviewCase.count({ where: completed }),
    db.aiGradingJob.count({ where: { isSyntheticFixture: true } }), db.aiGradingJob.count({ where: { isSyntheticFixture: false } }),
  ]);
  const project = (row: typeof queue[number]) => ({ reviewCaseId: row.id, attemptId: row.attempt.id,
    candidateName: row.attempt.candidate.user.name, submittedAt: row.attempt.submittedAt!.toISOString(),
    finalizedAt: row.finalizedAt?.toISOString() ?? null, status: row.status,
    reason: row.ownerPreliminarySavedAt ? row.triggerReason : "ALPHA_SIGN_OFF" as const,
    independentScoresSaved: row.ownerPreliminarySavedAt !== null });
  return { queue: queue.map(project), history: history.map(project),
    metrics: { pendingDepth, finalizedCount, syntheticJobs, liveJobs, syntheticEstimatedSpendUsd: 0,
      liveEstimatedSpendUsd: null, quotaStatus: "Not configured", liveEnabled: process.env.ENABLE_LIVE_ZDR_GRADING === "true" } };
}
