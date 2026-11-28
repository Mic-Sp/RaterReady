import type { PrismaClient } from "@prisma/client";
import { beforeEach, expect, it, vi } from "vitest";
import { listControlPanelAccounts } from "./accounts";
import { listControlPanelAudit } from "./audit";
import { getSiteTelemetry } from "./telemetry";
import { manageLearnerAccess } from "./account-access";
import { updateLearnerAccess } from "../../app/admin/users/actions";
import { AuthorizationError } from "../auth/guards";

const mocks = vi.hoisted(() => ({ admin: vi.fn(), transaction: vi.fn(), revalidate: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../../lib/auth", () => ({ requireAdmin: mocks.admin }));
vi.mock("../../lib/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("../../lib/env", () => ({ env: { AUTH_SECRET: "synthetic testing secret with sufficient length" } }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.admin.mockResolvedValue({ role: "ADMIN_REVIEWER", accountCode: "admin-michael", id: "owner", sessionVersion: 0 });
});

it("denies candidates at every control-panel read and mutation before any database access", async () => {
  mocks.admin.mockResolvedValue({ role: "CANDIDATE", accountCode: "demo-marcus", id: "candidate" });
  const db = { $transaction: mocks.transaction } as unknown as PrismaClient;
  for (const operation of [
    () => listControlPanelAccounts(db, {}), () => listControlPanelAudit(db, {}), () => getSiteTelemetry(db),
    () => manageLearnerAccess(db, { target: "candidate", operation: "disable" }, "test"),
  ]) await expect(operation()).rejects.toMatchObject({ status: 403 });
  const data = new FormData();
  data.set("operation", "reset");
  data.set("target", "candidate");
  await expect(updateLearnerAccess({ message: "", success: false }, data)).rejects.toBeInstanceOf(AuthorizationError);
  expect(mocks.transaction).not.toHaveBeenCalled();
  expect(mocks.revalidate).not.toHaveBeenCalled();
});

it("blocks self-deactivation and invalid action parameters before opening a transaction", async () => {
  const db = { $transaction: mocks.transaction } as unknown as PrismaClient;
  expect(await manageLearnerAccess(db, { target: "owner", operation: "disable" }, "test")).toMatchObject({ success: false });
  expect(await manageLearnerAccess(db, { target: "learner", operation: "makeAdmin" }, "test")).toMatchObject({ success: false });
  expect(mocks.transaction).not.toHaveBeenCalled();
});

it("allowlists audit categories and metadata without rendering free text, opaque secrets or emails", async () => {
  const auditEvent = {
    count: vi.fn().mockResolvedValue(28),
    findMany: vi.fn().mockResolvedValue([{
      id: "row", createdAt: new Date(0), action: "AUTH_LINK_ISSUED", targetType: "User", targetId: "private@example.invalid",
      actorUserId: "owner", actor: { accountCode: "admin-michael" },
      metadataJson: { purpose: "PASSWORD_RESET", channel: "preview", resetToken: "DO_NOT_RENDER", rationale: "PRIVATE_TEXT" },
    }]),
  };
  const db = { auditEvent, user: { findMany: vi.fn().mockResolvedValue([]) } } as unknown as PrismaClient;
  const view = await listControlPanelAudit(db, { page: "2", action: "AUTH_LINK_ISSUED" });
  expect(auditEvent.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { action: "AUTH_LINK_ISSUED" }, skip: 25, take: 25 }));
  expect(view.rows[0]).toMatchObject({ actor: "admin-michael", action: "Account link issued", target: null, summary: "Password reset · private preview" });
  expect(JSON.stringify(view)).not.toMatch(/DO_NOT_RENDER|PRIVATE_TEXT|@example/);
});

it.each([
  ["2", 42, 20, 2, 20, { start: 21, end: 40 }],
  ["99999", 42, 2, 3, 40, { start: 41, end: 42 }],
  ["-1", 42, 20, 1, 0, { start: 1, end: 20 }],
  ["2", 0, 0, 1, 0, null],
])("bounds a directory request for page %s with %s matches", async (requested, total, rows, page, skip, range) => {
  const row = { createdAt: new Date(0), emailVerifiedAt: null, candidateProfile: null, role: "CANDIDATE" };
  const user = { count: vi.fn().mockResolvedValue(total), findMany: vi.fn().mockResolvedValue(Array(rows).fill(row)) };
  const db = { user, $queryRaw: vi.fn().mockResolvedValue([{ now: new Date(0) }]) } as unknown as PrismaClient;
  const view = await listControlPanelAccounts(db, { q: " Learner ", filter: "live", page: requested });
  const where = { role: "CANDIDATE", isSyntheticFixture: false, OR: ["name", "email", "accountCode"].map((field) => ({
    [field]: { contains: "Learner", mode: "insensitive" },
  })) };
  expect(user.count).toHaveBeenCalledWith({ where });
  expect(user.findMany).toHaveBeenCalledWith(expect.objectContaining({ where, skip, take: 20, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }));
  expect(view).toMatchObject({ page, total, range, search: "Learner", filter: "live" });
});
