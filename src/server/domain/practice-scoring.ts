import "server-only";
import { z } from "zod";

const judgment = z.enum(["A_BETTER", "B_BETTER", "TIE", "BOTH_UNACCEPTABLE"]);
const rating = z.enum(["A_ONLY", "B_ONLY", "BOTH_MEET", "NEITHER_MEETS"]);
const selections = z.record(z.string().min(1).max(64), rating).refine((items) => Object.keys(items).length > 0 && Object.keys(items).length <= 12);
const sourceIds = z.array(z.string().min(1).max(100)).max(30);
const keySchema = z.object({ judgment, rubricSelections: selections, verifiedSourceIds: sourceIds }).strict();
const alternativesSchema = z.array(keySchema.extend({
  // Stage A owner approvals are explicitly synthetic fixtures, never inferred from candidate prose.
  approvedByAccountCode: z.literal("admin-michael"), approvedAt: z.iso.datetime(),
  isSyntheticFixture: z.literal(true), demoLabel: z.literal("DEMO - SYNTHETIC"), rationale: z.string().trim().min(1).max(4000),
}).strict()).max(20);

/** Bounded structured inputs only. Written prose is retained verbatim and is never matched against a key. */
export const practiceSubmissionSchema = z.object({
  scenarioId: z.string().min(1).max(100), scenarioVersion: z.number().int().positive(), rubricVersion: z.number().int().positive(),
  judgment, rubricSelections: selections, verifiedSourceIds: sourceIds,
  writtenJustification: z.string().max(12000).optional(),
}).strict();
export type PracticeSubmission = z.infer<typeof practiceSubmissionSchema>;

/** Internal server input, never a DTO or a permissible client/RSC payload. */
export type PracticeScoringScenario = {
  id: string; version: number; bank: string; status: string; track: string; isSyntheticFixture: boolean;
  answerKeyJson: unknown; allowedAlternativesJson: unknown; expertExplanation: string; evidenceJson: unknown;
  rubric: { id: string; version: number; criteriaJson: unknown };
};

/** Safe error category: malformed fixture data must not become a zero score or expose private JSON. */
export class PracticeEvaluationError extends Error {
  constructor(public readonly code: "UNAVAILABLE" | "INVALID_SUBMISSION" | "STALE_VERSION" | "INVALID_CONFIGURATION") {
    super(code === "INVALID_SUBMISSION" ? "Check the structured practice responses." : "This practice evaluation is unavailable. Reload the practice scenario.");
    this.name = "PracticeEvaluationError";
  }
}

/** Only published synthetic practice in Generalist/Technical Preview is eligible; reject other contexts before inspecting keys. */
export function assertPracticeScenario(scenario: Pick<PracticeScoringScenario, "bank" | "status" | "track" | "isSyntheticFixture">): void {
  if (scenario.bank !== "PRACTICE" || scenario.status !== "PUBLISHED"
    || !["GENERALIST", "TECHNICAL_PREVIEW"].includes(scenario.track) || !scenario.isSyntheticFixture) {
    throw new PracticeEvaluationError("UNAVAILABLE");
  }
}

/** Compare identifier sets rather than array order; duplicate/reordered evidence IDs never change credit. */
function sameSources(left: string[], right: string[]): boolean {
  const a = new Set(left);
  const b = new Set(right);
  return a.size === b.size && [...a].every((id) => b.has(id));
}

/**
 * Pure deterministic practice evaluator. Evaluate one coherent approved key at a time,
 * never mixing rubric/evidence fragments from incompatible alternative interpretations.
 * Approved judgments always earn all 40 judgment points; other structured errors remain visible.
 * Prose receives no automatic points, pass/fail decision or certification result.
 */
export function evaluatePracticeScenario(scenario: PracticeScoringScenario, rawSubmission: unknown) {
  assertPracticeScenario(scenario);
  if (!scenario.expertExplanation.trim()) throw new PracticeEvaluationError("INVALID_CONFIGURATION");
  const { submission, best, matchingJudgments, criterionIds, acceptedJudgments } = scorePinnedStructuredResponse(scenario, rawSubmission);
  return {
    scenarioId: scenario.id, scenarioVersion: scenario.version, rubricId: scenario.rubric.id, rubricVersion: scenario.rubric.version,
    demoLabel: "DEMO - SYNTHETIC" as const, certifying: false as const,
    deterministicScore: best.score, deterministicMax: 95 as const, writtenScore: null, finalScore: null,
    writtenReviewStatus: submission.writtenJustification?.length ? "AWAITING_PRACTICE_REVIEW" as const : "NOT_PROVIDED" as const,
    breakdown: { evaluationJudgment: { earned: best.judgmentPoints, maximum: 40 }, rubricApplication: { earned: best.rubricPoints, maximum: 30 }, factualVerification: { earned: best.verificationPoints, maximum: 25 } },
    feedback: {
      // Post-submission practice feedback exposes choice identifiers only, never complete keys or approval records.
      submittedJudgment: submission.judgment,
      acceptedJudgments,
      judgmentAccepted: matchingJudgments.length > 0,
      approvedAlternativeUsed: matchingJudgments.length > 0 && best.alternativeExplanation !== null,
      alternativeExplanation: matchingJudgments.length > 0 ? best.alternativeExplanation : null,
      expertExplanation: scenario.expertExplanation,
      rubricCriteria: criterionIds.map((id) => ({ id, aligned: best.matchedCriteria.includes(id) })),
      verificationAligned: best.verificationPoints === 25,
      reviewGuidance: "Review the pinned rubric and supplied evidence. Written justifications are accepted for practice review without automatic prose scoring.",
    },
  };
}

