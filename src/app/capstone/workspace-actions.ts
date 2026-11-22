"use server";

import { after } from "next/server";
import { requireCandidate } from "../../lib/auth";
import { prisma } from "../../lib/prisma";
import { getCapstoneSnapshot, saveCapstoneDraft, submitCapstoneAttempt, type CapstoneMutationResult, type CapstoneSnapshot } from "../../server/capstone/workspace";
import { processWrittenGrading } from "../../server/ai/written-grading";

/** Durable rows already exist; background interruptions leave them recoverable without reopening responses. */
function scheduleGrading(snapshot: CapstoneSnapshot | null) {
  if (snapshot && (snapshot.writtenGrading === "QUEUED" || snapshot.writtenGrading === "EVALUATING")) {
    after(async () => {
      try { await processWrittenGrading(prisma, snapshot.id); }
      catch { console.error("DEMO - SYNTHETIC: written grading interrupted; owner review remains required."); }
    });
  }
}

/** Fresh candidate authorization precedes every autosave; neither ownership nor score/timing authority comes from posted data. */
export async function autosaveCapstoneAction(input: unknown): Promise<CapstoneMutationResult> {
  const user = await requireCandidate();
  const result = await saveCapstoneDraft(prisma, user.id, input);
  scheduleGrading(result.snapshot);
  return result;
}

/** Explicit confirmation submits only the server-saved snapshot; retries return the same locked receipt. */
export async function submitCapstoneExamAction(input: unknown): Promise<CapstoneMutationResult> {
  const user = await requireCandidate();
  const result = await submitCapstoneAttempt(prisma, user.id, input);
  scheduleGrading(result.snapshot);
  return result;
}

/** Owned server timer poll; no client timestamp, elapsed time or requested duration is accepted. */
export async function syncCapstoneClockAction(attemptId: string): Promise<CapstoneSnapshot | null> {
  const user = await requireCandidate();
  try { const snapshot = await getCapstoneSnapshot(prisma, user.id, attemptId); scheduleGrading(snapshot); return snapshot; }
  catch { return null; }
}
