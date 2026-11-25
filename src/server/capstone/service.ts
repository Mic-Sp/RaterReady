import "server-only";
import { enqueueWrittenGrading } from "../ai/written-grading";
import { Prisma, type PrismaClient, type Competency } from "@prisma/client";
import { z } from "zod";
import { calculateCapstoneDeadline, capstoneCooldownUntil, decideCapstoneReadiness, isCapstoneExpired, type CapstoneReadinessKind } from "../domain/capstone-timer";
import { capstoneDatabaseNow as databaseNow, lockCapstoneCandidate } from "./clock";
import type { FinalizedCapstoneResult } from "../../lib/capstone-results";
import { appealSelect, appealOrder } from "../appeals/projection";
import { effectiveResult } from "../domain/effective-result";

const competencies: Competency[] = ["G1", "G2", "G3", "G4", "G5", "G6"];
const blueprintCode = "demo-generalist-capstone";
// Only allocation metadata is read. This lifecycle module never selects prompts, responses, keys, alternatives or explanations.
const blueprintSelect = {
  id: true, code: true, version: true, title: true, status: true, scoringPolicyId: true, baseDurationSeconds: true,
  retakeCooldownHours: true, requireGeneralistPractice: true, independentWorkPolicyVersion: true, independentWorkRulesJson: true,
  scoringPolicy: { select: { id: true, code: true, version: true, evaluationJudgmentPoints: true, rubricApplicationPoints: true,
    factualVerificationPoints: true, writtenJustificationPoints: true, passingThreshold: true } },
  slots: { orderBy: { position: "asc" }, select: { position: true, competency: true, writtenPrompt: true,
    pool: { select: { scenario: { select: { id: true, familyId: true, bank: true, track: true, status: true, isSyntheticFixture: true, competencies: true } } }, orderBy: { scenarioId: "asc" } } } },
} as const satisfies Prisma.CapstoneBlueprintSelect;
type Blueprint = Prisma.CapstoneBlueprintGetPayload<{ select: typeof blueprintSelect }>;
const attemptSelect = { id: true, status: true, startedAt: true, expiresAt: true, expiredAt: true, appliedTimeMultiplier: true,
  independentWorkAcknowledgedAt: true, independentWorkPolicyVersion: true, capstoneBlueprintId: true, scoringPolicyId: true, finalizedAt: true, passed: true,
  deterministicScore: true, writtenScore: true, finalScore: true,
  appeals: { select: appealSelect, orderBy: [...appealOrder] },
  capstoneBlueprint: { select: { retakeCooldownHours: true } } } as const satisfies Prisma.AssessmentAttemptSelect;
type Attempt = Prisma.AssessmentAttemptGetPayload<{ select: typeof attemptSelect }>;

export type CapstoneReadiness = {
  kind: CapstoneReadinessKind; serverNow: string; timeMultiplier: number; grantedSeconds: number | null;
  practiced: Competency[]; missingPractice: Competency[]; remainingForms: number; cooldownUntil: string | null;
  blueprint: { id: string; code: string; version: number; title: string; baseDurationSeconds: number; retakeCooldownHours: number;
    requireGeneralistPractice: boolean; questionCount: number; writtenPromptCount: number; independentWorkPolicyVersion: string; rules: string[];
    scoringPolicy: { code: string; version: number; passingThreshold: number; judgment: number; rubric: number; verification: number; written: number } } | null;
  attempt: { id: string; status: string; startedAt: string; expiresAt: string; acknowledgedAt: string; appliedTimeMultiplier: number;
    remainingSeconds: number; blueprintVersion: number; scoringPolicyVersion: number } | null;
  lastExpiredAt: string | null;
  latestFinalized?: FinalizedCapstoneResult | null;
};

/** Safe action failure categories; no database or private scenario content is reflected to a learner. */
export class CapstonePolicyError extends Error {
  constructor(public readonly reason: CapstoneReadinessKind | "ACKNOWLEDGMENT" | "STALE_POLICY") {
    super(reason === "ACKNOWLEDGMENT" ? "Read and acknowledge the Independent-Work Policy before starting."
      : reason === "EMAIL_UNVERIFIED" ? "Verify your email before starting a timed Generalist Qualification Exam. Learning and untimed practice remain available."
      : reason === "STALE_POLICY" ? "The capstone policy changed. Reload the readiness screen and read the current policy."
      : "A new capstone cannot start in the current readiness state. Review the server-confirmed status below.");
    this.name = "CapstonePolicyError";
  }
}

