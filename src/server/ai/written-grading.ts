import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { Prisma, type PrismaClient, type ReviewTriggerReason } from "@prisma/client";
import { capstoneDatabaseNow } from "../capstone/clock";
import { writtenInputSchema, writtenRubricSchema, writtenVotesAgree, writtenVoteSchema } from "./written-contract";
import { evaluateWrittenJudge, FIXTURE_MODEL_VERSION, gradingRuntime, WRITTEN_PROMPT_VERSION, type GradingRuntime, type JudgeOutcome } from "./judges";

const LEASE_MS = 30000;
const settled = new Set(["SUCCEEDED", "FAILED", "TIMED_OUT", "INVALID_OUTPUT"]);
type ClaimedJob = Prisma.AiGradingJobGetPayload<{ include: { response: { select: { attemptId: true; position: true } } } }>;

/** Lock order is attempt then job. No external work occurs under a transaction or row lock. */
async function lockAttempt(tx: Prisma.TransactionClient, attemptId: string) {
  await tx.$queryRaw`SELECT "id" FROM "AssessmentAttempt" WHERE "id" = ${attemptId} FOR UPDATE`;
}

/**
 * Atomic submission outbox: unique(responseId, judgeSlot) deduplicates all retries.
 * Only three designated rubric/text snapshots are selected; no keys, secrets, or sibling votes enter inputs.
 * Stage A mandatory audit is unconditional and created BEFORE any adapter runs.
 */
export async function enqueueWrittenGrading(tx: Prisma.TransactionClient, attemptId: string, runtime: GradingRuntime = gradingRuntime()): Promise<void> {
  await lockAttempt(tx, attemptId);
  const a = await tx.assessmentAttempt.findUniqueOrThrow({ where: { id: attemptId }, select: {
    mode: true, track: true, status: true, submissionKey: true, isSyntheticFixture: true,
    capstoneBlueprint: { select: { slots: { select: { position: true, writtenPrompt: true } } } },
    responses: { select: { id: true, position: true, writtenJustification: true, scenario: { select: { rubricId: true, rubric: { select: { criteriaJson: true } } } } } },
  } });
  if (a.mode !== "CAPSTONE" || a.track !== "GENERALIST" || !a.isSyntheticFixture || !a.capstoneBlueprint
    || !["SUBMITTED", "GRADING", "PENDING_REVIEW", "EXPIRED"].includes(a.status)
    || (a.status !== "EXPIRED" && !a.submissionKey)) throw new Error("A frozen synthetic capstone is required.");
  const positions = a.capstoneBlueprint.slots.filter((s) => s.writtenPrompt !== null).map((s) => s.position);
  const responses = a.responses.filter((r) => positions.includes(r.position));
  await tx.reviewCase.upsert({ where: { attemptId }, update: {}, create: { attemptId, triggerReason: "ALPHA_SIGN_OFF", gradingReasons: ["ALPHA_SIGN_OFF"] } });
  // Legacy/incomplete assignments must never roll back server expiry or become a candidate failure.
  if (positions.length !== 3 || responses.length !== 3) {
    await tx.reviewCase.update({ where: { attemptId }, data: { triggerReason: "MALFORMED_JSON", gradingReasons: ["ALPHA_SIGN_OFF", "MALFORMED_JSON"] } });
    return;
  }
  for (const response of responses) {
    const rubricJson = response.scenario.rubric.criteriaJson as { written?: unknown } | null;
    const parsed = writtenInputSchema.safeParse({ rubric: writtenRubricSchema.safeParse(rubricJson?.written).data, candidateText: response.writtenJustification ?? "" });
    if (!parsed.success) {
      await tx.reviewCase.update({ where: { attemptId }, data: { triggerReason: "MALFORMED_JSON", gradingReasons: ["ALPHA_SIGN_OFF", "MALFORMED_JSON"] } });
      continue;
    }
    const input = parsed.data;
    const inputHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    for (const judgeSlot of [1, 2]) {
      await tx.aiGradingJob.upsert({ where: { responseId_judgeSlot: { responseId: response.id, judgeSlot } }, update: {},
        create: { responseId: response.id, rubricId: response.scenario.rubricId, judgeSlot,
          modelVersion: runtime.liveEnabled ? runtime.liveAdapter?.modelVersion ?? "unconfigured-live-provider" : FIXTURE_MODEL_VERSION,
          promptVersion: WRITTEN_PROMPT_VERSION, isSyntheticFixture: !runtime.liveEnabled, inputSnapshotJson: input, inputHash,
          dispatchKey: `written:${response.id}:${judgeSlot}:v1` } });
    }
  }
}

/** Preserve a terminal result and its immutable raw receipt atomically; terminal jobs are never rerun. */
async function completeJob(tx: Prisma.TransactionClient, job: ClaimedJob, outcome: JudgeOutcome) {
  const completedAt = await capstoneDatabaseNow(tx);
  await tx.aiGradingReceipt.create({ data: { jobId: job.id, attemptId: job.response.attemptId, responseId: job.responseId, judgeSlot: job.judgeSlot,
    rubricId: job.rubricId, modelVersion: job.modelVersion, promptVersion: job.promptVersion, inputHash: job.inputHash!, dispatchKey: job.dispatchKey!,
    isSyntheticFixture: job.isSyntheticFixture, status: outcome.status,
    rawVoteJson: outcome.rawVote === undefined ? Prisma.DbNull : outcome.rawVote === null ? Prisma.JsonNull : outcome.rawVote as Prisma.InputJsonValue,
    errorCode: outcome.errorCode, retryCount: job.retryCount, latencyMs: outcome.latencyMs, startedAt: job.startedAt!, completedAt } });
  await tx.aiGradingJob.update({ where: { id: job.id }, data: { status: outcome.status, completedAt, latencyMs: outcome.latencyMs,
    alignment: outcome.vote?.alignment, evidence: outcome.vote?.evidence, clarity: outcome.vote?.clarity, rationale: outcome.vote?.rationale, errorCode: outcome.errorCode } });
}

