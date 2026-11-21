"use server";

import { requireCandidate } from "../../lib/auth";
import { prisma } from "../../lib/prisma";
import { getCapstoneSnapshot, saveCapstoneDraft, submitCapstoneAttempt, type CapstoneMutationResult, type CapstoneSnapshot } from "../../server/capstone/workspace";

/** Fresh candidate authorization precedes every autosave; neither ownership nor score/timing authority comes from posted data. */
export async function autosaveCapstoneAction(input: unknown): Promise<CapstoneMutationResult> {
  const user = await requireCandidate();
  return saveCapstoneDraft(prisma, user.id, input);
}

/** Explicit confirmation submits only the server-saved snapshot; retries return the same locked receipt. */
export async function submitCapstoneExamAction(input: unknown): Promise<CapstoneMutationResult> {
  const user = await requireCandidate();
  return submitCapstoneAttempt(prisma, user.id, input);
}

/** Owned server timer poll; no client timestamp, elapsed time or requested duration is accepted. */
export async function syncCapstoneClockAction(attemptId: string): Promise<CapstoneSnapshot | null> {
  const user = await requireCandidate();
  try { return await getCapstoneSnapshot(prisma, user.id, attemptId); }
  catch { return null; }
}
