"use server";

import { revalidatePath } from "next/cache";
import { env } from "../../../lib/env";
import { prisma } from "../../../lib/prisma";
import { manageLearnerAccess, type AccountAccessResult } from "../../../server/admin/account-access";
import { AuthorizationError } from "../../../server/auth/guards";

/** Owner-only action. Client form state cannot choose the operator or disclose sensitive error details. */
export async function updateLearnerAccess(_previous: AccountAccessResult, data: FormData): Promise<AccountAccessResult> {
  try {
    const result = await manageLearnerAccess(prisma, { target: data.get("target"), operation: data.get("operation") }, env.AUTH_SECRET);
    // Issuance changes no directory fields. Keep the bearer preview in the current action
    // response rather than refreshing the filtered page that just opened it.
    if (result.success && !result.preview) {
      revalidatePath("/admin/users");
      revalidatePath("/admin/audit");
    }
    return result;
  } catch (error) {
    if (error instanceof AuthorizationError) throw error;
    return { success: false, message: "The account change could not be completed. Try again." };
  }
}
