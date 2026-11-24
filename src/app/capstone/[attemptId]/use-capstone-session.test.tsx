// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CapstoneMutationResult, CapstoneSnapshot, CapstoneWorkspace } from "../../../server/capstone/workspace";
import { useCapstoneCountdown, useCapstoneSession } from "./use-capstone-session";
import { autosaveCapstoneAction } from "../workspace-actions";

vi.mock("../workspace-actions", () => ({ autosaveCapstoneAction: vi.fn(), syncCapstoneClockAction: vi.fn() }));
const initial: CapstoneWorkspace = { snapshot: { id: "attempt", status: "IN_PROGRESS", revision: 0, serverNow: "2026-11-21T12:00:00.000Z", startedAt: "2026-11-21T12:00:00.000Z", expiresAt: "2026-11-21T13:00:00.000Z", savedAt: null, submittedAt: null, deterministicScore: null, blueprintVersion: 1, scoringPolicyVersion: 1 },
  slots: Array.from({ length: 6 }, (_, index) => ({ position: index + 1, competency: "G1", writtenPrompt: "DEMO - SYNTHETIC prompt", title: "DEMO - SYNTHETIC case", scenarioVersion: 1, prompt: "Task", responseA: "A", responseB: "B", evidence: [],
    rubric: { code: "cap-rubric", version: 1, criteria: [], written: { alignment: { min: 0, max: 2, description: "Alignment" }, evidence: { min: 0, max: 2, description: "Evidence" }, clarity: { min: 0, max: 1, description: "Clarity" } } },
    draft: { position: index + 1, rubricSelections: {}, verifiedSourceIds: [], writtenJustification: "" } })) };

/** Server-confirmed acknowledgments carry revisions/timestamps, never optimistic browser save times. */
function saved(revision: number): CapstoneMutationResult {
  return { ok: true, code: "SAVED", snapshot: { ...initial.snapshot, revision, savedAt: `2026-11-21T12:00:0${revision}.000Z` } };
}
beforeEach(() => { vi.useFakeTimers(); vi.mocked(autosaveCapstoneAction).mockReset(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe("continuous Generalist Qualification Exam autosave", () => {
  it("debounces changes and reports saved timestamps only after the server acknowledges them", async () => {
    let acknowledge!: (value: CapstoneMutationResult) => void;
    vi.mocked(autosaveCapstoneAction).mockReturnValue(new Promise((resolve) => { acknowledge = resolve; }));
    const { result } = renderHook(() => useCapstoneSession(initial));
    act(() => result.current.edit(1, { judgment: "TIE" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(749); });
    expect(autosaveCapstoneAction).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(result.current.current.savedAt).toBeNull(); expect(result.current.saving).toBe(true);
    await act(async () => { acknowledge(saved(1)); });
    expect(result.current.current.savedAt).toBe(saved(1).snapshot!.savedAt); expect(result.current.dirty).toBe(false);
  });
  it("queues edits made in flight and never replaces newer prose with an older save acknowledgment", async () => {
    let acknowledge!: (value: CapstoneMutationResult) => void;
    vi.mocked(autosaveCapstoneAction).mockReturnValueOnce(new Promise((resolve) => { acknowledge = resolve; })).mockResolvedValueOnce(saved(2));
    const { result } = renderHook(() => useCapstoneSession(initial));
    act(() => result.current.edit(1, { judgment: "TIE" }));
    let pending!: Promise<boolean>; act(() => { pending = result.current.flush(); });
    act(() => result.current.edit(1, { writtenJustification: "DEMO - SYNTHETIC: newer reasoning" }));
    await act(async () => { acknowledge(saved(1)); await pending; });
    expect(autosaveCapstoneAction).toHaveBeenCalledTimes(2);
    expect(vi.mocked(autosaveCapstoneAction).mock.calls[1][0]).toMatchObject({ revision: 1, responses: [expect.objectContaining({ judgment: "TIE", writtenJustification: "DEMO - SYNTHETIC: newer reasoning" }), ...initial.slots.slice(1).map((s) => s.draft)] });
    expect(result.current.drafts[0].writtenJustification).toContain("newer reasoning"); expect(result.current.current.revision).toBe(2); expect(result.current.dirty).toBe(false);
  });
  it("pauses stale-tab autosave instead of advancing a forged revision or overwriting remote work", async () => {
    vi.mocked(autosaveCapstoneAction).mockResolvedValue({ ok: false, code: "CONFLICT", snapshot: { ...initial.snapshot, revision: 4 } });
    const { result } = renderHook(() => useCapstoneSession(initial));
    act(() => result.current.edit(1, { judgment: "TIE" }));
    await act(async () => { await result.current.flush(); });
    expect(result.current.blocked).toBe("CONFLICT"); expect(result.current.knownRevision()).toBe(0);
    await act(async () => { await result.current.retrySave(); });
    expect(autosaveCapstoneAction).toHaveBeenCalledTimes(1);
  });
  it("derives the display from server time and monotonic elapsed time, not the device wall clock", async () => {
    let elapsed = 0; vi.spyOn(performance, "now").mockImplementation(() => elapsed);
    const sync = vi.fn().mockResolvedValue(undefined);
    const snapshot: CapstoneSnapshot = { ...initial.snapshot, expiresAt: "2026-11-21T12:00:02.000Z" };
    const { result } = renderHook(() => useCapstoneCountdown(snapshot, sync));
    vi.setSystemTime(new Date("2099-01-01T00:00:00Z")); elapsed = 1000;
    await act(async () => { await vi.advanceTimersByTimeAsync(250); }); expect(result.current).toBe(1);
    elapsed = 2100; await act(async () => { await vi.advanceTimersByTimeAsync(500); }); expect(result.current).toBe(0); expect(sync).toHaveBeenCalledTimes(1);
  });
});
