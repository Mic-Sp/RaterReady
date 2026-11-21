import "server-only";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { capstoneDraftResponseSchema, capstoneResponseComplete, type CapstoneDraftResponse } from "../../lib/capstone-responses";
import { capstoneDatabaseNow, lockCapstoneCandidate } from "./clock";
import { scoreCapstoneResponses } from "../domain/capstone-scoring";

const idSchema = z.string().min(1).max(100);
const metaSelect = {
  id: true, status: true, revision: true, startedAt: true, expiresAt: true, submittedAt: true, expiredAt: true, submissionKey: true,
  deterministicScore: true, capstoneBlueprintId: true, scoringPolicyId: true,
  capstoneBlueprint: { select: { code: true, version: true, scoringPolicyId: true, slots: { orderBy: { position: "asc" }, select: { position: true, competency: true, writtenPrompt: true } } } },
  scoringPolicy: { select: { id: true, version: true, evaluationJudgmentPoints: true, rubricApplicationPoints: true, factualVerificationPoints: true, writtenJustificationPoints: true, passingThreshold: true } },
  responses: { select: { position: true, savedAt: true } },
} as const satisfies Prisma.AssessmentAttemptSelect;
type Meta = Prisma.AssessmentAttemptGetPayload<{ select: typeof metaSelect }>;

// Deliberate deep allowlists: practice coaching, answer keys, alternatives and expert explanations never enter a workspace DTO.
const publicScenarioSelect = { id: true, version: true, title: true, prompt: true, responseA: true, responseB: true, bank: true, track: true, status: true, isSyntheticFixture: true,
  evidenceJson: true, rubric: { select: { code: true, version: true, criteriaJson: true } } } as const satisfies Prisma.ScenarioSelect;
const publicRubricSchema = z.object({
  practice: z.object({ criteria: z.array(z.object({ id: z.string(), label: z.string(), options: z.array(z.object({ id: z.enum(["A_ONLY", "B_ONLY", "BOTH_MEET", "NEITHER_MEETS"]), label: z.string() })) })).min(1).max(12) }),
  written: z.object({ alignment: z.object({ min: z.literal(0), max: z.literal(2), description: z.string() }), evidence: z.object({ min: z.literal(0), max: z.literal(2), description: z.string() }), clarity: z.object({ min: z.literal(0), max: z.literal(1), description: z.string() }) }),
});
const evidenceSchema = z.object({ sources: z.array(z.object({ id: z.string(), text: z.string() })) });

export type CapstoneSnapshot = { id: string; status: string; revision: number; serverNow: string; startedAt: string; expiresAt: string;
  savedAt: string | null; submittedAt: string | null; deterministicScore: number | null; blueprintVersion: number; scoringPolicyVersion: number };
export type CapstoneWorkspace = { snapshot: CapstoneSnapshot; slots: Awaited<ReturnType<typeof loadPublicSlots>> };
export type CapstoneMutationCode = "SAVED" | "SUBMITTED" | "CONFLICT" | "EXPIRED" | "LOCKED" | "INCOMPLETE" | "INVALID" | "CONFIRMATION" | "UNAVAILABLE";
export type CapstoneMutationResult = { ok: boolean; code: CapstoneMutationCode; snapshot: CapstoneSnapshot | null; incompletePositions?: number[] };

/** Unknown/other-owned/unpinned attempts share one unavailable behavior and cannot disclose scenario content. */
export class CapstoneWorkspaceError extends Error { constructor() { super("This capstone attempt is unavailable."); this.name = "CapstoneWorkspaceError"; } }

/** Freeze-state metadata only; no answer details or criterion-level correctness leave the scoring boundary. */
function snapshot(a: Meta, now: Date): CapstoneSnapshot {
  return { id: a.id, status: a.status, revision: a.revision, serverNow: now.toISOString(), startedAt: a.startedAt.toISOString(), expiresAt: a.expiresAt!.toISOString(),
    savedAt: a.revision > 0 && a.responses.length ? new Date(Math.max(...a.responses.map((r) => r.savedAt.getTime()))).toISOString() : null,
    submittedAt: a.submittedAt?.toISOString() ?? null, deterministicScore: a.deterministicScore?.toNumber() ?? null,
    blueprintVersion: a.capstoneBlueprint!.version, scoringPolicyVersion: a.scoringPolicy!.version };
}

