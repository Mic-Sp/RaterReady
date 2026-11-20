import "server-only";
import type { Competency, LearningLevel } from "@prisma/client";
import { z } from "zod";

export const diagnosticVersion = 1;
const option = z.enum(["0", "1", "2"]).optional();
/** Accept only structured synthetic choices; no personal narrative or client scores are collected. */
export const diagnosticAnswersSchema = z.object({ G1: option, G2: option, G3: option, G4: option, G5: option, G6: option }).strict();
export type DiagnosticAnswers = z.infer<typeof diagnosticAnswersSchema>;
export type DiagnosticFeedback = { answeredCount: number; suggestedLevel: LearningLevel | null; items: { competency: Competency; outcome: "Shown in this task" | "Worth exploring" | "Not observed"; message: string }[] };

// Server-only by import boundary: these are constrained selection keys, never prose matchers.
const keys = { G1: "0", G2: "1", G3: "2", G4: "1", G5: "2", G6: "0" } as const;

/** Advisory sampling only: no pass/fail, no capstone threshold changes, no credentials or level assignment. */
export function evaluateDiagnostic(answers: DiagnosticAnswers): DiagnosticFeedback {
  let shown = 0;
  let answeredCount = 0;
  const items = (Object.keys(keys) as Competency[]).map((competency) => {
    const answer = answers[competency];
    if (answer === undefined) return { competency, outcome: "Not observed" as const, message: "This area was not sampled. You can explore its lesson at any level." };
    answeredCount++;
    if (answer === keys[competency]) {
      shown++;
      return { competency, outcome: "Shown in this task" as const, message: "Your selected response reflects this principle in this short synthetic task." };
    }
    return { competency, outcome: "Worth exploring" as const, message: "Revisit the corresponding lesson and the seven-step reference. You can still choose any learning level." };
  });
  return { answeredCount, suggestedLevel: answeredCount === 0 ? null : shown >= 5 ? "ADVANCED" : shown >= 3 ? "INTERMEDIATE" : "FOUNDATIONS", items };
}
