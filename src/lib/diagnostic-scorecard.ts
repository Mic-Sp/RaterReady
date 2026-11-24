import type { Competency, LearningLevel } from "@prisma/client";
import type { DiagnosticFeedback } from "../server/domain/diagnostic";
import { generalistPracticeCompetencies } from "./generalist-competencies";

// Version-1 sample IDs follow the old lesson sequence. Keep persisted answers/keys intact while
// routing factual verification, comparison, policy boundaries and justification to their current practice areas.
const sampleForPractice = { G1: "G1", G2: "G2", G3: "G4", G4: "G3", G5: "G6", G6: "G5" } as const satisfies Record<Competency, Competency>;

/** Public explanations describe a learning starting point, never mastery, exam eligibility or a required placement. */
export const advisoryLevelDescriptions = {
  FOUNDATIONS: "Build a comfortable routine for reading tasks, applying one rubric criterion at a time, and checking supplied evidence.",
  INTERMEDIATE: "Practice balancing several criteria, comparing defensible judgments, and explaining how evidence supports your choice.",
  ADVANCED: "Explore ambiguity, valid ties and alternate conclusions while keeping your judgments grounded in the rubric.",
} satisfies Record<LearningLevel, string>;

/** Map server-evaluated samples to current practice cards; only an observed aligned response is a strong signal. Unanswered is never incorrect. */
export function diagnosticScorecardItems(feedback: DiagnosticFeedback) {
  return (Object.keys(sampleForPractice) as Competency[]).map((competency) => {
    const sample = feedback.items.find((item) => item.competency === sampleForPractice[competency]);
    if (!sample) throw new Error("The advisory sample is incomplete.");
    return { competency, title: generalistPracticeCompetencies[competency], message: sample.message,
      status: sample.outcome === "Shown in this task" ? "strong" as const : "focus" as const,
      statusLabel: sample.outcome === "Shown in this task" ? "Strong signal" : "Suggested focus area",
      sampled: sample.outcome !== "Not observed" };
  });
}
