import "server-only";
import type { Prisma } from "@prisma/client";
import { appealOrder } from "../appeals/projection";
import { effectiveResult } from "../domain/effective-result";

export const practiceWhere = { mode: "PRACTICE", track: "GENERALIST", status: { in: ["SUBMITTED", "FINALIZED"] } } satisfies Prisma.AssessmentAttemptWhereInput;
export const examWhere = { mode: "CAPSTONE", track: "GENERALIST", isSyntheticFixture: true,
  capstoneBlueprintId: { not: null }, scoringPolicyId: { not: null } } satisfies Prisma.AssessmentAttemptWhereInput;

export const learningAttemptSelect = {
  mode: true, status: true, startedAt: true, expiresAt: true, submittedAt: true, finalizedAt: true,
  deterministicScore: true, writtenScore: true, finalScore: true, reviewCase: { select: { status: true } },
  appeals: { where: { status: "RESOLVED", disposition: "ADJUSTED" }, orderBy: [...appealOrder], take: 1, select: {
    status: true, disposition: true, resolvedDeterministicScore: true, resolvedWrittenScore: true, resolvedFinalScore: true,
  } },
  responses: { where: { scenario: { bank: "PRACTICE", track: "GENERALIST", isSyntheticFixture: true } },
    select: { scenario: { select: { competencies: true } } } },
} as const satisfies Prisma.AssessmentAttemptSelect;

type LearningAttempt = Prisma.AssessmentAttemptGetPayload<{ select: typeof learningAttemptSelect }>;

/** Use the same persisted Generalist practice evidence as exam readiness, and finalized effective results for a pass. */
export function summarizeLearning(attempts: LearningAttempt[]) {
  const practice = attempts.filter(({ mode }) => mode === "PRACTICE");
  const exams = attempts.filter(({ mode }) => mode === "CAPSTONE");
  const completed = exams.filter(({ status, reviewCase }) => status === "FINALIZED" && reviewCase?.status === "FINALIZED");
  const practiced = new Set(practice.flatMap((attempt) => attempt.responses.flatMap(({ scenario }) => scenario.competencies)));
  return { practice, exams, completed, practiced, passed: completed.some((attempt) => effectiveResult(attempt).passed) };
}
