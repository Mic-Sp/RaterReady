"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "../../lib/auth";
import { prisma } from "../../lib/prisma";
import { changeCredentialStatus } from "../../server/credentials/service";
import type { CredentialActionState } from "../credentials/actions";

/** Administrative mutations always repeat RBAC; the service validates lifecycle status and the mandatory written reason. */
export async function changeCredentialStatusAction(_previous: CredentialActionState, form: FormData): Promise<CredentialActionState> {
  await requireAdmin();
  const reason = z.string().trim().min(1).max(4000).safeParse(form.get("reason"));
  if (!reason.success) return { error: "Enter a non-empty written reason before changing credential status.", message: null };
  try {
    const code = z.uuidv4().parse(form.get("credentialCode"));
    await changeCredentialStatus(prisma, code, { status: form.get("status"), reason: reason.data });
    revalidatePath("/admin"); revalidatePath("/dashboard"); revalidatePath("/capstone/[attemptId]", "page"); revalidatePath(`/verify/${code}`);
    return { error: null, message: "Credential status saved. Any lifecycle transition and its reason are preserved in the audit trail." };
  } catch { return { error: "Credential status could not be changed. Refresh the console and try again.", message: null }; }
}
