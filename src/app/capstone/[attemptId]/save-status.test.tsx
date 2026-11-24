// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CapstoneExam } from "./workspace";
import { CapstoneSaveStatus } from "./save-status";
import type { CapstoneMutationResult, CapstoneWorkspace } from "../../../server/capstone/workspace";

const mocks = vi.hoisted(() => ({ autosave: vi.fn(), sync: vi.fn() }));
vi.mock("../workspace-actions", () => ({ autosaveCapstoneAction: mocks.autosave, syncCapstoneClockAction: mocks.sync, submitCapstoneExamAction: vi.fn() }));
vi.mock("../../credentials/actions", () => ({ updateCredentialSharingAction: vi.fn() }));
vi.mock("../../appeals/actions", () => ({ submitAppealAction: vi.fn() }));
const initial: CapstoneWorkspace = { snapshot: { id: "attempt", status: "IN_PROGRESS", revision: 0,
  serverNow: "2026-11-24T12:00:00.000Z", startedAt: "2026-11-24T12:00:00.000Z", expiresAt: "2026-11-24T13:00:00.000Z",
  savedAt: null, submittedAt: null, deterministicScore: null, blueprintVersion: 1, scoringPolicyVersion: 1 },
  slots: Array.from({ length: 6 }, (_, index) => ({ position: index + 1, competency: "G1", title: "DEMO - SYNTHETIC task", writtenPrompt: "Use the evidence.", scenarioVersion: 1,
    prompt: "Task context", responseA: "Output A", responseB: "Output B", evidence: [{ id: "source", text: "Supplied policy and evidence" }],
    rubric: { code: "pinned-rubric", version: 1, criteria: [], written: { alignment: { min: 0, max: 2, description: "Alignment" }, evidence: { min: 0, max: 2, description: "Evidence" }, clarity: { min: 0, max: 1, description: "Clarity" } } },
    draft: { position: index + 1, rubricSelections: {}, verifiedSourceIds: [], writtenJustification: "" } })) };
beforeEach(() => { vi.useFakeTimers(); vi.resetAllMocks(); HTMLElement.prototype.scrollIntoView = vi.fn(); mocks.sync.mockResolvedValue(initial.snapshot); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("source-first Generalist Qualification Exam and truthful live save confirmation", () => {
  it("orders the task, evidence, pinned rubric and A/B outputs before the form", () => {
    render(<CapstoneExam initial={initial} />);
    const headings = screen.getAllByRole("heading").map((heading) => heading.textContent);
    const order = ["Task prompt", "Supplied source material", "Pinned evaluation rubric", "Response A", "Response B"].map((title) => headings.indexOf(title));
    expect(order.every((position, index) => position >= 0 && (index === 0 || position > order[index - 1]))).toBe(true);
    const responseB = screen.getByRole("heading", { name: "Response B" });
    expect(responseB.compareDocumentPosition(screen.getByRole("form", { name: "Slot 1 evaluation" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("announces debounced and manual saves only after server acknowledgment and withdraws the saved state on new edits", async () => {
    let acknowledge!: (value: CapstoneMutationResult) => void;
    mocks.autosave.mockImplementation(() => new Promise((resolve) => { acknowledge = resolve; }));
    render(<CapstoneExam initial={initial} />);
    const status = screen.getByRole("status", { name: "Qualification Exam save status" });
    const input = screen.getByRole("textbox", { name: "Written justification for slot 1" });
    fireEvent.change(input, { target: { value: "DEMO - SYNTHETIC: independent reasoning" } });
    expect(status.getAttribute("data-save-state")).toBe("unsaved");
    await act(async () => { await vi.advanceTimersByTimeAsync(750); });
    expect(status.getAttribute("data-save-state")).toBe("saving");
    expect(status.textContent).not.toContain("Saved to server at");
    const first = { ...initial.snapshot, revision: 1, savedAt: "2026-11-24T12:00:05.000Z" };
    await act(async () => { acknowledge({ ok: true, code: "SAVED", snapshot: first }); });
    expect(status.getAttribute("data-save-state")).toBe("saved");
    expect(status.textContent).toContain("Saved to server at 12:00:05 UTC");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(document.querySelectorAll('[aria-live="polite"]').length).toBe(1);
    const inline = screen.getByRole("form", { name: "Slot 1 evaluation" }).querySelector(".capstone-save-status")!;
    expect(inline.textContent).toContain("Saved to server at 12:00:05 UTC");
    expect(inline.hasAttribute("aria-live")).toBe(false);
    expect(status.querySelector("time")?.dateTime).toBe(first.savedAt);
    fireEvent.change(input, { target: { value: "DEMO - SYNTHETIC: revised reasoning" } });
    expect(status.getAttribute("data-save-state")).toBe("unsaved");
    expect(status.textContent).not.toContain("Saved to server at");
    fireEvent.click(screen.getByRole("button", { name: "Save now" }));
    expect(status.getAttribute("data-save-state")).toBe("saving");
    await act(async () => { acknowledge({ ok: true, code: "SAVED", snapshot: { ...first, revision: 2, savedAt: "2026-11-24T12:00:09.000Z" } }); });
    expect(status.textContent).toContain("Saved to server at 12:00:09 UTC");
    expect(inline.textContent).toContain("Saved to server at 12:00:09 UTC");
    expect(status.textContent).toContain("revision 2");
    expect(mocks.autosave).toHaveBeenCalledTimes(2);
  });

  it.each([{ dirty: true }, { saving: true }, { blocked: "CONFLICT" as const }, { clockError: true }])("does not present historical saves as current success when %j", (patch) => {
    render(<CapstoneSaveStatus session={{ current: { ...initial.snapshot, revision: 1, savedAt: "2026-11-24T12:00:05.000Z" }, dirty: false, saving: false, blocked: null, clockError: false, message: "Check saved work.", ...patch }} />);
    const status = screen.getByRole("status", { name: "Qualification Exam save status" });
    expect(status.getAttribute("data-save-state")).not.toBe("saved");
    expect(status.textContent).not.toContain("Saved to server at");
    expect(status.textContent).toContain("Last server-confirmed save:");
  });
});
