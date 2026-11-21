import type { Competency } from "@prisma/client";

/** RaterReady's internal Generalist practice competency identifiers; not an external industry standard. */
export const generalistPracticeCompetencies = {
  G1: "Rubric Interpretation",
  G2: "Response Quality Evaluation",
  G3: "Factual Verification",
  G4: "Comparative Judgment",
  G5: "Safety & Policy Awareness",
  G6: "Evaluation Justification & Calibration",
} as const satisfies Record<Competency, string>;
