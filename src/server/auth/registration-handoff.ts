import "server-only";
import type { PrismaClient } from "@prisma/client";
import { registrationSchema, type RegistrationResult } from "../../lib/registration";

/** Auth.js owns credential verification and cookie creation; this callback is server-only and never serialized. */
type EstablishSession = (credentials: { accountCode: string; password: string }) => Promise<unknown>;

/**
 * After registration commits, establish a live candidate session through Auth.js. Revalidate the
 * public payload: honeypots deliberately receive an acknowledgment without creating an account.
 * New accounts and eligible repeats follow the SAME credential check; duplicates never replace
 * passwords. No creation/existence flag, password, raw error or client-selected URL is returned.
 * Session failure preserves the committed account and yields a generic sign-in fallback.
 */
export async function completeRegistrationHandoff(db: PrismaClient, input: unknown, result: RegistrationResult, establishSession: EstablishSession): Promise<"welcome" | "sign-in" | "none"> {
  if (result.status !== "received") return "none";
  const parsed = registrationSchema.safeParse(input);
  if (!parsed.success) return "none";
  try {
    const candidate = await db.user.findUnique({ where: { email: parsed.data.email }, select: { accountCode: true, role: true, isSyntheticFixture: true } });
    // A repeat request cannot turn a synthetic or reviewer account into a live candidate.
    if (!candidate || candidate.role !== "CANDIDATE" || candidate.isSyntheticFixture) return "sign-in";
    const target = await establishSession({ accountCode: candidate.accountCode, password: parsed.data.password });
    // Auth.js sets cookies before resolving. Unexpected/error destinations are failures even
    // if an adapter resolves instead of throwing; redirects themselves stay outside this catch.
    if (typeof target !== "string") return "sign-in";
    const destination = new URL(target, "http://raterready.internal");
    return destination.pathname === "/welcome" && !destination.search && !destination.hash ? "welcome" : "sign-in";
  } catch {
    return "sign-in";
  }
}
