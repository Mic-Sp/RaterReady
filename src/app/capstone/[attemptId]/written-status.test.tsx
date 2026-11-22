// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CapstoneWorkspace } from "../../../server/capstone/workspace";
import { CapstoneExam } from "./workspace";

vi.mock("../workspace-actions", () => ({ autosaveCapstoneAction: vi.fn(), submitCapstoneExamAction: vi.fn(), syncCapstoneClockAction: vi.fn().mockResolvedValue(null) }));
afterEach(cleanup);
const initial: CapstoneWorkspace = { slots: [], snapshot: { id: "frozen-attempt", status: "PENDING_REVIEW", revision: 2,
  serverNow: "2026-11-21T12:30:00.000Z", startedAt: "2026-11-21T12:00:00.000Z", expiresAt: "2026-11-21T13:00:00.000Z", savedAt: "2026-11-21T12:29:00.000Z", submittedAt: "2026-11-21T12:30:00.000Z",
  deterministicScore: 95, blueprintVersion: 1, scoringPolicyVersion: 1 } };

describe("candidate written grading status privacy and accessibility", () => {
  it.each([
    ["QUEUED", "Written grading jobs are queued. Owner review is required before any final result."],
    ["EVALUATING", "Written grading checks are being evaluated. Owner review is required before any final result."],
    ["AWAITING_OWNER_REVIEW", "Written grading checks completed. Awaiting owner review."],
  ] as const)("announces %s without votes, review causes, keys, or premature results", (stage, message) => {
    const { container } = render(<CapstoneExam initial={{ ...initial, snapshot: { ...initial.snapshot, writtenGrading: stage } }} />);
    expect(screen.getByText(message).getAttribute("aria-live")).toBe("polite");
    expect(screen.getByRole("region", { name: "Written grading status" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Refresh grading status" })).toBeTruthy();
    expect(screen.getByText("Deterministic subtotal: 95 / 95")).toBeTruthy();
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    for (const privateField of ["rationale", "JUDGE_DISAGREEMENT", "alignment", "rawVoteJson", "answerKeyJson", "allowedAlternativesJson"]) expect(container.innerHTML).not.toContain(privateField);
    expect(screen.getByText(/final score and pass\/fail decision remain pending/)).toBeTruthy();
  });
});
