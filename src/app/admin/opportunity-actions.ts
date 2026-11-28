"use server";

import { requireAdmin } from "../../lib/auth";
import { prisma } from "../../lib/prisma";
import { updateOpportunityListing } from "../../server/opportunities/service";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { CredentialActionState } from "../credentials/actions";

/** Admin-only curation accepts an explicit active flag and actual verification date; source/partnership claims cannot be posted through this action. */
export async function updateOpportunityAction(_previous: CredentialActionState, form: FormData): Promise<CredentialActionState> {
  await requireAdmin();
  try {
    const code = z.string().min(1).max(100).parse(form.get("code"));
    // FormData contains strings: Boolean("false") is true. Accept only these two
    // literal values so Paused reaches PostgreSQL as the boolean false.
    const active = z.enum(["true", "false"]).parse(form.get("active")) === "true";
    await updateOpportunityListing(prisma, code, { active, verificationDate: form.get("verificationDate") });
    revalidatePath("/admin"); revalidatePath("/opportunities"); revalidatePath("/opportunities/referral-demo");
    return { error: null, message: "Saved" };
  } catch { return { error: "Curation could not be saved. Use a valid verification date that is not in the future.", message: null }; }
}
