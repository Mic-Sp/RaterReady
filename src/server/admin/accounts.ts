import "server-only";
import { type PrismaClient, type Prisma } from "@prisma/client";
import { z } from "zod";
import { capstoneDatabaseNow } from "../capstone/clock";
import { examWhere, learningAttemptSelect, practiceWhere, summarizeLearning } from "./learning-projection";
import { requireControlPanelOwner } from "./owner";

export const accountFilters = {
  all: "All", live: "Live Closed Alpha", demo: "Synthetic Demo", unverified: "Unverified Email", deactivated: "Deactivated",
} as const;
const filters = {
  all: {}, live: { role: "CANDIDATE", isSyntheticFixture: false }, demo: { isSyntheticFixture: true },
  unverified: { role: "CANDIDATE", isSyntheticFixture: false, emailVerifiedAt: null },
  deactivated: { accountStatus: { not: "ACTIVE" } },
} satisfies Record<keyof typeof accountFilters, Prisma.UserWhereInput>;
const pageSize = 20;

/** Search a bounded owner-only directory. No credentials, token material, or assessment answers enter its projection. */
export async function listControlPanelAccounts(db: PrismaClient, query: Record<string, unknown>) {
  await requireControlPanelOwner();
  const filter = z.enum(["all", "live", "demo", "unverified", "deactivated"]).catch("all").parse(query.filter);
  const search = typeof query.q === "string" ? query.q.trim().slice(0, 100) : "";
  const requested = typeof query.page === "string" && /^[1-9][0-9]{0,15}$/.test(query.page) ? Number(query.page) : 1;
  const where: Prisma.UserWhereInput = {
    ...filters[filter],
    ...(search && { OR: (["name", "email", "accountCode"] as const).map((field) => ({ [field]: { contains: search, mode: "insensitive" } })) }),
  };
  const [total, now] = await Promise.all([db.user.count({ where }), capstoneDatabaseNow(db)]);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Number.isSafeInteger(requested) ? Math.min(requested, pages) : 1;
  const offset = (page - 1) * pageSize;
  const accounts = await db.user.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: offset, take: pageSize, select: {
    id: true, name: true, accountCode: true, email: true, role: true, isSyntheticFixture: true,
    accountStatus: true, emailVerifiedAt: true, createdAt: true, closedAlphaConsentAcceptedAt: true, closedAlphaConsentVersion: true,
    candidateProfile: { select: { attempts: { where: { OR: [practiceWhere, examWhere] }, orderBy: [{ startedAt: "desc" }, { id: "desc" }], select: learningAttemptSelect } } },
  } });
  const range = accounts.length ? { start: offset + 1, end: offset + accounts.length } : null;
  return { search, filter, page, pages, total, range, accounts: accounts.map(({ candidateProfile, closedAlphaConsentAcceptedAt, closedAlphaConsentVersion, ...account }) => {
    const learning = summarizeLearning(candidateProfile?.attempts ?? []);
    const latest = learning.exams[0];
    const examStatus = account.role === "ADMIN_REVIEWER" ? "—" : learning.passed ? "Passed"
      : !latest ? "Not started" : ["SUBMITTED", "GRADING", "PENDING_REVIEW"].includes(latest.status) ? "Awaiting review"
      : latest.status === "FINALIZED" ? "Not yet passed" : latest.status === "IN_PROGRESS" && latest.expiresAt && latest.expiresAt > now ? "In progress" : "Attempt ended";
    return { ...account, createdAt: account.createdAt.toISOString(), emailVerifiedAt: account.emailVerifiedAt?.toISOString() ?? null,
      practiced: learning.practiced.size, examStatus,
      manageable: account.role === "CANDIDATE" && account.accountCode !== "admin-michael" && account.accountStatus !== "REVOKED",
      recoveryAvailable: account.role === "CANDIDATE" && !account.isSyntheticFixture && account.accountStatus === "ACTIVE"
        && Boolean(account.email && closedAlphaConsentAcceptedAt && closedAlphaConsentVersion),
    };
  }) };
}