/**
 * Internal scoring primitive shared by bank-guarded practice/capstone evaluators. Its result
 * contains private comparison details and MUST NOT be returned by a capstone endpoint.
 * Callers enforce their bank, ownership, pins and lifecycle before invoking this function.
 */
export function scorePinnedStructuredResponse(scenario: Pick<PracticeScoringScenario, "id" | "version" | "rubric" | "answerKeyJson" | "allowedAlternativesJson" | "evidenceJson">, rawSubmission: unknown) {
  const parsed = practiceSubmissionSchema.safeParse(rawSubmission);
  if (!parsed.success) throw new PracticeEvaluationError("INVALID_SUBMISSION");
  const submission = parsed.data;
  if (submission.scenarioId !== scenario.id || submission.scenarioVersion !== scenario.version || submission.rubricVersion !== scenario.rubric.version) {
    throw new PracticeEvaluationError("STALE_VERSION");
  }
  const primary = keySchema.safeParse(scenario.answerKeyJson);
  const alternatives = alternativesSchema.safeParse(scenario.allowedAlternativesJson);
  const rubric = z.object({ deterministicWeights: z.object({ evaluationJudgment: z.literal(40), rubricApplication: z.literal(30), factualVerification: z.literal(25) }), writtenWeight: z.literal(5) }).safeParse(scenario.rubric.criteriaJson);
  if (!primary.success || !alternatives.success || !rubric.success) {
    throw new PracticeEvaluationError("INVALID_CONFIGURATION");
  }
  const evidence = z.object({ sources: z.array(z.object({ id: z.string().min(1) })) }).safeParse(scenario.evidenceJson);
  if (!evidence.success || [primary.data, ...alternatives.data].some((key) => key.verifiedSourceIds.some((id) => !evidence.data.sources.some((source) => source.id === id)))) {
    throw new PracticeEvaluationError("INVALID_CONFIGURATION");
  }
  const criterionIds = Object.keys(primary.data.rubricSelections).sort();
  if (alternatives.data.some((key) => !sameSources(Object.keys(key.rubricSelections), criterionIds))) {
    throw new PracticeEvaluationError("INVALID_CONFIGURATION");
  }
  if (!sameSources(Object.keys(submission.rubricSelections), criterionIds)) {
    throw new PracticeEvaluationError("INVALID_SUBMISSION");
  }
  const paths = [{ key: primary.data, alternativeExplanation: null as string | null },
    ...alternatives.data.map((key) => ({ key, alternativeExplanation: key.rationale }))];
  const matchingJudgments = paths.filter(({ key }) => key.judgment === submission.judgment);
  // Restrict to matching judgments first. A wrong-judgment path with better other
  // dimensions must never remove the 40 points owed to a human-approved alternative.
  const eligible = matchingJudgments.length ? matchingJudgments : paths;
  const evaluated = eligible.map(({ key, alternativeExplanation }) => {
    const matchedCriteria = criterionIds.filter((id) => submission.rubricSelections[id] === key.rubricSelections[id]);
    const judgmentPoints = key.judgment === submission.judgment ? 40 : 0;
    const rubricPoints = Math.round(30 * matchedCriteria.length / criterionIds.length * 100) / 100;
    const verificationPoints = sameSources(submission.verifiedSourceIds, key.verifiedSourceIds) ? 25 : 0;
    return { judgmentPoints, rubricPoints, verificationPoints, matchedCriteria, alternativeExplanation,
      score: judgmentPoints + rubricPoints + verificationPoints };
  });
  const best = evaluated.reduce((left, right) => right.score > left.score ? right : left);
  return { submission, best, matchingJudgments, criterionIds, acceptedJudgments: [...new Set(paths.map(({ key }) => key.judgment))] };
}
