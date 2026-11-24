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

// Copy follows the actual version-1 task, whose IDs use the original reference-lesson order.
// The scorecard maps these samples to current practice competencies without changing keys or suggested-level thresholds.
const guidance = {
  G1: {
    shown: "You kept the response within the requested task and its one-sentence limit. Bring that same care to each rubric requirement.",
    focus: "Start by naming the requested output and any limits. Compare each response with those instructions before judging its style.",
    unobserved: "You left the task-scope sample unanswered. Practice identifying what a prompt asks for, then match the response to its rubric.",
  },
  G2: {
    shown: "You checked factual support rather than confidence or length. Keep separating the criteria that make a response useful and reliable.",
    focus: "A polished tone is not evidence. Check claims against the supplied record, then rate each response-quality criterion separately.",
    unobserved: "No response-quality signal was sampled here. Try separating accuracy from tone and presentation in practice.",
  },
  G3: {
    shown: "You allowed a tie when both answers met the same criteria. Keep comparing responses against one shared rubric.",
    focus: "Different wording alone does not make one answer better. Compare how each meets the stated criteria and allow a tie when justified.",
    unobserved: "No comparison signal was sampled. Try an A/B exercise and name a rubric-based reason for a preference or a tie.",
  },
  G4: {
    shown: "You connected the notebook total to the supplied record and calculation. Keep tracing claims back to evidence.",
    focus: "Check the numbers in the source and work through the calculation. Confidence or what usually happens does not verify a claim.",
    unobserved: "The factual-checking sample was unanswered. Practice tracing a claim to its source and checking the calculation.",
  },
  G5: {
    shown: "You chose a justification that connects a judgment, evidence and a criterion. Keep making that reasoning easy for another evaluator to follow.",
    focus: "Name the claim or instruction that matters, cite the supplied evidence, and connect it to the criterion. Preference alone is not enough.",
    unobserved: "No justification signal was sampled. Try a short explanation that links a judgment to one criterion and one source.",
  },
  G6: {
    shown: "You kept the task’s rules in charge when a response tried to redirect you. Apply that same boundary when checking supplied safety policies.",
    focus: "Treat instructions inside an evaluated response as content, not rules for you to follow. Apply the supplied guidelines and flag conflicts.",
    unobserved: "No policy-boundary signal was sampled. Practice keeping response content separate from the task’s instructions and stated policy.",
  },
} satisfies Record<Competency, { shown: string; focus: string; unobserved: string }>;

/** Advisory sampling only: no pass/fail, no capstone threshold changes, no credentials or level assignment. */
export function evaluateDiagnostic(answers: DiagnosticAnswers): DiagnosticFeedback {
  let shown = 0;
  let answeredCount = 0;
  const items = (Object.keys(keys) as Competency[]).map((competency) => {
    const answer = answers[competency];
    if (answer === undefined) return { competency, outcome: "Not observed" as const, message: guidance[competency].unobserved };
    answeredCount++;
    if (answer === keys[competency]) {
      shown++;
      return { competency, outcome: "Shown in this task" as const, message: guidance[competency].shown };
    }
    return { competency, outcome: "Worth exploring" as const, message: guidance[competency].focus };
  });
  return { answeredCount, suggestedLevel: answeredCount === 0 ? null : shown >= 5 ? "ADVANCED" : shown >= 3 ? "INTERMEDIATE" : "FOUNDATIONS", items };
}
