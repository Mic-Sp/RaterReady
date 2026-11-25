"use server";

import { prisma } from "../../lib/prisma";
import { env } from "../../lib/env";
import { registerCandidate } from "../../server/auth/registration";
import type { RegistrationState } from "../../lib/registration";
import { signIn } from "../../lib/auth";
import { redirect } from "next/navigation";
import { completeRegistrationHandoff } from "../../server/auth/registration-handoff";
import { cookies } from "next/headers";

/**
 * Intentional public Server Action, protected by Next.js same-origin POST checks and the
 * service's database-backed abuse budget. No session/client role grants provisioning authority:
 * the service can only create a live CANDIDATE. Never return passwords or insert outcomes.
 */
export async function submitRegistration(previous: RegistrationState, form: FormData): Promise<RegistrationState> {
  const payload: Record<string, unknown> = Object.create(null);
  for (const [key, value] of form.entries()) {
    // Native progressive Server Action forms contain framework metadata; all other unexpected
    // keys (including role/verification/fixture overrides) survive to strict service validation.
    if (key.startsWith("$ACTION_")) continue;
    if (Object.hasOwn(payload, key)) payload.invalidRepeatedField = true;
    payload[key] = value;
  }
  const result = await registerCandidate(prisma, payload, env.AUTH_SECRET);
  const handoff = await completeRegistrationHandoff(prisma, payload, result, async (credentials) => {
    const target = await signIn("credentials", { ...credentials, redirect: false, redirectTo: "/welcome" });
    // Auth.js can resolve a destination after its JWT callback rejects the session. Require a
    // nonempty session cookie as well; support HTTPS prefixes and Auth.js chunked cookies.
    const jar = await cookies();
    if (!jar.getAll().some(({ name, value }) => /^(?:__Secure-)?authjs\.session-token(?:\.\d+)?$/.test(name) && value)) {
      throw new Error("Session unavailable.");
    }
    return target;
  });
  // Registration has committed. Auth.js sets the server cookie before this fresh request,
  // so /welcome's independent guards and shared navigation see the new database-verified identity.
  // Keep redirect control-flow outside the session-error catch; never swallow NEXT_REDIRECT.
  if (handoff === "welcome") redirect("/welcome");
  if (handoff === "sign-in") redirect("/login?notice=registration-sign-in");
  const attempt = Number.isSafeInteger(previous?.attempt) && previous.attempt >= 0 && previous.attempt < 1_000_000 ? previous.attempt + 1 : 1;
  return { ...result, attempt };
}
