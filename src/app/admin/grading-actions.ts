"use server";

import { z } from "zod";
import { requireAdmin } from "../../lib/auth";
import { prisma } from "../../lib/prisma";
import { processWrittenGrading } from "../../server/ai/written-grading";

/** Sole-owner recovery action for existing frozen attempts; accepts no provider, approval, vote, or candidate identity. */
export async function triggerWrittenGradingAction(attemptId: string): Promise<{ ok: boolean }> {
  const owner = await requireAdmin();
  if (owner.accountCode !== "admin-michael") throw new Error("Forbidden.");
  const id = z.string().min(1).max(100).parse(attemptId);
  try { await processWrittenGrading(prisma, id); return { ok: true }; }
  catch { return { ok: false }; }
}