/** A single claim consumes the dispatch. Interrupted/ambiguous calls expire to human review rather than being billed again. */
async function claimJob(db: PrismaClient, attemptId: string, jobId: string): Promise<ClaimedJob | null> {
  return db.$transaction(async (tx) => {
    await lockAttempt(tx, attemptId);
    await tx.$queryRaw`SELECT "id" FROM "AiGradingJob" WHERE "id" = ${jobId} FOR UPDATE`;
    const job = await tx.aiGradingJob.findUnique({ where: { id: jobId }, include: { response: { select: { attemptId: true, position: true } } } });
    if (!job || job.response.attemptId !== attemptId || !job.inputHash || !job.dispatchKey || settled.has(job.status)) return null;
    const now = await capstoneDatabaseNow(tx);
    if (job.status === "RUNNING") {
      if (job.startedAt && now.getTime() - job.startedAt.getTime() >= LEASE_MS) {
        await completeJob(tx, job, { status: "TIMED_OUT", errorCode: "WORKER_INTERRUPTED", latencyMs: Math.min(2147483647, now.getTime() - job.startedAt.getTime()) });
      }
      return null;
    }
    return tx.aiGradingJob.update({ where: { id: jobId }, data: { status: "RUNNING", startedAt: now, claimToken: randomUUID() }, include: { response: { select: { attemptId: true, position: true } } } });
  });
}

/** Exact criterion comparison records ALL causes while preserving the sole owner's rubric-first fields. No final score is calculated here. */
export async function reconcileWrittenGrading(db: PrismaClient, attemptId: string): Promise<void> {
  await db.$transaction(async (tx) => {
    await lockAttempt(tx, attemptId);
    const review = await tx.reviewCase.findUniqueOrThrow({ where: { attemptId } });
    if (review.status === "FINALIZED") return;
    const jobs = await tx.aiGradingJob.findMany({ where: { response: { attemptId } }, orderBy: [{ responseId: "asc" }, { judgeSlot: "asc" }] });
    const reasons = new Set<ReviewTriggerReason>([...review.gradingReasons, "ALPHA_SIGN_OFF"]);
    for (const job of jobs) {
      if (job.status === "FAILED") reasons.add("API_FAILURE");
      if (job.status === "TIMED_OUT") reasons.add("TIMEOUT");
      if (job.status === "INVALID_OUTPUT") reasons.add("MALFORMED_JSON");
      if (job.judgeSlot !== 1 || job.status !== "SUCCEEDED") continue;
      const other = jobs.find((j) => j.responseId === job.responseId && j.judgeSlot === 2);
      if (other?.status !== "SUCCEEDED") continue;
      const vote = (j: typeof job) => writtenVoteSchema.parse({ alignment: j.alignment, evidence: j.evidence, clarity: j.clarity, rationale: j.rationale, demoLabel: "DEMO - SYNTHETIC" });
      if (!writtenVotesAgree(vote(job), vote(other))) reasons.add("JUDGE_DISAGREEMENT");
    }
    const priority: ReviewTriggerReason[] = ["MALFORMED_JSON", "TIMEOUT", "API_FAILURE", "JUDGE_DISAGREEMENT", "ALPHA_SIGN_OFF"];
    await tx.reviewCase.update({ where: { attemptId }, data: { triggerReason: priority.find((r) => reasons.has(r))!, gradingReasons: [...reasons] } });
  });
}

/**
 * Durable, idempotent worker entry point for after-response execution or a trusted operator retry.
 * Each judge receives an independent input copy. Repeated/concurrent workers neither duplicate calls nor reopen terminal votes.
 */
export async function processWrittenGrading(db: PrismaClient, attemptId: string, runtime: GradingRuntime = gradingRuntime()): Promise<void> {
  await db.$transaction((tx) => enqueueWrittenGrading(tx, attemptId, runtime));
  const ids = await db.aiGradingJob.findMany({ where: { response: { attemptId } }, select: { id: true }, orderBy: { id: "asc" } });
  for (const { id } of ids) {
    const job = await claimJob(db, attemptId, id);
    if (!job) continue;
    let outcome: JudgeOutcome;
    const input = writtenInputSchema.safeParse(job.inputSnapshotJson);
    if (!input.success) outcome = { status: "INVALID_OUTPUT", errorCode: "INVALID_FROZEN_INPUT", latencyMs: 0 };
    else outcome = await evaluateWrittenJudge(input.data, { isSyntheticFixture: job.isSyntheticFixture, modelVersion: job.modelVersion, promptVersion: job.promptVersion, position: job.response.position, dispatchKey: job.dispatchKey! }, runtime);
    await db.$transaction(async (tx) => {
      await lockAttempt(tx, attemptId);
      // Claim ownership is checked again after the adapter returns; a recovered timeout cannot be overwritten by a late vote.
      const current = await tx.aiGradingJob.findUniqueOrThrow({ where: { id } });
      if (current.status === "RUNNING" && current.claimToken === job.claimToken) await completeJob(tx, job, outcome);
    });
  }
  await reconcileWrittenGrading(db, attemptId);
}
