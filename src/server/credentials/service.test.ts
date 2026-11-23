import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { changeCredentialStatus, getPublicCredential, listAdminCredentials, listCandidateCredentials, setCredentialSharing } from "./service";

const mocks = vi.hoisted(() => ({ candidate: vi.fn(), admin: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../../lib/auth", () => ({ requireCandidate: mocks.candidate, requireAdmin: mocks.admin }));
beforeEach(() => vi.resetAllMocks());
describe("credential service privacy and RBAC", () => {
  it("never selects candidate names, primary keys or review details for public verification", async () => {
    const code = randomUUID();
    const findFirst = vi.fn().mockResolvedValue({ publicSlug: code, issuedAt: new Date("2026-11-23T12:00:00Z"), track: "GENERALIST", competencies: ["G1", "G2", "G3", "G4", "G5", "G6"],
      attempt: { capstoneBlueprint: { version: 1 }, scoringPolicy: { version: 2 } } });
    const db = { credential: { findFirst } } as unknown as PrismaClient;
    const view = await getPublicCredential(db, code);
    expect(view).toMatchObject({ credentialCode: code, status: "ACTIVE", blueprintVersion: 1, scoringPolicyVersion: 2 });
    const select = JSON.stringify(findFirst.mock.calls[0][0].select);
    for (const secret of ["candidate", "name", '"id"', "finalScore", "rationale", "rawVoteJson"]) expect(select).not.toContain(secret);
    expect(findFirst.mock.calls[0][0].where).toMatchObject({ status: "ACTIVE", publicShareEnabled: true,
      attempt: { status: "FINALIZED", mode: "CAPSTONE", track: "GENERALIST", passed: true, finalScore: { gte: 85 } } });
    expect(mocks.candidate).not.toHaveBeenCalled(); expect(mocks.admin).not.toHaveBeenCalled();
  });
  it("uses the same null result for malformed, unknown and restricted codes", async () => {
    const findFirst = vi.fn().mockResolvedValue(null); const db = { credential: { findFirst } } as unknown as PrismaClient;
    expect(await getPublicCredential(db, "not-a-code")).toBeNull(); expect(findFirst).not.toHaveBeenCalled();
    expect(await getPublicCredential(db, randomUUID())).toBeNull();
  });
  it("denies candidates from administration and admins from candidate consent before accessing records", async () => {
    const db = { $transaction: vi.fn(), credential: { findMany: vi.fn() } } as unknown as PrismaClient;
    mocks.admin.mockResolvedValue({ role: "CANDIDATE", accountCode: "admin-michael" });
    await expect(listAdminCredentials(db)).rejects.toThrow("Forbidden");
    await expect(changeCredentialStatus(db, randomUUID(), { status: "ACTIVE", reason: "Reason" })).rejects.toThrow("Forbidden");
    mocks.candidate.mockResolvedValue({ role: "ADMIN_REVIEWER" });
    await expect(listCandidateCredentials(db)).rejects.toThrow("Forbidden");
    await expect(setCredentialSharing(db, randomUUID(), true)).rejects.toThrow("Forbidden");
    expect(db.$transaction).not.toHaveBeenCalled(); expect(db.credential.findMany).not.toHaveBeenCalled();
  });
  it("rejects blank lifecycle reasons and nonboolean consent before any transaction", async () => {
    const db = { $transaction: vi.fn() } as unknown as PrismaClient;
    mocks.admin.mockResolvedValue({ role: "ADMIN_REVIEWER", accountCode: "admin-michael" });
    mocks.candidate.mockResolvedValue({ role: "CANDIDATE", id: "candidate" });
    for (const reason of [undefined, "", " \n\t "]) await expect(changeCredentialStatus(db, randomUUID(), { status: "REVOKED", reason })).rejects.toThrow();
    await expect(setCredentialSharing(db, randomUUID(), "false" as unknown as boolean)).rejects.toThrow();
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});
