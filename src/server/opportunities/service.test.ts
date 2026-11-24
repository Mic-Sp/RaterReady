import { Prisma, type PrismaClient } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCandidateOpportunities, listAdminOpportunities, updateOpportunityListing } from "./service";
import { submitGradingAppeal, resolveGradingAppeal } from "../appeals/service";

const auth = vi.hoisted(() => ({ candidate: vi.fn(), admin: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../../lib/auth", () => ({ requireCandidate: auth.candidate, requireAdmin: auth.admin }));
beforeEach(() => { vi.resetAllMocks(); auth.candidate.mockResolvedValue({ id: "candidate", role: "CANDIDATE" }); });
describe("opportunity gate and appeal authorization", () => {
  it.each([[84, "ACTIVE", false], [85, "SUSPENDED", false], [85, "REVOKED", false], [85, "ACTIVE", true]])("gates score %s and credential %s without selecting locked links", async (score, status, unlocked) => {
    const findMany = vi.fn().mockResolvedValue([]);
    const db = { opportunityListing: { findMany }, assessmentAttempt: { findMany: vi.fn().mockResolvedValue([{ deterministicScore: new Prisma.Decimal(score - 5), writtenScore: new Prisma.Decimal(5),
      finalScore: new Prisma.Decimal(score), credential: { status }, appeals: [] }]) } } as unknown as PrismaClient;
    expect((await getCandidateOpportunities(db)).unlocked).toBe(unlocked);
    expect(findMany).toHaveBeenCalledTimes(unlocked ? 1 : 0);
    expect(db.assessmentAttempt.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ candidateId: "candidate", mode: "CAPSTONE", status: "FINALIZED", track: "GENERALIST" }) }));
  });
  it("denies candidate calls to appeal resolution and opportunity administration before touching data", async () => {
    auth.admin.mockResolvedValue({ role: "CANDIDATE", accountCode: "admin-michael" });
    const db = { $transaction: vi.fn() } as unknown as PrismaClient;
    await expect(resolveGradingAppeal(db, "reference", {})).rejects.toThrow("Forbidden");
    await expect(listAdminOpportunities(db)).rejects.toThrow("Forbidden");
    await expect(updateOpportunityListing(db, "listing", {})).rejects.toThrow("Forbidden");
    auth.candidate.mockResolvedValue({ role: "ADMIN_REVIEWER" });
    await expect(submitGradingAppeal(db, "attempt", {})).rejects.toThrow("Forbidden");
    await expect(getCandidateOpportunities(db)).rejects.toThrow("Forbidden");
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});
