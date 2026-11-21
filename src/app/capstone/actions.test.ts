import { beforeEach, describe, expect, it, vi } from "vitest";
import { startCapstoneAction, resumeCapstoneAction } from "./actions";
import { CapstonePolicyError } from "../../server/capstone/service";

const mocks = vi.hoisted(() => ({ guard: vi.fn(), start: vi.fn(), resume: vi.fn(), revalidate: vi.fn(), redirect: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../../lib/auth", () => ({ requireCandidate: mocks.guard }));
vi.mock("../../lib/prisma", () => ({ prisma: "TEST_DB" }));
vi.mock("../../server/capstone/service", async (original) => ({ ...await original<typeof import("../../server/capstone/service")>(), startCapstoneAttempt: mocks.start, resumeCapstoneAttempt: mocks.resume }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
const initial = { sequence: 0, error: null, acknowledgmentError: null };

/** Forge every timing/ownership field to verify none crosses the server-action allowlist. */
function form() {
  const data = new FormData();
  for (const [key, value] of Object.entries({ acknowledge: "yes", blueprintId: "pinned-blueprint", blueprintVersion: "1", scoringPolicyVersion: "1", independentWorkPolicyVersion: "independent-work-v1",
    candidateId: "someone-else", startedAt: "2099-01-01", expiresAt: "2099-02-01", timeMultiplier: "999", passed: "true", finalScore: "100" })) data.set(key, value);
  return data;
}
beforeEach(() => {
  vi.resetAllMocks(); mocks.guard.mockResolvedValue({ id: "guarded-candidate" });
  mocks.redirect.mockImplementation((path) => { throw new Error(`REDIRECT:${path}`); });
});

describe("capstone Server Action boundaries", () => {
  it("ignores client clocks, timing multipliers, scores and identity when starting", async () => {
    await expect(startCapstoneAction(initial, form())).rejects.toThrow("REDIRECT:/capstone?notice=started");
    expect(mocks.start).toHaveBeenCalledWith("TEST_DB", "guarded-candidate", { acknowledged: true, blueprintId: "pinned-blueprint", blueprintVersion: 1, scoringPolicyVersion: 1, independentWorkPolicyVersion: "independent-work-v1" });
  });
  it("reports associated acknowledgment errors without exposing internal failures", async () => {
    const data = form(); data.delete("acknowledge");
    mocks.start.mockRejectedValueOnce(new CapstonePolicyError("ACKNOWLEDGMENT"));
    expect(await startCapstoneAction(initial, data)).toMatchObject({ sequence: 1, acknowledgmentError: expect.stringContaining("Acknowledge") });
    expect(mocks.start.mock.calls[0][2].acknowledged).toBe(false);
    mocks.start.mockRejectedValue(new Error("SECRET_DATABASE_URI_AND_KEYS"));
    const failed = await startCapstoneAction(initial, form());
    expect(failed.error).toContain("could not be started"); expect(JSON.stringify(failed)).not.toContain("SECRET_");
  });
  it("resumes only the guarded candidate and refuses all mutations before data access for other roles", async () => {
    await expect(resumeCapstoneAction()).rejects.toThrow("REDIRECT:/capstone?notice=resumed");
    expect(mocks.resume).toHaveBeenCalledWith("TEST_DB", "guarded-candidate");
    mocks.start.mockClear(); mocks.resume.mockClear(); mocks.guard.mockRejectedValue(new Error("Forbidden"));
    await expect(startCapstoneAction(initial, form())).rejects.toThrow("Forbidden");
    await expect(resumeCapstoneAction()).rejects.toThrow("Forbidden");
    expect(mocks.start).not.toHaveBeenCalled(); expect(mocks.resume).not.toHaveBeenCalled();
  });
});
