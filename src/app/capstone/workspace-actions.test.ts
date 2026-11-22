import { beforeEach, describe, expect, it, vi } from "vitest";
import { autosaveCapstoneAction, submitCapstoneExamAction, syncCapstoneClockAction } from "./workspace-actions";

const mocks = vi.hoisted(() => ({ guard: vi.fn(), save: vi.fn(), submit: vi.fn(), status: vi.fn(), after: vi.fn(), grade: vi.fn() }));
vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("../../server/ai/written-grading", () => ({ processWrittenGrading: mocks.grade }));
vi.mock("../../lib/auth", () => ({ requireCandidate: mocks.guard }));
vi.mock("../../lib/prisma", () => ({ prisma: "TEST_DB" }));
vi.mock("../../server/capstone/workspace", () => ({ saveCapstoneDraft: mocks.save, submitCapstoneAttempt: mocks.submit, getCapstoneSnapshot: mocks.status }));
beforeEach(() => { vi.resetAllMocks(); mocks.guard.mockResolvedValue({ id: "guarded-candidate" }); mocks.submit.mockResolvedValue({ snapshot: null }); mocks.save.mockResolvedValue({ snapshot: null }); });

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
  it("schedules grading only after a durable authorized receipt and recovers queued work on owned polls", async () => {
    const snapshot = { id: "frozen-attempt", writtenGrading: "QUEUED" };
    mocks.submit.mockResolvedValue({ ok: true, snapshot });
    expect(await submitCapstoneExamAction({})).toEqual({ ok: true, snapshot });
    expect(mocks.grade).not.toHaveBeenCalled();
    await mocks.after.mock.calls[0][0]();
    expect(mocks.grade).toHaveBeenCalledWith("TEST_DB", "frozen-attempt");
    mocks.status.mockResolvedValue(snapshot); await syncCapstoneClockAction("frozen-attempt");
    expect(mocks.after).toHaveBeenCalledTimes(2);
  });
});
