"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { prisma } from "../lib/prisma";
import { env } from "../lib/env";
import { requireCandidate, signOut } from "../lib/auth";
import { optionalPageIdentity } from "../server/auth/page-access";
import { createAuthDeliveryRuntime } from "../server/auth/email-delivery";
import { completeAccountLink, requestAccountLink } from "../server/auth/account-lifecycle";
import type { AccountLinkState } from "../lib/account-lifecycle";

/** Presentation counter only; all rate limits and lifecycle timestamps are database-owned. */
function sequence(previous: AccountLinkState) {
  return Number.isSafeInteger(previous?.sequence) && previous.sequence >= 0 && previous.sequence < 1_000_000 ? previous.sequence + 1 : 1;
}

/** Candidate-only, one-click resend. Posted emails/roles never choose the verification target or preview authority. */
export async function sendVerificationLink(previous: AccountLinkState): Promise<AccountLinkState> {
  const user = await requireCandidate();
  return { ...await requestAccountLink(prisma, user, "EMAIL_VERIFICATION", null, env.AUTH_SECRET, createAuthDeliveryRuntime(after)), sequence: sequence(previous) };
}

/** Public same-origin reset request; fresh optional identity controls ONLY preview access, never public existence messaging. */
export async function requestPasswordReset(previous: AccountLinkState, data: FormData): Promise<AccountLinkState> {
  const viewer = await optionalPageIdentity();
  return { ...await requestAccountLink(prisma, viewer, "PASSWORD_RESET", data.get("email"), env.AUTH_SECRET, createAuthDeliveryRuntime(after)), sequence: sequence(previous) };
}

/** Purpose-bound bearer authorization; consumption and mutation are atomic. Sign out only the affected current account. */
export async function verifyEmailLink(previous: AccountLinkState, data: FormData): Promise<AccountLinkState> {
  const viewer = await optionalPageIdentity();
  const result = await completeAccountLink(prisma, "EMAIL_VERIFICATION", data.get("token"), null, env.AUTH_SECRET, viewer);
  if (!result.ok) return { sequence: sequence(previous), status: "invalid", message: result.message };
  if (viewer?.id === result.userId) {
    try { await signOut({ redirect: false }); } catch { /* The DB security version has already revoked the old session. */ }
  }
  // Keep redirect control-flow outside catches. No bearer token/email enters this confirmation URL.
  redirect("/verify-email?notice=verified");
}

/** Public reset completion enforces the shared password policy and invalidates every older session/token via the DB trigger. */
export async function resetPasswordLink(previous: AccountLinkState, data: FormData): Promise<AccountLinkState> {
  const viewer = await optionalPageIdentity();
  const result = await completeAccountLink(prisma, "PASSWORD_RESET", data.get("token"), data.get("password"), env.AUTH_SECRET, viewer);
  if (!result.ok) return { sequence: sequence(previous), status: "invalid", message: result.message, fieldError: "fieldError" in result ? result.fieldError : undefined };
  if (viewer?.id === result.userId) {
    try { await signOut({ redirect: false }); } catch { /* Revoked DB versions remain authoritative even if cookie cleanup fails. */ }
  }
  redirect("/reset-password?notice=complete");
}
