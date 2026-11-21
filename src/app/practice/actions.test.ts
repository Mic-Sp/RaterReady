import { beforeEach, describe, expect, it, vi } from "vitest";
import { updatePractice, updateTechnicalPreview } from "./actions";
import type { PracticeFormState } from "./form-state";

const mocks = vi.hoisted(() => ({ guard: vi.fn(), load: vi.fn(), save: vi.fn(), revalidate: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../../lib/auth", () => ({ requireCandidate: mocks.guard }));
vi.mock("../../lib/prisma", () => ({ prisma: "TEST_DB" }));
vi.mock("../../server/practice/service", () => ({ loadPracticeScenario: mocks.load }));
vi.mock("../../server/practice/workspace", async (original) => ({ ...await original<typeof import("../../server/practice/workspace")>(), saveOrSubmitPractice: mocks.save }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));

const initial: PracticeFormState = { sequence: 0, revision: 0, savedAt: null, submittedAt: null, message: "No draft", values: { rubricSelections: {}, verifiedSourceIds: [], writtenJustification: "" } };

/** Build only synthetic posted values; account identity and scores are deliberately forged to test allowlisting. */
function form(intent: string) {
  const data = new FormData();
  for (const [key, value] of Object.entries({ scenarioId: "practice-id", scenarioVersion: "1", rubricVersion: "2", revision: "0", intent,
    candidateId: "another-user", deterministicScore: "100", scratchpad: "PRIVATE_NOTES" })) data.set(key, value);
  return data;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.guard.mockResolvedValue({ id: "guarded-candidate" });
  mocks.load.mockResolvedValue({ rubric: { practice: { criteria: [{ id: "accuracy" }] } } });
  mocks.save.mockResolvedValue({ revision: 1, savedAt: "2026-11-20T15:00:00.000Z", submittedAt: null, result: null });
});

describe("practice Server Action security and state", () => {
  it("allows unanswered draft saves using session ownership and only server-confirmed timestamps", async () => {
    const result = await updatePractice(initial, form("save"));
    expect(mocks.save).toHaveBeenCalledWith("TEST_DB", "guarded-candidate", { scenarioId: "practice-id", scenarioVersion: 1, rubricVersion: 2, revision: 0, judgment: undefined, rubricSelections: {}, verifiedSourceIds: [], writtenJustification: "" }, false, "GENERALIST");
    expect(result).toMatchObject({ revision: 1, savedAt: "2026-11-20T15:00:00.000Z", submittedAt: null });
    expect(JSON.stringify(mocks.save.mock.calls)).not.toContain("PRIVATE_NOTES");
    expect(mocks.revalidate).toHaveBeenCalledWith("/dashboard");
  });

  it("associates missing submission controls with fields while preserving partial work", async () => {
    const data = form("submit"); data.set("writtenJustification", "  ");
    const result = await updatePractice(initial, data);
    expect(Object.keys(result.fieldErrors!)).toEqual(["judgment", "rating:accuracy", "writtenJustification"]);
    expect(result.values.writtenJustification).toBe("  ");
    expect(result.savedAt).toBeNull();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("passes varied prose verbatim for review rather than scoring its wording", async () => {
    const data = form("submit"); data.set("judgment", "TIE"); data.set("rating:accuracy", "BOTH_MEET");
    const prose = "DEMO - SYNTHETIC: Both answers meet the supplied rubric; my phrasing is independent.";
    data.set("writtenJustification", prose);
    const result = await updatePractice(initial, data);
    expect(mocks.save.mock.calls[0][2].writtenJustification).toBe(prose);
    expect(mocks.save.mock.calls[0][3]).toBe(true);
    expect(result.values.writtenJustification).toBe(prose);
  });

  it("fails before data access for an unauthorized role and sanitizes internal errors", async () => {
    mocks.guard.mockRejectedValueOnce(new Error("Forbidden"));
    await expect(updatePractice(initial, form("save"))).rejects.toThrow("Forbidden");
    expect(mocks.load).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
    mocks.save.mockRejectedValue(new Error("SECRET_DATABASE_CONNECTION_AND_KEYS"));
    const result = await updatePractice(initial, form("save"));
    expect(result.error).toContain("Practice could not be saved");
    expect(JSON.stringify(result)).not.toContain("SECRET_");
    expect(result.revision).toBe(0);
  });

  it("fixes each action's track on the server, ignoring forged track and credential fields", async () => {
    const data = form("save"); data.set("track", "GENERALIST"); data.set("passed", "true"); data.set("mode", "CAPSTONE");
    await updateTechnicalPreview(initial, data);
    expect(mocks.load).toHaveBeenCalledWith("TEST_DB", "guarded-candidate", "practice-id", "TECHNICAL_PREVIEW");
    expect(mocks.save.mock.calls[0][4]).toBe("TECHNICAL_PREVIEW");
    expect(mocks.save.mock.calls[0][2]).not.toHaveProperty("track");
    expect(mocks.save.mock.calls[0][2]).not.toHaveProperty("passed");
    mocks.guard.mockRejectedValue(new Error("Forbidden"));
    mocks.load.mockClear(); mocks.save.mockClear();
    await expect(updateTechnicalPreview(initial, data)).rejects.toThrow("Forbidden");
    expect(mocks.load).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
  });
});
