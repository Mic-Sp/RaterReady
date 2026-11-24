"use server";

import { z } from "zod";
import { requireAdmin } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";
import { resolveGradingAppeal } from "../../../server/appeals/service";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { AppealFormState } from "../../appeals/actions";

/** Fresh owner authorization; bounded category/criterion inputs are revalidated by the appeal evaluator, never trusting a posted total. */
export async function resolveAppealAction(_previous: AppealFormState, form: FormData): Promise<AppealFormState> {
  await requireAdmin();
  let reference: string;
  try {
    reference = z.uuidv4().parse(form.get("reference"));
    const disposition = z.enum(["UPHELD", "ADJUSTED"]).parse(form.get("disposition"));
    const rationale = z.string().trim().min(1).max(12000).parse(form.get("rationale"));
    const number = (key: string) => z.string().trim().min(1).transform(Number).pipe(z.number().finite()).parse(form.get(key));
    const adjustment = disposition === "ADJUSTED" ? { judgment: number("judgment"), rubric: number("rubric"), verification: number("verification"),
      written: { responses: [0, 1, 2].map((i) => ({ responseId: z.string().min(1).max(100).parse(form.get(`response-${i}`)),
        alignment: number(`alignment-${i}`), evidence: number(`evidence-${i}`), clarity: number(`clarity-${i}`) })) } } : null;
    await resolveGradingAppeal(prisma, reference, disposition === "UPHELD" ? { disposition, rationale } : { disposition, rationale, adjustment });
  } catch { return { error: "Appeal could not be resolved. Supply a non-empty rationale and valid rubric scores; an already resolved disposition cannot be changed." }; }
  for (const path of ["/admin", "/dashboard", "/opportunities"]) revalidatePath(path);
  revalidatePath("/capstone/[attemptId]", "page"); revalidatePath("/capstone"); revalidatePath("/verify/[credentialCode]", "page");
  redirect(`/admin/appeals/${reference}`);
}
