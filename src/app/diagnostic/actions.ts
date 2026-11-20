"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCandidate } from "../../lib/auth";
import { prisma } from "../../lib/prisma";
import { diagnosticTasks } from "../../lib/learning-content";
import { saveDiagnostic } from "../../server/learning/service";

/** Candidate-only structured selection save/finish. Ignore client scores, identities and suggested levels. */
export async function submitDiagnostic(formData: FormData): Promise<void> {
  const user = await requireCandidate();
  const answers = Object.fromEntries(diagnosticTasks.flatMap(({ competency }) => formData.has(competency) ? [[competency, formData.get(competency)]] : []));
  const intent = formData.get("intent");
  if (intent !== "save" && intent !== "finish") redirect("/diagnostic?notice=invalid");
  try {
    await saveDiagnostic(prisma, user.id, answers, Number(formData.get("revision")), intent === "finish");
  } catch {
    // A stale tab or invalid answer cannot overwrite saved selections or create certification results.
    redirect("/diagnostic?notice=not-saved");
  }
  revalidatePath("/diagnostic");
  revalidatePath("/dashboard");
  redirect(intent === "finish" ? "/diagnostic?notice=completed" : "/diagnostic?notice=saved");
}
