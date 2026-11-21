import { beforeEach, describe, expect, it, vi } from "vitest";
import { autosaveCapstoneAction, submitCapstoneExamAction, syncCapstoneClockAction } from "./workspace-actions";

const mocks = vi.hoisted(() => ({ guard: vi.fn(), save: vi.fn(), submit: vi.fn(), status: vi.fn() }));
vi.mock("../../lib/auth", () => ({ requireCandidate: mocks.guard }));
vi.mock("../../lib/prisma", () => ({ prisma: "TEST_DB" }));
vi.mock("../../server/capstone/workspace", () => ({ saveCapstoneDraft: mocks.save, submitCapstoneAttempt: mocks.submit, getCapstoneSnapshot: mocks.status }));
beforeEach(() => { vi.resetAllMocks(); mocks.guard.mockResolvedValue({ id: "guarded-candidate" }); });

describe("exam action authorization boundaries", () => {
  it("binds autosave, submission and timer checks to the fresh session principal", async () => {
    const forged = { candidateId: "other-user", attemptId: "attempt", expiresAt: "2099-01-01", finalScore: 100 };
    await autosaveCapstoneAction(forged); await submitCapstoneExamAction(forged); await syncCapstoneClockAction("attempt");
    expect(mocks.save).toHaveBeenCalledWith("TEST_DB", "guarded-candidate", forged);
    expect(mocks.submit).toHaveBeenCalledWith("TEST_DB", "guarded-candidate", forged);
    expect(mocks.status).toHaveBeenCalledWith("TEST_DB", "guarded-candidate", "attempt");
  });
  it("refuses anonymous/admin requests before any data access and hides storage errors from clock polls", async () => {
    mocks.guard.mockRejectedValueOnce(new Error("Forbidden")); await expect(autosaveCapstoneAction({})).rejects.toThrow("Forbidden");
    mocks.guard.mockRejectedValueOnce(new Error("Forbidden")); await expect(submitCapstoneExamAction({})).rejects.toThrow("Forbidden");
    mocks.guard.mockRejectedValueOnce(new Error("Forbidden")); await expect(syncCapstoneClockAction("attempt")).rejects.toThrow("Forbidden");
    expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.submit).not.toHaveBeenCalled(); expect(mocks.status).not.toHaveBeenCalled();
    mocks.status.mockRejectedValue(new Error("SECRET_CONNECTION_AND_KEYS"));
    expect(await syncCapstoneClockAction("attempt")).toBeNull();
  });
});
