export const qualificationExamName = "Generalist Qualification Exam";

/** Map legacy human-readable copy at presentation boundaries; stored codes, enums, URLs and scoring contracts stay intact. */
export function qualificationExamText(text: string): string {
  return text.replace(/\bGeneralist capstone(?: exam)?\b/gi, qualificationExamName)
    .replace(/\bcapstones\b/gi, `${qualificationExamName} attempts`)
    .replace(/\bcapstone exam\b/gi, qualificationExamName)
    .replace(/(?<![\w/-])capstone(?![\w/-])/gi, qualificationExamName);
}

/** Give learners a readable rubric name while retaining its original code in the pinned server metadata. */
export function qualificationRubricLabel(code: string): string {
  return code.includes("capstone") ? `RaterReady ${qualificationExamName} rubric` : code;
}
