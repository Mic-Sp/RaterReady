import { beforeEach, describe, expect, it, vi } from "vitest";
import { chooseLevel, beginSkillsCheck, skipSkillsCheck, markLessonComplete } from "./actions";
import { submitDiagnostic } from "../diagnostic/actions";

const mocks = vi.hoisted(() => ({ requireCandidate: vi.fn(), selectLearningLevel: vi.fn(), startDiagnostic: vi.fn(), skipDiagnostic: vi.fn(), completeLesson: vi.fn(), saveDiagnostic: vi.fn(), redirect: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../../lib/auth", () => ({ requireCandidate: mocks.requireCandidate }));
vi.mock("../../lib/prisma", () => ({ prisma: "TEST_DB" }));
vi.mock("../../server/learning/service", async (original) => ({ ...await original<typeof import("../../server/learning/service")>(), ...mocks }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireCandidate.mockResolvedValue({ id: "authenticated-candidate" });
  mocks.redirect.mockImplementation((path) => { throw new Error(`REDIRECT:${path}`); });
});

describe("candidate learning Server Action boundaries", () => {
  it("uses the guarded learner and explicit level rather than a posted identity or placement suggestion", async () => {
    const form = new FormData();
    form.set("level", "ADVANCED");
    form.set("candidateId", "another-user");
    form.set("suggestedLevel", "FOUNDATIONS");
    await expect(chooseLevel(form)).rejects.toThrow("REDIRECT:/dashboard");
    expect(mocks.selectLearningLevel).toHaveBeenCalledWith("TEST_DB", "authenticated-candidate", "ADVANCED");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/welcome");
  });

  it("rejects an invalid level from a welcome choice before writing a profile", async () => {
    const form = new FormData(); form.set("level", "EXPERT");
    await expect(chooseLevel(form)).rejects.toThrow("REDIRECT:/onboarding?notice=invalid-level");
    expect(mocks.selectLearningLevel).not.toHaveBeenCalled();
  });

  it("allows skipping before answering anything without requesting an explanation", async () => {
    mocks.skipDiagnostic.mockResolvedValue({ onboardingCompletedAt: null });
    await expect(skipSkillsCheck()).rejects.toThrow("REDIRECT:/onboarding?notice=diagnostic-skipped");
    expect(mocks.skipDiagnostic).toHaveBeenCalledWith("TEST_DB", "authenticated-candidate");
  });

  it("drops posted scores and identities from diagnostic persistence", async () => {
    const form = new FormData();
    form.set("G1", "0"); form.set("revision", "0"); form.set("intent", "finish");
    form.set("finalScore", "100"); form.set("candidateId", "another-user");
    await expect(submitDiagnostic(form)).rejects.toThrow("REDIRECT:/diagnostic?notice=completed");
    expect(mocks.saveDiagnostic).toHaveBeenCalledWith("TEST_DB", "authenticated-candidate", { G1: "0" }, 0, true);
  });

  it("enforces candidate authorization before every mutation", async () => {
    mocks.requireCandidate.mockRejectedValue(new Error("Forbidden"));
    for (const action of [() => chooseLevel(new FormData()), beginSkillsCheck, skipSkillsCheck, () => markLessonComplete(new FormData()), () => submitDiagnostic(new FormData())]) {
      await expect(action()).rejects.toThrow("Forbidden");
    }
    expect(mocks.selectLearningLevel).not.toHaveBeenCalled();
    expect(mocks.startDiagnostic).not.toHaveBeenCalled();
    expect(mocks.skipDiagnostic).not.toHaveBeenCalled();
    expect(mocks.completeLesson).not.toHaveBeenCalled();
    expect(mocks.saveDiagnostic).not.toHaveBeenCalled();
  });
});
