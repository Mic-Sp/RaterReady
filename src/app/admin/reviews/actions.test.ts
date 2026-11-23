import { beforeEach, describe, expect, it, vi } from "vitest";
import { finalizeReviewAction, savePreliminaryAction } from "./actions";

const mocks = vi.hoisted(() => ({ guard: vi.fn(), resolve: vi.fn(), save: vi.fn(), finalize: vi.fn(), redirect: vi.fn(), revalidate: vi.fn() }));
vi.mock("../../../lib/auth", () => ({ requireAdmin: mocks.guard }));
vi.mock("../../../lib/prisma", () => ({ prisma: "TEST_DB" }));
vi.mock("../../../server/review/service", () => ({ resolveReviewAttempt: mocks.resolve, savePreliminaryReview: mocks.save, finalizeOwnerReview: mocks.finalize }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

/** Browser controls never submit owner identity, stage, or computed totals. */
function form(rationale?: string) {
  const data = new FormData(); data.set("reviewCaseId", "case");
  for (const index of [0, 1, 2]) {
    data.set(`responseId-${index}`, `r${index}`); data.set(`alignment-${index}`, "2"); data.set(`evidence-${index}`, "2"); data.set(`clarity-${index}`, "1");
  }
  if (rationale !== undefined) data.set("rationale", rationale);
  return data;
}
beforeEach(() => {
  vi.resetAllMocks(); mocks.guard.mockResolvedValue({ accountCode: "admin-michael", role: "ADMIN_REVIEWER" }); mocks.resolve.mockResolvedValue("attempt");
  mocks.redirect.mockImplementation((path) => { throw new Error(`REDIRECT:${path}`); });
});
describe("review action security and validation", () => {
  it("persists the preliminary baseline through Step 8A before redirecting to the server-chosen stage", async () => {
    await expect(savePreliminaryAction({ error: null }, form())).rejects.toThrow("REDIRECT:/admin/reviews/case?notice=unlocked");
    expect(mocks.save).toHaveBeenCalledWith("TEST_DB", "attempt", { responses: [0, 1, 2].map((i) => ({ responseId: `r${i}`, alignment: 2, evidence: 2, clarity: 1 })) });
    expect(mocks.finalize).not.toHaveBeenCalled();
  });
  it.each([undefined, "", " \n\t "])("rejects missing/blank rationale %j without finalizing", async (rationale) => {
    expect(await finalizeReviewAction({ error: null }, form(rationale))).toMatchObject({ error: expect.stringContaining("non-empty") });
    expect(mocks.finalize).not.toHaveBeenCalled(); expect(mocks.redirect).not.toHaveBeenCalled();
  });
  it("finalizes through the server engine and invalidates admin, dashboard and result views", async () => {
    await expect(finalizeReviewAction({ error: null }, form("  DEMO - SYNTHETIC: rubric-grounded owner reasoning.  "))).rejects.toThrow("notice=finalized");
    expect(mocks.finalize.mock.calls[0][2].rationale).toBe("DEMO - SYNTHETIC: rubric-grounded owner reasoning.");
    for (const path of ["/admin", "/admin/reviews/case", "/dashboard", "/capstone", "/capstone/attempt"]) expect(mocks.revalidate).toHaveBeenCalledWith(path);
  });
  it("fails closed when Step 8A rejects a bypass of independent scoring; no private error is returned", async () => {
    mocks.finalize.mockRejectedValue(new Error("PRIVATE_VOTE_AND_PROVIDER_DATA"));
    const result = await finalizeReviewAction({ error: null }, form("DEMO - SYNTHETIC: review."));
    expect(result.error).toContain("saved preliminary scores"); expect(JSON.stringify(result)).not.toContain("PRIVATE");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
  it("rejects blank, fractional and out-of-range criterion fields", async () => {
    for (const value of ["", "2.5", "3", "-1"]) {
      const data = form(); data.set("alignment-0", value);
      expect((await savePreliminaryAction({ error: null }, data)).error).toBeTruthy();
    }
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("requires fresh admin RBAC at both action entry points", async () => {
    for (const action of [savePreliminaryAction, finalizeReviewAction]) {
      mocks.guard.mockRejectedValueOnce(new Error("Forbidden."));
      await expect(action({ error: null }, form("Reason"))).rejects.toThrow("Forbidden.");
      mocks.guard.mockResolvedValueOnce({ role: "CANDIDATE", accountCode: "admin-michael" });
      await expect(action({ error: null }, form("Reason"))).rejects.toThrow("Forbidden.");
    }
    expect(mocks.resolve).not.toHaveBeenCalled();
  });
});
