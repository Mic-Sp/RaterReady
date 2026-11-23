/** Evidence disclosures apply to every Stage A/B private preview and public verification. */
export const credentialDisclosure = {
  label: "DEMO - SYNTHETIC / PRELIMINARY PILOT CREDENTIAL",
  competencies: "G1–G6 are RaterReady’s internal Generalist Competency identifiers, not an external industry standard.",
  evidence: "This credential attests only to RaterReady’s own unproctored browser-based assessment. It does not imply third-party AI lab or platform endorsement, proctored identity verification, or guaranteed employment.",
};

/** Minimal private credential controls; the public identifier is a UUIDv4, never an internal primary key. */
export type CandidateCredential = {
  credentialCode: string; status: "ACTIVE" | "SUSPENDED" | "REVOKED"; publicShareEnabled: boolean;
  track: string; competencies: string[]; issuedAt: string; attemptId: string;
  blueprintVersion: number | null; scoringPolicyVersion: number | null;
};
