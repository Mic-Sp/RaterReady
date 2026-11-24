import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateOpportunityAction } from "./opportunity-actions";

const mocks = vi.hoisted(() => ({ guard: vi.fn(), update: vi.fn(), revalidate: vi.fn() }));
vi.mock("../../lib/auth", () => ({ requireAdmin: mocks.guard }));
vi.mock("../../lib/prisma", () => ({ prisma: "TEST_DB" }));
vi.mock("../../server/opportunities/service", () => ({ updateOpportunityListing: mocks.update }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));

beforeEach(() => { vi.resetAllMocks(); mocks.guard.mockResolvedValue({ role: "ADMIN_REVIEWER" }); });

describe("opportunity curation form parsing", () => {
  it.each([["false", false], ["true", true]])("passes literal FormData %s as boolean %s", async (value, expected) => {
    const form = new FormData(); form.set("code", "demo-listing"); form.set("active", value); form.set("verificationDate", "2026-11-23");
    expect(await updateOpportunityAction({ error: null, message: null }, form)).toMatchObject({ error: null });
    expect(mocks.update).toHaveBeenCalledWith("TEST_DB", "demo-listing", { active: expected, verificationDate: "2026-11-23" });
    for (const path of ["/admin", "/opportunities", "/opportunities/referral-demo"]) expect(mocks.revalidate).toHaveBeenCalledWith(path);
  });
  it.each([null, "on", "", "Paused"])("rejects ambiguous or missing status %s without writing", async (value) => {
    const form = new FormData(); form.set("code", "demo-listing"); form.set("verificationDate", "2026-11-23");
    if (value !== null) form.set("active", value);
    expect((await updateOpportunityAction({ error: null, message: null }, form)).error).toBeTruthy();
    expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("never reports success or revalidates after a failed write", async () => {
    const form = new FormData(); form.set("code", "demo-listing"); form.set("active", "false"); form.set("verificationDate", "2026-11-23");
    mocks.update.mockRejectedValue(new Error("PRIVATE_DB_ERROR"));
    expect(await updateOpportunityAction({ error: null, message: null }, form)).toMatchObject({ error: expect.any(String), message: null });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});
