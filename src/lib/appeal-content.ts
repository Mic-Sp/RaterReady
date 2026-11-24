/** A pilot service target is not a guarantee; no fictitious deadline or holiday coverage is promised. */
export const appealTurnaroundNotice = "Pilot review target: three business days (Monday–Friday, excluding weekends). This is a target, not a guaranteed response time; holidays and owner availability may cause delays.";
export const appealReasonLabels = { RUBRIC_APPLICATION: "Rubric application", FACTUAL_VERIFICATION: "Factual verification", WRITTEN_JUSTIFICATION: "Written justification scoring", OTHER: "Other grading concern" } as const;
export type AppealView = { reference: string; reason: string; evidenceNote: string; status: string; submittedAt: string;
  disposition: string | null; rationale: string | null; resolvedAt: string | null; resolvedFinalScore: number | null };
