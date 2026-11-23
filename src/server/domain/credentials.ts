/** Issuance eligibility is server-owned: only a reviewed, pinned, finalized synthetic Generalist capstone can certify. */
export function canIssueGeneralistCredential(attempt: {
  mode: string; track: string; status: string; passed: boolean | null; finalScore: number | null;
  isSyntheticFixture: boolean; finalizedAt: Date | null; blueprintVersion: number | null; scoringPolicyVersion: number | null; reviewStatus: string | null;
}): boolean {
  return attempt.mode === "CAPSTONE" && attempt.track === "GENERALIST" && attempt.status === "FINALIZED"
    && attempt.passed === true && attempt.finalScore !== null && Number.isFinite(attempt.finalScore) && attempt.finalScore >= 85 && attempt.finalScore <= 100
    && attempt.isSyntheticFixture && attempt.finalizedAt !== null && attempt.reviewStatus === "FINALIZED"
    && Number.isInteger(attempt.blueprintVersion) && attempt.blueprintVersion! > 0
    && Number.isInteger(attempt.scoringPolicyVersion) && attempt.scoringPolicyVersion! > 0;
}