/** Candidate then attempt row locks serialize read/save/submit; expiry observations commit as ordinary outcomes. */
async function lockedAttempt(tx: Prisma.TransactionClient, candidateId: string, attemptId: string) {
  await lockCapstoneCandidate(tx, candidateId);
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "AssessmentAttempt" WHERE "id" = ${attemptId} AND "candidateId" = ${candidateId} AND "mode" = 'CAPSTONE' AND "track" = 'GENERALIST' FOR UPDATE`;
  if (!rows.length) throw new CapstoneWorkspaceError();
  let a = await tx.assessmentAttempt.findFirst({ where: { id: attemptId, candidateId, mode: "CAPSTONE", track: "GENERALIST", isSyntheticFixture: true }, select: metaSelect });
  if (!a?.expiresAt || !a.capstoneBlueprint || !a.scoringPolicy || a.capstoneBlueprint.scoringPolicyId !== a.scoringPolicyId) throw new CapstoneWorkspaceError();
  const now = await capstoneDatabaseNow(tx);
  if (a.status === "IN_PROGRESS" && now >= a.expiresAt) a = await tx.assessmentAttempt.update({ where: { id: a.id }, data: { status: "EXPIRED", expiredAt: now }, select: metaSelect });
  return { a, now };
}

/** Owned assigned questions only, in immutable slot order; arbitrary private JSON fields are stripped recursively. */
async function loadPublicSlots(tx: Prisma.TransactionClient, a: Meta) {
  const rows = await tx.submissionResponse.findMany({ where: { attemptId: a.id }, orderBy: { position: "asc" },
    select: { position: true, selectionsJson: true, writtenJustification: true, scenario: { select: publicScenarioSelect } } });
  if (rows.length !== 6 || a.capstoneBlueprint!.slots.length !== 6) throw new CapstoneWorkspaceError();
  return rows.map((row, index) => {
    const slot = a.capstoneBlueprint!.slots[index];
    const s = row.scenario;
    if (row.position !== index + 1 || slot.position !== row.position || s.bank !== "CAPSTONE" || s.track !== "GENERALIST" || s.status !== "PUBLISHED" || !s.isSyntheticFixture) throw new CapstoneWorkspaceError();
    const rubric = publicRubricSchema.parse(s.rubric.criteriaJson);
    const evidence = evidenceSchema.parse(s.evidenceJson).sources;
    const selections = z.object({ judgment: capstoneDraftResponseSchema.shape.judgment,
      rubricSelections: capstoneDraftResponseSchema.shape.rubricSelections.default({}), verifiedSourceIds: capstoneDraftResponseSchema.shape.verifiedSourceIds.default([]) }).parse(row.selectionsJson);
    const draft = capstoneDraftResponseSchema.parse({ position: row.position, ...selections, writtenJustification: row.writtenJustification ?? "" });
    return { position: row.position, competency: slot.competency, writtenPrompt: slot.writtenPrompt,
      title: s.title, scenarioVersion: s.version, prompt: s.prompt, responseA: s.responseA, responseB: s.responseB, evidence,
      rubric: { code: s.rubric.code, version: s.rubric.version, criteria: rubric.practice.criteria, written: rubric.written }, draft };
  });
}

/** Candidate-authorized DAL: expired/submitted attempts return a question-free lock screen; every read rechecks PostgreSQL time. */
export async function loadCapstoneWorkspace(db: PrismaClient, candidateId: string, attemptId: string): Promise<CapstoneWorkspace> {
  idSchema.parse(attemptId);
  return db.$transaction(async (tx) => {
    const { a, now } = await lockedAttempt(tx, candidateId, attemptId);
    if (a.status !== "IN_PROGRESS") return { snapshot: snapshot(a, now), slots: [] };
    const slots = await loadPublicSlots(tx, a);
    const checkedAt = await capstoneDatabaseNow(tx);
    if (checkedAt >= a.expiresAt!) {
      const expired = await tx.assessmentAttempt.update({ where: { id: a.id }, data: { status: "EXPIRED", expiredAt: checkedAt }, select: metaSelect });
      return { snapshot: snapshot(expired, checkedAt), slots: [] };
    }
    return { snapshot: snapshot(a, checkedAt), slots };
  }, { timeout: 15000 });
}

/** Lightweight owned timer/status poll; no question data or client clock input is accepted. */
export async function getCapstoneSnapshot(db: PrismaClient, candidateId: string, attemptId: string): Promise<CapstoneSnapshot> {
  idSchema.parse(attemptId);
  return db.$transaction(async (tx) => { const { a, now } = await lockedAttempt(tx, candidateId, attemptId); return snapshot(a, now); }, { timeout: 15000 });
}

const saveSchema = z.object({ attemptId: idSchema, revision: z.number().int().nonnegative(), responses: z.array(capstoneDraftResponseSchema).length(6) }).strict();
const submitSchema = z.object({ attemptId: idSchema, revision: z.number().int().nonnegative(), confirmed: z.literal(true) }).strict();

/** Validate membership using only public controls; partial saves may omit judgments/ratings, but cannot inject criteria, sources or extra prose. */
function validDrafts(drafts: CapstoneDraftResponse[], slots: CapstoneWorkspace["slots"]): boolean {
  return drafts.every((r, index) => r.position === index + 1 && r.position === slots[index].position
    && Object.keys(r.rubricSelections).every((id) => slots[index].rubric.criteria.some((c) => c.id === id))
    && r.verifiedSourceIds.every((id) => slots[index].evidence.some((s) => s.id === id))
    && (slots[index].writtenPrompt !== null || r.writtenJustification === ""));
}

/** Rollback a crossing-deadline write, then persist expiry separately; no partially saved response set can survive the failed transaction. */
async function mutate(db: PrismaClient, candidateId: string, attemptId: string, operation: (tx: Prisma.TransactionClient) => Promise<CapstoneMutationResult>): Promise<CapstoneMutationResult> {
  try { return await db.$transaction(operation, { timeout: 15000 }); }
  catch {
    try {
      const current = await getCapstoneSnapshot(db, candidateId, attemptId);
      return { ok: false, code: current.status === "EXPIRED" ? "EXPIRED" : current.status !== "IN_PROGRESS" ? "LOCKED" : "UNAVAILABLE", snapshot: current };
    } catch { return { ok: false, code: "UNAVAILABLE", snapshot: null }; }
  }
}

/** Whole-attempt CAS autosave: one revision covers all six slots; stale tabs never merge over newer server work. */
export async function saveCapstoneDraft(db: PrismaClient, candidateId: string, input: unknown): Promise<CapstoneMutationResult> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID", snapshot: null };
  const data = parsed.data;
  return mutate(db, candidateId, data.attemptId, async (tx) => {
    const { a, now } = await lockedAttempt(tx, candidateId, data.attemptId);
    const current = snapshot(a, now);
    if (a.status !== "IN_PROGRESS") return { ok: false, code: a.status === "EXPIRED" ? "EXPIRED" : "LOCKED", snapshot: current };
    if (a.revision !== data.revision) return { ok: false, code: "CONFLICT", snapshot: current };
    const slots = await loadPublicSlots(tx, a);
    const drafts = [...data.responses].sort((l, r) => l.position - r.position);
    if (!validDrafts(drafts, slots)) return { ok: false, code: "INVALID", snapshot: current };
    const savedAt = await capstoneDatabaseNow(tx);
    if (savedAt >= a.expiresAt!) { await tx.assessmentAttempt.update({ where: { id: a.id }, data: { status: "EXPIRED", expiredAt: savedAt } }); return { ok: false, code: "EXPIRED", snapshot: { ...current, status: "EXPIRED", serverNow: savedAt.toISOString() } }; }
    const changed = await tx.assessmentAttempt.updateMany({ where: { id: a.id, candidateId, revision: data.revision, status: "IN_PROGRESS", expiresAt: { gt: savedAt } }, data: { revision: { increment: 1 } } });
    if (changed.count !== 1) return { ok: false, code: "CONFLICT", snapshot: current };
    for (const response of drafts) {
      const { position, writtenJustification, judgment, rubricSelections, verifiedSourceIds } = response;
      const selections = { ...(judgment ? { judgment } : {}), rubricSelections, verifiedSourceIds };
      await tx.submissionResponse.update({ where: { attemptId_position: { attemptId: a.id, position } }, data: { selectionsJson: selections, writtenJustification: slots[position - 1].writtenPrompt ? writtenJustification : null, revision: { increment: 1 }, savedAt } });
    }
    const checkedAt = await capstoneDatabaseNow(tx);
    if (checkedAt >= a.expiresAt!) throw new Error("Capstone deadline crossed during save.");
    return { ok: true, code: "SAVED", snapshot: { ...current, revision: a.revision + 1, savedAt: savedAt.toISOString(), serverNow: checkedAt.toISOString() } };
  });
}

/**
 * Confirmation finalizes the saved response snapshot, not posted answers/scores. Private keys
 * exist only inside this transaction. A stable server idempotency key makes retries return
 * the original receipt without rescoring, even after the original exam deadline.
 */
export async function submitCapstoneAttempt(db: PrismaClient, candidateId: string, input: unknown): Promise<CapstoneMutationResult> {
  const parsed = submitSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "CONFIRMATION", snapshot: null };
  const data = parsed.data;
  return mutate(db, candidateId, data.attemptId, async (tx) => {
    const { a, now } = await lockedAttempt(tx, candidateId, data.attemptId);
    const current = snapshot(a, now);
    if (a.submissionKey && a.submittedAt && a.status !== "IN_PROGRESS" && a.status !== "EXPIRED") return { ok: true, code: "SUBMITTED", snapshot: current };
    if (a.status !== "IN_PROGRESS") return { ok: false, code: a.status === "EXPIRED" ? "EXPIRED" : "LOCKED", snapshot: current };
    if (a.revision !== data.revision) return { ok: false, code: "CONFLICT", snapshot: current };
    const slots = await loadPublicSlots(tx, a);
    const incompletePositions = slots.filter((s) => !capstoneResponseComplete(s.draft, s.rubric.criteria.map((c) => c.id), Boolean(s.writtenPrompt))).map((s) => s.position);
    if (incompletePositions.length) return { ok: false, code: "INCOMPLETE", snapshot: current, incompletePositions };
    // Private grading projection is confined to final submission and never shared with the public loader.
    const responses = await tx.submissionResponse.findMany({ where: { attemptId: a.id }, orderBy: { position: "asc" },
      select: { position: true, scenario: { select: { id: true, version: true, bank: true, status: true, track: true, isSyntheticFixture: true,
        answerKeyJson: true, allowedAlternativesJson: true, evidenceJson: true, rubric: { select: { id: true, version: true, criteriaJson: true } } } } } });
    const p = a.scoringPolicy!;
    const deterministicScore = scoreCapstoneResponses(responses.map((r) => { const { position: _position, ...answer } = slots[r.position - 1].draft; void _position;
      return { position: r.position, scenario: r.scenario, submission: { scenarioId: r.scenario.id, scenarioVersion: r.scenario.version, rubricVersion: r.scenario.rubric.version, ...answer } }; }),
      { ...p, passingThreshold: p.passingThreshold.toNumber() });
    const submittedAt = await capstoneDatabaseNow(tx);
    if (submittedAt >= a.expiresAt!) { await tx.assessmentAttempt.update({ where: { id: a.id }, data: { status: "EXPIRED", expiredAt: submittedAt } }); return { ok: false, code: "EXPIRED", snapshot: { ...current, status: "EXPIRED", serverNow: submittedAt.toISOString() } }; }
    await tx.assessmentAttempt.update({ where: { id: a.id }, data: { status: "PENDING_REVIEW", submittedAt, submissionKey: `capstone:${a.id}`, deterministicScore,
      writtenScore: null, finalScore: null, passed: null, revision: { increment: 1 } } });
    return { ok: true, code: "SUBMITTED", snapshot: { ...current, status: "PENDING_REVIEW", revision: a.revision + 1, serverNow: submittedAt.toISOString(), submittedAt: submittedAt.toISOString(), deterministicScore } };
  });
}