/** Validate published pins before allocation, so malformed configuration fails closed rather than creating a broken exam. */
function validBlueprint(blueprint: Blueprint): boolean {
  const p = blueprint.scoringPolicy;
  return ["PUBLISHED", "RETIRED"].includes(blueprint.status) && blueprint.slots.length === 6
    && blueprint.slots.every((slot, index) => slot.position === index + 1 && slot.competency === competencies[index] && slot.pool.length > 0
      && slot.pool.every(({ scenario }) => scenario.bank === "CAPSTONE" && scenario.track === "GENERALIST" && scenario.status === "PUBLISHED"
        && scenario.isSyntheticFixture && scenario.competencies.includes(slot.competency)))
    && blueprint.slots.filter((slot) => slot.writtenPrompt !== null).length === 3
    && p.evaluationJudgmentPoints === 40 && p.rubricApplicationPoints === 30 && p.factualVerificationPoints === 25
    && p.writtenJustificationPoints === 5 && p.passingThreshold.toNumber() === 85;
}

/** Closed DTO conversion: pool membership and even unsubmitted question text stay on the server. */
function publicBlueprint(b: Blueprint): NonNullable<CapstoneReadiness["blueprint"]> {
  const p = b.scoringPolicy;
  return { id: b.id, code: b.code, version: b.version, title: b.title, baseDurationSeconds: b.baseDurationSeconds, retakeCooldownHours: b.retakeCooldownHours,
    requireGeneralistPractice: b.requireGeneralistPractice, questionCount: b.slots.length, writtenPromptCount: b.slots.filter((slot) => slot.writtenPrompt).length,
    independentWorkPolicyVersion: b.independentWorkPolicyVersion, rules: z.array(z.string().min(1)).min(1).parse(b.independentWorkRulesJson),
    scoringPolicy: { code: p.code, version: p.version, passingThreshold: p.passingThreshold.toNumber(), judgment: p.evaluationJudgmentPoints,
      rubric: p.rubricApplicationPoints, verification: p.factualVerificationPoints, written: p.writtenJustificationPoints } };
}

/** Existing attempts retain their original multiplier and deadline even when profile settings or the current blueprint change. */
function publicAttempt(a: Attempt, b: Blueprint, now: Date): NonNullable<CapstoneReadiness["attempt"]> {
  return { id: a.id, status: a.status, startedAt: a.startedAt.toISOString(), expiresAt: a.expiresAt!.toISOString(),
    acknowledgedAt: a.independentWorkAcknowledgedAt!.toISOString(), appliedTimeMultiplier: a.appliedTimeMultiplier,
    remainingSeconds: Math.max(0, Math.ceil((a.expiresAt!.getTime() - now.getTime()) / 1000)), blueprintVersion: b.version, scoringPolicyVersion: b.scoringPolicy.version };
}

