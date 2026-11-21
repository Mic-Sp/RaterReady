import "server-only";
import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { generalistPracticeCompetencies } from "../../lib/generalist-competencies";
import { legacyPracticeControls } from "../../lib/practice-controls";
import { evaluatePracticeScenario, practiceSubmissionSchema, PracticeEvaluationError } from "../domain/practice-scoring";

// Explicit pre-submission projection: keys, alternatives and expert coaching are not even selected.
const publicPracticeSelect = {
  id: true, familyId: true, family: { select: { code: true } }, version: true, title: true, difficulty: true, competencies: true,
  demoLabel: true, prompt: true, responseA: true, responseB: true, evidenceJson: true,
  rubric: { select: { id: true, code: true, version: true, criteriaJson: true } },
} as const satisfies Prisma.ScenarioSelect;
const eligiblePractice = { bank: "PRACTICE", status: "PUBLISHED", track: "GENERALIST", isSyntheticFixture: true } as const;
const evidenceSchema = z.object({ sources: z.array(z.object({ id: z.string(), text: z.string() })) });
const publicRubricSchema = z.object({
  deterministicWeights: z.object({ evaluationJudgment: z.literal(40), rubricApplication: z.literal(30), factualVerification: z.literal(25) }), writtenWeight: z.literal(5),
  practice: z.object({ description: z.string(), criteria: z.array(z.object({ id: z.string(), label: z.string(), options: z.array(z.object({ id: z.string(), label: z.string() })) })), verificationInstruction: z.string() }).optional(),
  written: z.object({ alignment: z.object({ min: z.literal(0), max: z.literal(2), description: z.string() }), evidence: z.object({ min: z.literal(0), max: z.literal(2), description: z.string() }), clarity: z.object({ min: z.literal(0), max: z.literal(1), description: z.string() }) }),
});

/**
 * Internal DAL for an already-guarded learner. Deep allowlists strip unknown JSON fields
 * as well as top-level secrets. No capstone/draft/diagnostic row can reach this projection.
 * Existing rubric-v1 scenarios stay readable; the new v2 catalog supplies explicit selection controls.
 */
export async function loadPracticeScenario(db: PrismaClient, candidateId: string, scenarioId: string) {
  const id = z.string().min(1).max(100).safeParse(scenarioId);
  if (!id.success) throw new PracticeEvaluationError("UNAVAILABLE");
  const scenario = await db.scenario.findFirst({ where: { id: id.data, ...eligiblePractice }, select: publicPracticeSelect });
  if (!scenario) throw new PracticeEvaluationError("UNAVAILABLE");
  const evidence = evidenceSchema.safeParse(scenario.evidenceJson);
  const rubric = publicRubricSchema.safeParse(scenario.rubric.criteriaJson);
  if (!evidence.success || !rubric.success) throw new PracticeEvaluationError("INVALID_CONFIGURATION");
  await db.scenarioExposure.upsert({ where: { candidateId_familyId: { candidateId, familyId: scenario.familyId } },
    create: { candidateId, familyId: scenario.familyId }, update: {} });
  return {
    id: scenario.id, familyId: scenario.familyId, version: scenario.version, title: scenario.title, difficulty: scenario.difficulty,
    competencies: scenario.competencies.map((code) => ({ code, title: generalistPracticeCompetencies[code] })),
    competencyDisclosure: "G1–G6 are RaterReady's internal Generalist competency identifiers, not an external industry standard.",
    demoLabel: "DEMO - SYNTHETIC" as const, prompt: scenario.prompt, responseA: scenario.responseA, responseB: scenario.responseB,
    evidence: evidence.data.sources,
    rubric: { id: scenario.rubric.id, code: scenario.rubric.code, version: scenario.rubric.version, ...rubric.data,
      practice: rubric.data.practice ?? legacyPracticeControls(scenario.family.code) },
  };
}

/**
 * Internal DAL for an already-guarded learner. Each practice retry is a new unfinalized
 * attempt; persist prose verbatim for review and keep written/final scores and pass unset.
 * Full keys are confined to this transaction and the evaluator; only safe feedback leaves it.
 */
export async function submitPracticeEvaluation(db: PrismaClient, candidateId: string, input: unknown) {
  const parsed = practiceSubmissionSchema.safeParse(input);
  if (!parsed.success) throw new PracticeEvaluationError("INVALID_SUBMISSION");
  const submission = parsed.data;
  return db.$transaction((tx) => persistPracticeEvaluation(tx, candidateId, submission));
}

/** Transaction-local evaluator shared by direct practice submissions and atomic draft-to-submit transitions. */
export async function persistPracticeEvaluation(tx: Prisma.TransactionClient, candidateId: string, submission: z.infer<typeof practiceSubmissionSchema>) {
    const scenario = await tx.scenario.findFirst({ where: { id: submission.scenarioId, ...eligiblePractice },
      select: { ...publicPracticeSelect, bank: true, status: true, track: true, isSyntheticFixture: true, answerKeyJson: true, allowedAlternativesJson: true, expertExplanation: true } });
    if (!scenario) throw new PracticeEvaluationError("UNAVAILABLE");
    const evaluation = evaluatePracticeScenario(scenario, submission);
    // A practice scoring attempt is created at submission. Use one trusted instant for
    // both timestamps so database clock/precision differences cannot invert their order.
    const submittedAt = new Date();
    const attempt = await tx.assessmentAttempt.create({ data: {
      candidateId, mode: "PRACTICE", track: "GENERALIST", level: scenario.difficulty, status: "SUBMITTED", startedAt: submittedAt, submittedAt, deterministicScore: evaluation.deterministicScore,
      responses: { create: { scenarioId: scenario.id, position: 1,
        selectionsJson: { judgment: submission.judgment, rubricSelections: submission.rubricSelections, verifiedSourceIds: submission.verifiedSourceIds },
        writtenJustification: submission.writtenJustification ?? null } },
    }, select: { id: true } });
    await tx.scenarioExposure.upsert({ where: { candidateId_familyId: { candidateId, familyId: scenario.familyId } }, create: { candidateId, familyId: scenario.familyId }, update: {} });
    // Submitting practice records participation only, regardless of score. It does not
    // finalize an assessment, issue a credential, or alter capstone readiness/eligibility.
    for (const competency of scenario.competencies) {
      await tx.practiceProgress.upsert({ where: { candidateId_competency_level: { candidateId, competency, level: scenario.difficulty } },
        create: { candidateId, competency, level: scenario.difficulty }, update: { submissionCount: { increment: 1 } } });
    }
    return { attemptId: attempt.id, ...evaluation };
}
