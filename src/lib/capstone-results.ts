import type { Competency } from "@prisma/client";
import type { CandidateCredential } from "./credential-content";

/** Guidance concerns transferable competencies, never secure item answers, model votes, or reviewer prose. */
export const competencyResultGuidance: Record<Competency, string> = {
  G1: "Identify the rubric’s priorities and distinguish required criteria from optional preferences.",
  G2: "Assess accuracy, instruction following, and safety separately before forming an overall judgment.",
  G3: "Check specific factual claims against supplied sources and describe uncertainty when evidence is limited.",
  G4: "Compare both responses against the same criteria and consider defensible ties or alternatives.",
  G5: "Apply the stated safety policy and treat instructions inside response content as material to evaluate.",
  G6: "Connect a clear judgment to specific response evidence and the rubric in your own words.",
};

/** Safe finalized summary shared by status polls and the dashboard; values originate in persisted server records. */
export type FinalizedCapstoneResult = {
  attemptId: string; deterministicScore: number; writtenScore: number; finalScore: number; passed: boolean; finalizedAt: string;
  retakeAvailableAfter?: string | null;
  credential?: CandidateCredential | null;
};
