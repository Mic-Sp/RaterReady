import { beforeEach, describe, expect, it, vi } from "vitest";
import { triggerWrittenGradingAction } from "./grading-actions";

const mocks = vi.hoisted(() => ({ guard: vi.fn(), grade: vi.fn() }));
vi.mock("../../lib/auth", () => ({ requireAdmin: mocks.guard }));
vi.mock("../../lib/prisma", () => ({ prisma: "TEST_DB" }));
vi.mock("../../server/ai/written-grading", () => ({ processWrittenGrading: mocks.grade }));
beforeEach(() => { vi.resetAllMocks(); });

describe("manual grading recovery authorization", () => {
  it("blocks candidates, expired sessions, and any identity other than the sole owner before touching jobs", async () => {
    mocks.guard.mockRejectedValueOnce(new Error("Forbidden."));
    await expect(triggerWrittenGradingAction("attempt")).rejects.toThrow("Forbidden.");
    mocks.guard.mockResolvedValueOnce({ accountCode: "another-admin" });
    await expect(triggerWrittenGradingAction("attempt")).rejects.toThrow("Forbidden.");
    expect(mocks.grade).not.toHaveBeenCalled();
  });
  it("accepts only an attempt ID after fresh admin authorization and returns no private judge output", async () => {
    mocks.guard.mockResolvedValue({ accountCode: "admin-michael" });
    expect(await triggerWrittenGradingAction("attempt")).toEqual({ ok: true });
    expect(mocks.grade).toHaveBeenCalledWith("TEST_DB", "attempt");
    mocks.grade.mockRejectedValue(new Error("PRIVATE_PROVIDER_DETAILS"));
    expect(await triggerWrittenGradingAction("attempt")).toEqual({ ok: false });
  });
});
