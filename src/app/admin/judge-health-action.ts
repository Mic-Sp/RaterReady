"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "../../lib/auth";
import { env } from "../../lib/env";
import { prisma } from "../../lib/prisma";
import type { JudgeHealthState } from "../../lib/judge-health";
import { consumeJudgeHealthCheckBudget } from "../../server/auth/registration-rate-limit";
import { probeWrittenJudges } from "../../server/ai/judge-health";

/** Three checks per 15 minutes across the deployment. A fresh sole-owner session is required before spending quota. */
export async function runJudgeHealthCheck(): Promise<JudgeHealthState> {
  try {
    const owner = await requireAdmin();
    if (owner.accountCode !== "admin-michael" || owner.role !== "ADMIN_REVIEWER") return { status: "unavailable" };
    if (!await consumeJudgeHealthCheckBudget(prisma, env.AUTH_SECRET)) return { status: "limited" };
    const result = await probeWrittenJudges();
    revalidatePath("/admin");
    return result;
  } catch {
    // Authorization failures, limiter outages and transport exceptions share a safe public response.
    return { status: "unavailable" };
  }
}
