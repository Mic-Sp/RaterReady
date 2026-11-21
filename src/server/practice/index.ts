import "server-only";
import { requireCandidate } from "../../lib/auth";
import { prisma } from "../../lib/prisma";
import { loadPracticeScenario, submitPracticeEvaluation } from "./service";

/** Candidate-authorized server entry for future practice UI; returns a key-free scenario DTO. */
export async function getPracticeScenario(scenarioId: string) {
  const user = await requireCandidate();
  return loadPracticeScenario(prisma, user.id, scenarioId);
}

/** Candidate-authorized server entry; server keys determine scores and the session determines ownership. */
export async function evaluatePractice(input: unknown) {
  const user = await requireCandidate();
  return submitPracticeEvaluation(prisma, user.id, input);
}
