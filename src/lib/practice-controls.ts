/** Public control definitions contain identifiers/labels only, never expected judgments or ratings. */
export const practiceJudgments = [
  { id: "A_BETTER", label: "Response A is better" }, { id: "B_BETTER", label: "Response B is better" },
  { id: "TIE", label: "A and B are tied" }, { id: "BOTH_UNACCEPTABLE", label: "Both are unacceptable" },
] as const;

/** Label safe post-submission choices explicitly; an unaccepted candidate tie must never be called valid. */
export function practiceJudgmentLabel(judgment: typeof practiceJudgments[number]["id"], accepted = false): string {
  switch (judgment) {
    case "A_BETTER": return "Response (A)";
    case "B_BETTER": return "Response (B)";
    case "TIE": return `${accepted ? "Valid Tie" : "Tie"} — Response (A) and Response (B) are equally rated`;
    case "BOTH_UNACCEPTABLE": return "Neither — Response (A) and Response (B) are unacceptable";
  }
}
export const practiceRatings = [
  { id: "A_ONLY", label: "Only A meets the criterion" }, { id: "B_ONLY", label: "Only B meets the criterion" },
  { id: "BOTH_MEET", label: "Both meet the criterion" }, { id: "NEITHER_MEETS", label: "Neither meets the criterion" },
] as const;

/** Add public field labels to historical v1 fixtures without rewriting pinned keys or rubric content. */
export function legacyPracticeControls(familyCode: string) {
  const ids = familyCode === "demo-library-hours" ? ["accuracy", "instructionFollowing"] : familyCode === "demo-supply-total" ? ["accuracy", "relevance"] : null;
  if (!ids) return undefined;
  const labels: Record<string, string> = { accuracy: "Factual accuracy", instructionFollowing: "Instruction following", relevance: "Relevance" };
  return { description: "Apply the priorities stated in the task and rate each criterion independently.",
    criteria: ids.map((id) => ({ id, label: labels[id], options: [...practiceRatings] })),
    verificationInstruction: "Select the supplied source identifiers that support your verification. Order does not matter." };
}
