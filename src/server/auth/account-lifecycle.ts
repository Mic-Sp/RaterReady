import "server-only";
import type { Prisma, PrismaClient, AuthTokenPurpose } from "@prisma/client";
import { z } from "zod";
import { accountPasswordSchema, normalizeEmail } from "../../lib/registration";
import { AUTH_FLOW_LIMITED, AUTH_LINK_UNAVAILABLE, RESET_REQUEST_RECEIVED, type AccountLinkState } from "../../lib/account-lifecycle";
import type { AuthIdentity } from "./accounts";
import type { AuthDeliveryRuntime } from "./email-delivery";
import { consumeLifecycleBudget } from "./registration-rate-limit";
import { consumeAuthToken, hashAuthToken, issueAuthToken } from "./tokens";
import { hashPassword } from "./passwords";

type Viewer = AuthIdentity | null;
type Result = Omit<AccountLinkState, "sequence">;
const emailSchema = z.string().transform(normalizeEmail).pipe(z.email().max(254));
const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const owner = (viewer: Viewer) => viewer?.role === "ADMIN_REVIEWER" && viewer.accountCode === "admin-michael";

/** Purpose-bound, database-clock lookup; this closed server projection never exposes account details to a public token form. */
export async function lookupAuthLink(db: Prisma.TransactionClient, raw: string, purpose: AuthTokenPurpose) {
  if (!tokenSchema.safeParse(raw).success) return null;
  const [row] = await db.$queryRaw<{ id: string; userId: string }[]>`
    SELECT t."id", t."userId" FROM "AuthToken" t JOIN "User" u ON u."id" = t."userId"
    WHERE t."tokenHash" = ${hashAuthToken(raw)} AND t."purpose" = ${purpose}::"AuthTokenPurpose"
      AND t."consumedAt" IS NULL AND t."expiresAt" > clock_timestamp()
      AND t."sessionVersion" = u."sessionVersion" AND u."accountStatus" = 'ACTIVE'
      AND u."role" = 'CANDIDATE' AND u."isSyntheticFixture" = false`;
  return row ?? null;
}

/**
 * Public reset responses stay identical for known/unknown/disabled/synthetic accounts. Preview
 * links are account recovery capabilities: only the signed-in target or sole owner may see one.
 * Provider work runs AFTER the response; delivery failures never fall back to a public preview.
 * Verification requests require a fresh candidate identity and always target that account.
 */
