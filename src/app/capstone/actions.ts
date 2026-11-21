"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCandidate } from "../../lib/auth";
import { prisma } from "../../lib/prisma";
import { CapstonePolicyError, resumeCapstoneAttempt, startCapstoneAttempt } from "../../server/capstone/service";

export type CapstoneStartState = { sequence: number; error: string | null; acknowledgmentError: string | null };

/** Candidate-only mutation: allowlist acknowledgment/version pins; ignore posted identity, scores, times and timing multipliers. */
export async function startCapstoneAction(previous: CapstoneStartState, data: FormData): Promise<CapstoneStartState> {
  const user = await requireCandidate();
  try {
    await startCapstoneAttempt(prisma, user.id, { acknowledged: data.get("acknowledge") === "yes", blueprintId: data.get("blueprintId"),
      blueprintVersion: Number(data.get("blueprintVersion")), scoringPolicyVersion: Number(data.get("scoringPolicyVersion")), independentWorkPolicyVersion: data.get("independentWorkPolicyVersion") });
  } catch (error) {
    return { sequence: previous.sequence + 1, error: error instanceof CapstonePolicyError ? error.message : "The capstone could not be started. Reload the readiness screen to check server status.",
      acknowledgmentError: error instanceof CapstonePolicyError && error.reason === "ACKNOWLEDGMENT" ? "Acknowledge the Independent-Work Policy before starting." : null };
  }
  revalidatePath("/capstone"); revalidatePath("/dashboard");
  redirect("/capstone?notice=started");
}

/** Candidate-only resume rechecks the database deadline; it neither creates an attempt nor accepts a posted attempt ID. */
export async function resumeCapstoneAction(): Promise<void> {
  const user = await requireCandidate();
  let notice = "resumed";
  try { await resumeCapstoneAttempt(prisma, user.id); }
  catch { notice = "not-active"; }
  revalidatePath("/capstone");
  redirect(`/capstone?notice=${notice}`);
}
