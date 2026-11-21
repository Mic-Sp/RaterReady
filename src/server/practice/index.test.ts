import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPracticeScenario, evaluatePractice } from "./index";

const mocks = vi.hoisted(() => ({ requireCandidate: vi.fn(), load: vi.fn(), submit: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../../lib/auth", () => ({ requireCandidate: mocks.requireCandidate }));
vi.mock("../../lib/prisma", () => ({ prisma: "TEST_DB" }));
vi.mock("./service", () => ({ loadPracticeScenario: mocks.load, submitPracticeEvaluation: mocks.submit }));

beforeEach(() => { vi.resetAllMocks(); });

describe("candidate-only practice server entries", () => {
  it("uses the authenticated identity, never a submitted owner", async () => {
    mocks.requireCandidate.mockResolvedValue({ id: "session-user" });
    await getPracticeScenario("scenario-id");
    await evaluatePractice({ scenarioId: "scenario-id", candidateId: "forged" });
    expect(mocks.load).toHaveBeenCalledWith("TEST_DB", "session-user", "scenario-id");
    expect(mocks.submit).toHaveBeenCalledWith("TEST_DB", "session-user", { scenarioId: "scenario-id", candidateId: "forged" });
  });

  it.each(["unauthenticated", "admin reviewer"])("denies %s before touching scenarios or attempts", async (reason) => {
    mocks.requireCandidate.mockRejectedValue(new Error(reason));
    await expect(getPracticeScenario("private-scenario")).rejects.toThrow(reason);
    await expect(evaluatePractice({})).rejects.toThrow(reason);
    expect(mocks.load).not.toHaveBeenCalled(); expect(mocks.submit).not.toHaveBeenCalled();
  });
});