/** Lock order is shared by start/read/resume. Expiry writes commit even when a later start is denied by cooldown. */
async function loadLockedState(tx: Prisma.TransactionClient, candidateId: string) {
  const profile = await lockCapstoneCandidate(tx, candidateId);
  const now = await databaseNow(tx);
  const expiring = await tx.assessmentAttempt.findMany({ where: { candidateId, mode: "CAPSTONE", track: "GENERALIST", capstoneBlueprintId: { not: null }, status: "IN_PROGRESS", expiresAt: { lte: now } }, select: { id: true } });
  await tx.assessmentAttempt.updateMany({ where: { candidateId, mode: "CAPSTONE", status: "IN_PROGRESS", expiresAt: { lte: now } }, data: { status: "EXPIRED", expiredAt: now } });
  for (const attempt of expiring) await enqueueWrittenGrading(tx, attempt.id);
  const records = await tx.assessmentAttempt.findMany({ where: { candidateId, mode: "CAPSTONE", track: "GENERALIST" }, orderBy: { startedAt: "desc" }, select: attemptSelect });
  // All readiness/pass/cooldown decisions use resolved revisions; the original stored grade remains immutable evidence.
  const attempts = records.map((a) => { const result = effectiveResult(a); return a.status === "FINALIZED" ? { ...a,
    deterministicScore: result.deterministicScore === null ? null : new Prisma.Decimal(result.deterministicScore),
    writtenScore: result.writtenScore === null ? null : new Prisma.Decimal(result.writtenScore), finalScore: result.finalScore === null ? null : new Prisma.Decimal(result.finalScore), passed: result.passed } : a; });
  const active = attempts.find((a) => a.status === "IN_PROGRESS" && a.expiresAt && !isCapstoneExpired(a.expiresAt, now));
  const blueprint = active?.capstoneBlueprintId
    ? await tx.capstoneBlueprint.findUnique({ where: { id: active.capstoneBlueprintId }, select: blueprintSelect })
    : await tx.capstoneBlueprint.findFirst({ where: { code: blueprintCode, status: "PUBLISHED", track: "GENERALIST", isSyntheticFixture: true }, orderBy: { version: "desc" }, select: blueprintSelect });
  // Check actual Generalist submissions, not diagnostic scores, self-marked lessons or client progress flags.
  const practice = await tx.submissionResponse.findMany({ where: { attempt: { candidateId, mode: "PRACTICE", track: "GENERALIST", status: { in: ["SUBMITTED", "FINALIZED"] } },
    scenario: { bank: "PRACTICE", track: "GENERALIST", isSyntheticFixture: true } }, select: { scenario: { select: { competencies: true } } } });
  const practiced = competencies.filter((code) => practice.some((response) => response.scenario.competencies.includes(code)));
  const exposures = await tx.scenarioExposure.findMany({ where: { candidateId }, select: { familyId: true } });
  const used = new Set(exposures.map((row) => row.familyId));
  const available = blueprint?.slots.map((slot) => ({ position: slot.position, scenarios: slot.pool.map((item) => item.scenario).filter((s) => !used.has(s.familyId)) })) ?? [];
  const remainingForms = available.length === 6 ? Math.min(...available.map((slot) => new Set(slot.scenarios.map((s) => s.familyId)).size)) : 0;
  const cooldown = capstoneCooldownUntil(attempts.map((a) => ({ ...a, cooldownHours: a.capstoneBlueprint?.retakeCooldownHours ?? blueprint?.retakeCooldownHours ?? 48 })), now);
  const finalized = attempts.find((a) => a.status === "FINALIZED" && a.finalizedAt && a.deterministicScore !== null && a.writtenScore !== null && a.finalScore !== null && a.passed !== null);
  const view: CapstoneReadiness = { kind: "UNAVAILABLE", serverNow: now.toISOString(), timeMultiplier: profile.timeMultiplier, grantedSeconds: null,
    practiced, missingPractice: competencies.filter((code) => !practiced.includes(code)), remainingForms, cooldownUntil: cooldown?.toISOString() ?? null,
    blueprint: null, attempt: null, lastExpiredAt: attempts.find((a) => a.status === "EXPIRED")?.expiresAt?.toISOString() ?? null,
    latestFinalized: finalized ? { attemptId: finalized.id, deterministicScore: finalized.deterministicScore!.toNumber(), writtenScore: finalized.writtenScore!.toNumber(),
      finalScore: finalized.finalScore!.toNumber(), passed: finalized.passed!, finalizedAt: finalized.finalizedAt!.toISOString(),
      retakeAvailableAfter: finalized.passed ? null : new Date(finalized.finalizedAt!.getTime() + (finalized.capstoneBlueprint?.retakeCooldownHours ?? 48) * 3600000).toISOString() } : null };
  if (blueprint && validBlueprint(blueprint) && (!active || (active.capstoneBlueprintId === blueprint.id && active.scoringPolicyId === blueprint.scoringPolicyId))) {
    try {
      view.blueprint = publicBlueprint(blueprint);
      const multiplier = active?.appliedTimeMultiplier ?? profile.timeMultiplier;
      view.grantedSeconds = (calculateCapstoneDeadline(now, blueprint.baseDurationSeconds, multiplier).getTime() - now.getTime()) / 1000;
      view.kind = decideCapstoneReadiness({ active: Boolean(active), pendingReview: attempts.some((a) => ["SUBMITTED", "GRADING", "PENDING_REVIEW"].includes(a.status)),
        passed: attempts.some((a) => a.status === "FINALIZED" && a.passed === true), cooldown: Boolean(cooldown),
        missingPractice: blueprint.requireGeneralistPractice && view.missingPractice.length > 0, remainingForms });
      if (active?.capstoneBlueprintId) view.attempt = publicAttempt(active, blueprint, now);
    } catch { view.kind = "UNAVAILABLE"; view.blueprint = null; view.attempt = null; }
  }
  // Verification gates NEW live timed attempts only. Existing timers remain resumable;
  // synthetic demo accounts keep their pre-verified behavior and all other policies remain pinned.
  if (!active && !profile.user.isSyntheticFixture && !profile.user.emailVerifiedAt) view.kind = "EMAIL_UNVERIFIED";
  return { view, blueprint, available, profile };
}

