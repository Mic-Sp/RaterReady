"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { signIn } from "../../lib/auth";
import { SIGN_IN_FAILURE, type SignInState } from "./form-state";

const formSchema = z.object({
  accountCode: z.string().trim().min(1, "Enter your account identifier.").max(64, "Use 64 characters or fewer."),
  password: z.string().min(8, "Use 8 to 128 characters.").max(128, "Use 8 to 128 characters."),
});

/**
 * Public sign-in boundary: validate input, then delegate verification/cookies to Auth.js.
 * Never return passwords, account existence, roles, or raw provider/database errors.
 */
export async function submitSignIn(previous: SignInState, formData: FormData): Promise<SignInState> {
  const parsed = formSchema.safeParse({ accountCode: formData.get("accountCode"), password: formData.get("password") });
  const attempt = previous.attempt + 1;
  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    return { attempt, accountCode: typeof formData.get("accountCode") === "string" ? String(formData.get("accountCode")).slice(0, 64) : "",
      error: "Check the fields below and try again.",
      fieldErrors: { accountCode: errors.accountCode?.[0], password: errors.password?.[0] } };
  }
  try {
    await signIn("credentials", { ...parsed.data, redirect: false, redirectTo: "/" });
  } catch {
    // All sign-in failures have the same UI state. Increment attempts so repeated
    // identical errors are announced again without serializing the submitted password.
    return { attempt, accountCode: parsed.data.accountCode, error: SIGN_IN_FAILURE };
  }
  // A new request sees the newly set cookie. The root route rechecks PostgreSQL and
  // chooses the destination; client form fields cannot select a role or redirect URL.
  redirect("/");
}
