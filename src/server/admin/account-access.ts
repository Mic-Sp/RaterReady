import "server-only";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { authAppOrigin } from "../auth/email-delivery";
import { issueAuthToken } from "../auth/tokens";
import { consumeLifecycleBudget } from "../auth/registration-rate-limit";
import { capstoneDatabaseNow } from "../capstone/clock";
import { lockControlPanelOwner, requireControlPanelOwner } from "./owner";

const inputSchema = z.object({
  target: z.string().min(1).max(100),
  operation: z.enum(["reset", "verify", "disable", "enable"]),
}).strict();

export type AccountAccessResult = { message: string; success: boolean; preview?: { url: string; expiresAt: string } };

const unavailable = { success: false, message: "This action is unavailable for this account. Refresh the directory and check its status." };

/** Authorize each mutation and lock both account records. Only approved learner transitions and safe audit metadata are persisted. */
export async function manageLearnerAccess(db: PrismaClient, input: unknown, authSecret: string): Promise<AccountAccessResult> {
  const owner = await requireControlPanelOwner();
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success || parsed.data.target === owner.id) return unavailable;
  const { target, operation } = parsed.data;
  const origin = operation === "reset" ? authAppOrigin() : null;
  if (operation === "reset") {
    if (!origin) return { success: false, message: "Reset links are unavailable until the application origin is configured." };
    if (!await consumeLifecycleBudget(db, "operator:password-reset", target, authSecret)) {
      return { success: false, message: "Too many reset links were requested. Wait 15 minutes before trying again." };
    }
  }
  return db.$transaction(async (tx) => {
    await lockControlPanelOwner(tx, owner);
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${target} FOR UPDATE`;
    const user = await tx.user.findUnique({ where: { id: target }, select: {
      accountCode: true, role: true, accountStatus: true, isSyntheticFixture: true, email: true, emailVerifiedAt: true,
      closedAlphaConsentAcceptedAt: true, closedAlphaConsentVersion: true,
    } });
    if (!user || user.role !== "CANDIDATE" || user.accountCode === "admin-michael" || user.accountStatus === "REVOKED") return unavailable;

    const receipt = { actorUserId: owner.id, targetType: "User", targetId: target };
    const live = !user.isSyntheticFixture && Boolean(user.email && user.closedAlphaConsentAcceptedAt && user.closedAlphaConsentVersion);
    if (operation === "reset" && origin && live && user.accountStatus === "ACTIVE") {
      const token = await issueAuthToken(tx, target, "PASSWORD_RESET");
      await tx.auditEvent.create({ data: { ...receipt, eventKey: `auth-link:${token.id}:issued`,
        action: "ADMIN_PASSWORD_RESET_LINK_ISSUED", metadataJson: { purpose: "PASSWORD_RESET", channel: "operator-preview" } } });
      // The trusted origin and fragment match the existing recovery form. Only this POST response receives the secret.
      return { success: true, message: "Reset link generated.", preview: { url: `${origin}/reset-password#token=${token.rawToken}`, expiresAt: token.expiresAt.toISOString() } };
    }
    if (operation === "verify" && live && user.accountStatus === "ACTIVE" && !user.emailVerifiedAt) {
      await tx.user.update({ where: { id: target }, data: { emailVerifiedAt: await capstoneDatabaseNow(tx) } });
      await tx.auditEvent.create({ data: { ...receipt, eventKey: `admin-access:${randomUUID()}`,
        action: "ADMIN_EMAIL_VERIFIED", metadataJson: { channel: "alpha-override" } } });
      return { success: true, message: "Email marked verified through the alpha override." };
    }
    const disabling = operation === "disable" && user.accountStatus === "ACTIVE";
    const enabling = operation === "enable" && user.accountStatus === "DISABLED";
    if (!disabling && !enabling) return unavailable;
    // The security-version trigger invalidates old cookies and recovery links on either transition.
    await tx.user.update({ where: { id: target }, data: { accountStatus: disabling ? "DISABLED" : "ACTIVE" } });
    await tx.auditEvent.create({ data: { ...receipt, eventKey: `admin-access:${randomUUID()}`,
      action: disabling ? "ADMIN_ACCOUNT_DEACTIVATED" : "ADMIN_ACCOUNT_REACTIVATED",
      metadataJson: { previous: user.accountStatus, next: disabling ? "DISABLED" : "ACTIVE" } } });
    return { success: true, message: disabling ? "Account deactivated and sessions signed out." : "Account reactivated." };
  });
}