/** Candidate-authorized DAL: each read/resume lazily persists expiry under a database row lock; returns metadata only. */
export async function getCapstoneReadiness(db: PrismaClient, candidateId: string): Promise<CapstoneReadiness> {
  return db.$transaction(async (tx) => (await loadLockedState(tx, candidateId)).view, { timeout: 15000 });
}

const startSchema = z.object({ acknowledged: z.literal(true), blueprintId: z.string().min(1), blueprintVersion: z.number().int().positive(),
  scoringPolicyVersion: z.number().int().positive(), independentWorkPolicyVersion: z.string().min(1) }).strict();

/**
 * Candidate-authorized DAL. Reserve fresh families, pinned blank responses and one server deadline atomically.
 * Duplicate starts return the same active attempt; neither a retry nor resume resets the timer or acknowledgment.
 */
export async function startCapstoneAttempt(db: PrismaClient, candidateId: string, input: unknown): Promise<CapstoneReadiness> {
  const parsed = startSchema.safeParse(input);
  if (!parsed.success) throw new CapstonePolicyError("ACKNOWLEDGMENT");
  const outcome = await db.$transaction(async (tx) => {
    const state = await loadLockedState(tx, candidateId);
    const { view, blueprint } = state;
    if (view.kind === "EMAIL_UNVERIFIED") return { view, error: "EMAIL_UNVERIFIED" as const };
    if (!blueprint || !view.blueprint || parsed.data.blueprintId !== blueprint.id || parsed.data.blueprintVersion !== blueprint.version
      || parsed.data.scoringPolicyVersion !== blueprint.scoringPolicy.version || parsed.data.independentWorkPolicyVersion !== blueprint.independentWorkPolicyVersion) {
      return { view, error: "STALE_POLICY" as const };
    }
    if (view.kind === "ACTIVE") return { view, error: null };
    if (view.kind !== "READY") return { view, error: view.kind };
    const startedAt = await databaseNow(tx);
    const expiresAt = calculateCapstoneDeadline(startedAt, blueprint.baseDurationSeconds, state.profile.timeMultiplier);
    const assigned = state.available.map((slot) => ({ position: slot.position, scenario: slot.scenarios[0] }));
    if (new Set(assigned.map((item) => item.scenario.familyId)).size !== 6) return { view, error: "UNAVAILABLE" as const };
    const attempt = await tx.assessmentAttempt.create({ data: { candidateId, mode: "CAPSTONE", track: "GENERALIST", level: state.profile.selectedLevel,
      status: "IN_PROGRESS", capstoneBlueprintId: blueprint.id, scoringPolicyId: blueprint.scoringPolicyId, startedAt, expiresAt,
      independentWorkAcknowledgedAt: startedAt, independentWorkPolicyVersion: blueprint.independentWorkPolicyVersion, appliedTimeMultiplier: state.profile.timeMultiplier }, select: attemptSelect });
    await tx.submissionResponse.createMany({ data: assigned.map((item) => ({ attemptId: attempt.id, scenarioId: item.scenario.id, position: item.position })) });
    await tx.scenarioExposure.createMany({ data: assigned.map((item) => ({ candidateId, familyId: item.scenario.familyId, firstSeenAt: startedAt })) });
    return { view: { ...view, kind: "ACTIVE" as const, serverNow: startedAt.toISOString(), remainingForms: Math.max(0, view.remainingForms - 1), attempt: publicAttempt(attempt, blueprint, startedAt) }, error: null };
  }, { timeout: 15000 });
  // Expected denials happen after the transaction commits, preserving automatic expiry observations.
  if (outcome.error) throw new CapstonePolicyError(outcome.error);
  return outcome.view;
}

/** Resume only this learner's active unexpired attempt. There is no client-supplied attempt ID, clock or deadline. */
export async function resumeCapstoneAttempt(db: PrismaClient, candidateId: string): Promise<CapstoneReadiness> {
  const view = await getCapstoneReadiness(db, candidateId);
  if (view.kind !== "ACTIVE") throw new CapstonePolicyError(view.kind);
  return view;
}
