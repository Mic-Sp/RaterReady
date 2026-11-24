// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PracticeWorkspace } from "./workspace";
import type { loadPracticeWorkspace } from "../../server/practice/workspace";
import { expandedPracticeScenarios, practiceRubric } from "../../../prisma/practice-fixtures";
import { evaluatePracticeScenario, practiceSubmissionSchema } from "../../server/domain/practice-scoring";

const mocks = vi.hoisted(() => ({ generalist: vi.fn(), technical: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./actions", () => ({ updatePractice: mocks.generalist, updateTechnicalPreview: mocks.technical }));
type Data = Awaited<ReturnType<typeof loadPracticeWorkspace>>;

/** Construct only a key-free workspace; server-only fixture keys are used separately to prepare acknowledged feedback. */
function workspace(index = 0, track: "GENERALIST" | "TECHNICAL_PREVIEW" = "GENERALIST"): Data {
  const fixture = expandedPracticeScenarios[index];
  const written = practiceRubric.criteriaJson.written;
  return { draft: null, result: undefined, scenario: { id: `practice-${index}`, familyId: "family", track, version: 1,
    title: fixture.title, difficulty: fixture.difficulty, competencies: [{ code: "G1", title: "Rubric Interpretation" }], competencyDisclosure: "G1–G6 are internal identifiers.",
    demoLabel: "DEMO - SYNTHETIC", prompt: fixture.prompt, responseA: fixture.responseA, responseB: fixture.responseB, evidence: fixture.evidenceJson.sources,
    rubric: { ...practiceRubric.criteriaJson, id: "rubric", code: practiceRubric.code, version: 2,
      deterministicWeights: { evaluationJudgment: 40, rubricApplication: 30, factualVerification: 25 }, writtenWeight: 5,
      written: { alignment: { ...written.alignment, min: 0, max: 2 }, evidence: { ...written.evidence, min: 0, max: 2 }, clarity: { ...written.clarity, min: 0, max: 1 } } } } };
}

/** Synthetic submitted state mirrors the safe server evaluator response without passing keys to the component. */
function submitted(index = 0, judgment: "A_BETTER" | "B_BETTER" | "TIE" = "B_BETTER") {
  const fixture = expandedPracticeScenarios[index];
  const parsed = practiceSubmissionSchema.parse({ scenarioId: `practice-${index}`, scenarioVersion: 1, rubricVersion: 2,
    ...fixture.answerKeyJson, judgment, writtenJustification: "DEMO - SYNTHETIC: my submitted reasoning." });
  const values = { judgment: parsed.judgment, rubricSelections: parsed.rubricSelections, verifiedSourceIds: parsed.verifiedSourceIds, writtenJustification: parsed.writtenJustification! };
  const result = evaluatePracticeScenario({ ...fixture, id: `practice-${index}`, bank: "PRACTICE", status: "PUBLISHED", track: "GENERALIST", isSyntheticFixture: true,
    rubric: { ...practiceRubric, id: "rubric" } }, { scenarioId: `practice-${index}`, scenarioVersion: 1, rubricVersion: 2, ...values });
  return { sequence: 1, revision: 1, savedAt: "2026-11-24T12:00:00.000Z", submittedAt: "2026-11-24T12:00:00.000Z", values, result, message: "Practice submitted. Your feedback is ready." };
}

beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);
describe("source-first practice and explicit results lifecycle", () => {
  it.each(["GENERALIST", "TECHNICAL_PREVIEW"] as const)("orders %s context, evidence, pinned rubric and outputs before controls", (track) => {
    render(<PracticeWorkspace {...workspace(0, track)} />);
    const headings = screen.getAllByRole("heading").map((heading) => heading.textContent);
    const order = ["Task prompt", "Supplied verification evidence", "Pinned evaluation rubric", "Response A", "Response B", "Your independent evaluation"].map((title) => headings.indexOf(title));
    expect(order.every((position, index) => position >= 0 && (index === 0 || position > order[index - 1]))).toBe(true);
    expect(screen.queryByText(/Accepted answer/)).toBeNull();
  });

  it.each(["GENERALIST", "TECHNICAL_PREVIEW"] as const)("replaces a submitted %s form with locked results and resets to empty inputs", async (track) => {
    const user = userEvent.setup();
    const acknowledgment = submitted();
    const action = track === "GENERALIST" ? mocks.generalist : mocks.technical;
    action.mockResolvedValueOnce(acknowledgment).mockResolvedValueOnce({ sequence: 2, revision: 2, savedAt: acknowledgment.savedAt, submittedAt: null, intent: "reset",
      values: { rubricSelections: {}, verifiedSourceIds: [], writtenJustification: "" }, message: "New practice attempt ready." });
    render(<PracticeWorkspace {...workspace(0, track)} />);
    await user.click(screen.getByRole("button", { name: "Submit for evaluation" }));
    const results = await screen.findByRole("region", { name: "Results & Feedback" });
    expect(document.activeElement).toBe(within(results).getByRole("heading", { name: "Results & Feedback" }));
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Submit for evaluation" })).toBeNull();
    expect(within(results).getByText("Your selection: Response (B)")).toBeDefined();
    expect(within(results).getByText("Accepted answer(s): Response (B)")).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Start new attempt" }));
    await screen.findByRole("group", { name: "Comparative judgment" });
    expect(screen.getAllByRole("radio").every((control) => !(control as HTMLInputElement).checked)).toBe(true);
    expect(screen.getAllByRole("checkbox").every((control) => !(control as HTMLInputElement).checked)).toBe(true);
    expect((screen.getByRole("textbox", { name: "Written justification" }) as HTMLTextAreaElement).value).toBe("");
    expect(document.activeElement).toBe(screen.getAllByRole("radio")[0]);
    expect(screen.queryByRole("region", { name: "Results & Feedback" })).toBeNull();
    expect((action.mock.calls[1][1] as FormData).get("intent")).toBe("reset");
    expect((action.mock.calls[1][1] as FormData).get("revision")).toBe("1");
  });

  it.each([[0, "A_BETTER", "Response (A)"], [0, "TIE", "Tie — Response (A) and Response (B) are equally rated"],
    [5, "TIE", "Valid Tie — Response (A) and Response (B) are equally rated"]] as const)("restores results with truthful choice labels for scenario %i and %s", (index, judgment, label) => {
    const data = workspace(index); const state = submitted(index, judgment);
    render(<PracticeWorkspace {...data} draft={{ scenarioId: data.scenario.id, scenarioVersion: 1, rubricVersion: 2, revision: 1,
      savedAt: state.savedAt, submittedAt: state.submittedAt, ...state.values }} result={state.result} />);
    expect(screen.getByText(`Your selection: ${label}`)).toBeDefined();
    expect(screen.queryByRole("button", { name: "Submit for evaluation" })).toBeNull();
    expect(screen.getByRole("button", { name: "Start new attempt" })).toBeDefined();
    if (index === 5) expect(screen.getByText(/^Accepted answer/).textContent).toContain("Response (A); Valid Tie");
  });
});
