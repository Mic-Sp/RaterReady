"use server";

import { revalidatePath } from "next/cache";
import { requireCandidate } from "../../lib/auth";
import { prisma } from "../../lib/prisma";
import { setCredentialSharing } from "../../server/credentials/service";
import { z } from "zod";

export type CredentialActionState = { error: string | null; message: string | null };

/** Fresh candidate guard and explicit desired consent; the service independently checks ownership under database locks. */
export async function updateCredentialSharingAction(_previous: CredentialActionState, form: FormData): Promise<CredentialActionState> {
  await requireCandidate();
  try {
    const code = z.uuidv4().parse(form.get("credentialCode"));
    const desired = z.enum(["true", "false"]).parse(form.get("enabled")) === "true";
    await setCredentialSharing(prisma, code, desired);
    revalidatePath("/dashboard"); revalidatePath("/capstone/[attemptId]", "page"); revalidatePath(`/verify/${code}`); revalidatePath("/admin");
    return { error: null, message: desired ? "Public verification sharing enabled. Only active credentials can be verified publicly." : "Public verification sharing disabled. Your private credential is retained." };
  } catch { return { error: "Sharing preference could not be saved. Refresh your credential and try again.", message: null }; }
}
