import "server-only";
import type { PrismaClient } from "@prisma/client";
import { requireControlPanelOwner } from "./owner";

export const auditActions = {
  ADMIN_PASSWORD_RESET_LINK_ISSUED: "Admin reset link issued",
  ADMIN_EMAIL_VERIFIED: "Email verified by alpha override",
  ADMIN_ACCOUNT_DEACTIVATED: "Account deactivated",
  ADMIN_ACCOUNT_REACTIVATED: "Account reactivated",
  AUTH_LINK_ISSUED: "Account link issued",
  AUTH_EMAIL_DISPATCHED: "Account email sent",
  AUTH_EMAIL_DELIVERY_FAILED: "Account email delivery failed",
  EMAIL_VERIFIED: "Email verified by link",
  PASSWORD_RESET_COMPLETED: "Password reset completed",
  LIVE_CANDIDATE_REGISTERED: "Learner registered",
  CLOSED_ALPHA_CONSENT_ACCEPTED: "Closed Alpha consent accepted",
  OWNER_PRELIMINARY_SAVED: "Independent scores saved",
  OWNER_REVIEW_FINALIZED: "Review finalized",
  GRADING_APPEAL_SUBMITTED: "Appeal submitted",
  GRADING_APPEAL_RESOLVED: "Appeal resolved",
  CREDENTIAL_ISSUED: "Credential issued",
  CREDENTIAL_SHARING_CHANGED: "Credential sharing changed",
  CREDENTIAL_STATUS_CHANGED: "Credential status changed",
  OPPORTUNITY_CURATION_CHANGED: "Opportunity updated",
  SYNTHETIC_SEED_INSTALLED: "Demo seed installed",
  SYNTHETIC_PRACTICE_CATALOG_INSTALLED: "Demo practice catalog installed",
  SYNTHETIC_TECHNICAL_PREVIEW_INSTALLED: "Demo technical preview installed",
  SYNTHETIC_OPPORTUNITY_QUEUE_INSTALLED: "Demo opportunity queue installed",
} as const;

type Action = keyof typeof auditActions;
const targets: Record<string, string> = {
  User: "Account", ReviewCase: "Review", AssessmentAppeal: "Appeal", Credential: "Credential", OpportunityListing: "Opportunity", SEED_VERSION: "Seed release",
};
const summaries: Partial<Record<Action, string>> = {
  ADMIN_PASSWORD_RESET_LINK_ISSUED: "Private operator preview. Single use, valid for one hour.",
  ADMIN_EMAIL_VERIFIED: "Operator override recorded without an email-link confirmation.",
  ADMIN_ACCOUNT_DEACTIVATED: "Sign-in blocked and older sessions invalidated.",
  ADMIN_ACCOUNT_REACTIVATED: "Sign-in restored. A new session is required.",
};
const pageSize = 25;
const referencePattern = /^(?:c[a-z0-9]{24}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i;
const handlePattern = /^(?:admin-michael|demo-marcus|demo-elena|candidate-[a-f0-9-]{36})$/i;

function reference(id: string | null) {
  return id && referencePattern.test(id) ? id : null;
}

function handle(accountCode: string | undefined, id: string | null) {
  return accountCode && handlePattern.test(accountCode) ? accountCode : reference(id);
}

/** Owner-only paginated audit projection. Allowlisted metadata values become fixed labels and raw JSON never leaves the server. */
export async function listControlPanelAudit(db: PrismaClient, query: Record<string, unknown>) {
  await requireControlPanelOwner();
  const action = typeof query.action === "string" && Object.hasOwn(auditActions, query.action) ? query.action as Action : "";
  const requested = typeof query.page === "string" && /^[1-9][0-9]{0,3}$/.test(query.page) ? Number(query.page) : 1;
  const where = action ? { action } : {};
  const total = await db.auditEvent.count({ where });
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requested, pages);
  const records = await db.auditEvent.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * pageSize, take: pageSize,
    select: { id: true, createdAt: true, action: true, targetType: true, targetId: true, actorUserId: true, actor: { select: { accountCode: true } }, metadataJson: true } });
  const targetIds = records.flatMap((record) => record.targetType === "User" && record.targetId ? [record.targetId] : []);
  const users = targetIds.length ? await db.user.findMany({ where: { id: { in: targetIds } }, select: { id: true, accountCode: true } }) : [];
  const handles = new Map(users.map(({ id, accountCode }) => [id, accountCode]));
  return { action, page, pages, total, rows: records.map((record) => {
    const known = Object.hasOwn(auditActions, record.action) ? record.action as Action : null;
    const metadata = record.metadataJson;
    const fields = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {};
    const purpose = fields.purpose === "PASSWORD_RESET" ? "Password reset" : fields.purpose === "EMAIL_VERIFICATION" ? "Email verification" : null;
    const channel = fields.channel === "preview" ? "private preview" : fields.channel === "email" ? "email delivery" : fields.channel === "operator-preview" ? "operator preview" : null;
    const target = record.targetType === "User"
      ? handle(handles.get(record.targetId ?? ""), record.targetId) : reference(record.targetId);
    return {
      id: record.id, at: record.createdAt.toISOString(),
      actor: handle(record.actor?.accountCode, record.actorUserId) ?? (record.actorUserId ? "Account" : "System"),
      action: known ? auditActions[known] : "Other recorded event",
      entity: Object.hasOwn(targets, record.targetType) ? targets[record.targetType] : "Record",
      target, summary: (known && summaries[known]) || [purpose, channel].filter(Boolean).join(" · ") || "—",
    };
  }) };
}
