/** The base grade is immutable; the latest resolved ADJUSTED appeal is the sole authority for an effective result revision. */
export function effectiveResult(attempt: { deterministicScore: { toNumber(): number } | null; writtenScore: { toNumber(): number } | null; finalScore: { toNumber(): number } | null;
  appeals: { status: string; disposition: string | null; resolvedDeterministicScore: { toNumber(): number } | null; resolvedWrittenScore: { toNumber(): number } | null;
    resolvedFinalScore: { toNumber(): number } | null }[] }) {
  const revision = attempt.appeals.find((a) => a.status === "RESOLVED" && a.disposition === "ADJUSTED");
  const deterministicScore = (revision?.resolvedDeterministicScore ?? attempt.deterministicScore)?.toNumber() ?? null;
  const writtenScore = (revision?.resolvedWrittenScore ?? attempt.writtenScore)?.toNumber() ?? null;
  const finalScore = (revision?.resolvedFinalScore ?? attempt.finalScore)?.toNumber() ?? null;
  return { deterministicScore, writtenScore, finalScore, passed: finalScore !== null && finalScore >= 85, adjusted: Boolean(revision) };
}
