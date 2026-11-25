"use server";

import { prisma } from "../../lib/prisma";
import { env } from "../../lib/env";
import { registerCandidate } from "../../server/auth/registration";
import type { RegistrationState } from "../../lib/registration";

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
  const attempt = Number.isSafeInteger(previous?.attempt) && previous.attempt >= 0 && previous.attempt < 1_000_000 ? previous.attempt + 1 : 1;
  return { ...result, attempt };
}