export async function requestAccountLink(db: PrismaClient, viewer: Viewer, purpose: AuthTokenPurpose, emailInput: unknown, secret: string, delivery: AuthDeliveryRuntime): Promise<Result> {
  const reset = purpose === "PASSWORD_RESET";
  const received: Result = { status: "received", message: reset ? RESET_REQUEST_RECEIVED : "Verification link requested. Check your email or the authorized Closed-Alpha preview below." };
  if (!reset && (!viewer || viewer.role !== "CANDIDATE")) return { status: "unavailable", message: "Sign in to request your verification link." };
  const parsed = reset ? emailSchema.safeParse(emailInput) : null;
  try {
    const subject = reset ? (parsed?.success ? parsed.data : typeof emailInput === "string" ? normalizeEmail(emailInput.slice(0, 1024)) : "invalid-email") : viewer!.id;
    if (!await consumeLifecycleBudget(db, `request:${purpose}`, subject, secret)) return { status: "limited", message: AUTH_FLOW_LIMITED };
    if (reset && !parsed?.success) return { status: "invalid", message: "Check the email field.", fieldError: "Enter a valid email address." };
    const select = { id: true, email: true, role: true, accountStatus: true, isSyntheticFixture: true, emailVerifiedAt: true, sessionVersion: true } as const;
    const user = reset
      ? await db.user.findUnique({ where: { email: subject }, select })
      : await db.user.findUnique({ where: { id: viewer!.id }, select });
    if (!user || user.role !== "CANDIDATE" || user.accountStatus !== "ACTIVE" || user.isSyntheticFixture || !user.email) return received;
    if (!reset && user.emailVerifiedAt) return { status: "received", message: "Your email is already verified." };
    const canPreview = Boolean(viewer && (viewer.id === user.id || owner(viewer)));
    // Signed-out preview-mode requests cannot reveal a reset bearer secret or even account existence.
    if (delivery.mode === "unavailable") return reset ? received : { status: "unavailable", message: "Verification delivery is unavailable. Contact the project owner." };
    if (delivery.mode === "preview" && !canPreview) return received;
    const issued = await db.$transaction(async (tx) => {
      if (canPreview && owner(viewer) && viewer!.id !== user.id) {
        const authorized = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "User" WHERE "id" = ${viewer!.id}
          AND "role" = 'ADMIN_REVIEWER' AND "accountCode" = 'admin-michael' AND "accountStatus" = 'ACTIVE'
          AND "sessionVersion" = ${viewer!.sessionVersion} FOR SHARE`;
        if (!authorized.length) throw new Error("Preview unavailable.");
      }
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${user.id} FOR UPDATE`;
      const current = await tx.user.findUniqueOrThrow({ where: { id: user.id }, select });
      // Do not bind a new-version token to a stale recipient address or a revoked preview session.
      if (current.email !== user.email || current.sessionVersion !== user.sessionVersion
        || (viewer?.id === user.id && viewer.sessionVersion !== current.sessionVersion)) throw new Error("Request unavailable.");
      const token = await issueAuthToken(tx, user.id, purpose);
      await tx.auditEvent.create({ data: { eventKey: `auth-link:${token.id}:issued`, actorUserId: viewer?.id ?? null,
        action: "AUTH_LINK_ISSUED", targetType: "User", targetId: user.id,
        metadataJson: { purpose, channel: delivery.mode, tokenReference: token.id } } });
      return { ...token, reference: token.id };
    });
    const path = reset ? "/reset-password" : "/verify-email";
    // Fragments are not sent in HTTP requests/referrers. The client moves this code into POST state and clears the fragment.
    const url = `${delivery.origin}${path}#token=${issued.rawToken}`;
    if (delivery.mode === "preview") {
      delivery.logPreview({ purpose, path, reference: issued.reference });
      return { ...received, preview: { url, purpose, expiresAt: issued.expiresAt.toISOString() } };
    }
    delivery.defer(async () => {
      let action = "AUTH_EMAIL_DISPATCHED";
      try { await delivery.send({ email: user.email!, url, purpose, reference: issued.reference }); }
      catch { action = "AUTH_EMAIL_DELIVERY_FAILED"; }
      try { await db.auditEvent.create({ data: { eventKey: `auth-link:${issued.reference}:delivery`, action, targetType: "User", targetId: user.id,
        metadataJson: { purpose, tokenReference: issued.reference } } }); }
      catch { /* No provider bodies, recipients, or secrets are logged if audit storage is unavailable. */ }
    });
    return received;
  } catch {
    // Public reset failures reveal no more than unknown accounts. Authenticated verification can offer a safe retry.
    return reset ? received : { status: "unavailable", message: "The verification request could not be completed. Please try again later." };
  }
}

/**
 * Bearer-token authority replaces session authority for these public completion actions. The
 * lookup is advisory; atomic consumption rechecks purpose/expiry/security version under locks.
 * Token consumption, account mutation and immutable audit receipt share ONE transaction.
 * A password reset never implicitly verifies email; both changes revoke all older sessions/tokens.
 */
export async function completeAccountLink(db: PrismaClient, purpose: AuthTokenPurpose, raw: unknown, newPassword: unknown, secret: string, viewer: Viewer = null) {
  const unavailable = { ok: false as const, message: AUTH_LINK_UNAVAILABLE };
  try {
    const parsed = tokenSchema.safeParse(raw);
    if (!await consumeLifecycleBudget(db, `consume:${purpose}`, parsed.success ? hashAuthToken(parsed.data) : "invalid-token", secret)) return { ok: false as const, message: AUTH_FLOW_LIMITED };
    if (!parsed.success) return unavailable;
    const token = parsed.data;
    const password = purpose === "PASSWORD_RESET" ? accountPasswordSchema.safeParse(newPassword) : null;
    if (password && !password.success) return { ok: false as const, message: "Check the new password.", fieldError: password.error.issues[0].message };
    if (!await lookupAuthLink(db, token, purpose)) return unavailable;
    const passwordHash = password?.success ? await hashPassword(password.data) : null;
    return await db.$transaction(async (tx) => {
      const receipt = await lookupAuthLink(tx, token, purpose);
      if (!receipt) return unavailable;
      const consumed = await consumeAuthToken(tx, token, purpose);
      if (!consumed) return unavailable;
      const [clock] = await tx.$queryRaw<{ now: Date }[]>`SELECT date_trunc('milliseconds', clock_timestamp()) AS now`;
      await tx.user.update({ where: { id: consumed.userId }, data: purpose === "EMAIL_VERIFICATION" ? { emailVerifiedAt: clock.now } : { passwordHash: passwordHash! } });
      const issuance = await tx.auditEvent.findUnique({ where: { eventKey: `auth-link:${receipt.id}:issued` }, select: { metadataJson: true } });
      const metadata = issuance?.metadataJson;
      const channel = metadata && typeof metadata === "object" && !Array.isArray(metadata) && typeof metadata.channel === "string" ? metadata.channel : "unknown";
      await tx.auditEvent.create({ data: { eventKey: `auth-link:${receipt.id}:consumed`, actorUserId: viewer?.id ?? consumed.userId,
        action: purpose === "EMAIL_VERIFICATION" ? "EMAIL_VERIFIED" : "PASSWORD_RESET_COMPLETED", targetType: "User", targetId: consumed.userId,
        metadataJson: { purpose, channel, tokenReference: receipt.id } } });
      return { ok: true as const, userId: consumed.userId };
    });
  } catch { return unavailable; }
}
