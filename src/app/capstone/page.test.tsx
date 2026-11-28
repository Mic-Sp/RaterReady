// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CapstoneReadinessPage from "./page";
import type { CapstoneReadiness } from "../../server/capstone/service";

const mocks = vi.hoisted(() => ({ guard: vi.fn(), readiness: vi.fn(), start: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../../lib/prisma", () => ({ prisma: "TEST_DB" }));
vi.mock("../../server/auth/page-access", () => ({ requirePageRole: mocks.guard }));
vi.mock("../../server/capstone/service", () => ({ getCapstoneReadiness: mocks.readiness }));
vi.mock("./actions", () => ({ resumeCapstoneAction: vi.fn(), startCapstoneAction: mocks.start }));
vi.mock("./server-status-refresh", () => ({ ServerStatusRefresh: () => null }));
vi.mock("../components/account-link-forms", () => ({ VerificationRequestForm: () => <button>Send / resend verification link</button> }));

const base: CapstoneReadiness = {
  kind: "MISSING_PRACTICE", serverNow: "2026-11-20T12:00:00.000Z", timeMultiplier: 1.5, grantedSeconds: 5400,
  practiced: [], missingPractice: ["G1", "G2", "G3", "G4", "G5", "G6"], practiceSubmissionCounts: { G1: 0, G2: 0, G3: 0, G4: 0, G5: 0, G6: 0 },
  remainingForms: 2, cooldownUntil: null, attempt: null, lastExpiredAt: null,
  blueprint: { id: "blueprint", code: "demo-generalist-capstone", version: 1, title: "DEMO - SYNTHETIC blueprint", baseDurationSeconds: 3600, retakeCooldownHours: 48,
    requireGeneralistPractice: true, questionCount: 6, writtenPromptCount: 3, independentWorkPolicyVersion: "independent-work-v1",
    rules: ["Do not use external generative AI assistants such as ChatGPT, Claude or Gemini.", "Traditional search engines and ordinary notes are permitted."],
    scoringPolicy: { code: "capstone-scoring", version: 1, passingThreshold: 85, judgment: 40, rubric: 30, verification: 25, written: 5 } },
};
const ready: CapstoneReadiness = {
  ...base, kind: "READY", practiced: ["G1", "G2", "G3", "G4", "G5", "G6"], missingPractice: [],
  practiceSubmissionCounts: { G1: 2, G2: 1, G3: 2, G4: 2, G5: 1, G6: 2 },
};

async function renderEntry(notice?: string) {
  return render(await CapstoneReadinessPage({ searchParams: Promise.resolve({ notice }) }));
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.guard.mockResolvedValue({ id: "guarded-candidate" });
  mocks.readiness.mockResolvedValue(base);
});
afterEach(cleanup);

describe("Generalist Qualification Exam readiness page", () => {
  it("explains email verification while keeping learning available and start disabled", async () => {
    mocks.readiness.mockResolvedValue({ ...ready, kind: "EMAIL_UNVERIFIED" });
    const { container } = await renderEntry();
    expect(screen.getByRole("heading", { name: "Verify your email to start" })).toBeDefined();
    expect(screen.getByText(/you can keep learning and practicing/)).toBeDefined();
    expect(screen.getByRole("button", { name: "Send / resend verification link" })).toBeDefined();
    expect((screen.getByRole("button", { name: "Start Qualification Exam" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("checkbox") as HTMLInputElement).disabled).toBe(true);
    expect(container.querySelector('[name="blueprintId"]')).toBeNull();
  });

  it("checks the exact page role before any readiness lookup", async () => {
    mocks.guard.mockRejectedValue(new Error("Forbidden"));
    await expect(renderEntry()).rejects.toThrow("Forbidden");
    expect(mocks.guard).toHaveBeenCalledWith("CANDIDATE");
    expect(mocks.readiness).not.toHaveBeenCalled();
  });

  it("summarizes the exam, points to a missing area and collapses scoring and timing details", async () => {
    const { container } = await renderEntry("PRIVATE_MESSAGE");
    expect(screen.getByText("60 minutes · 6 scenarios (3 with short written answers) · Pass at 85% · Retakes allowed after 48 hours.")).toBeDefined();
    expect(screen.getByText(/^Your time limit:/).textContent).toBe("Your time limit: 90 minutes.");
    const readiness = within(screen.getByRole("region", { name: "Before you start" }));
    expect(container.querySelectorAll(".exam-checklist > li")).toHaveLength(3);
    expect(readiness.getByText("0 of 6 areas practiced")).toBeDefined();
    expect(readiness.getByText(/6 to go/)).toBeDefined();
    expect(readiness.getByRole("link", { name: "How ready am I?" }).getAttribute("href")).toBe("/practice?competency=G1");
    expect(readiness.getByRole("heading", { name: "Finish practicing all six areas" })).toBeDefined();
    expect((readiness.getByRole("button", { name: "Start Qualification Exam" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText("PRIVATE_MESSAGE")).toBeNull();
    expect(container.querySelector('[role="progressbar"], .threshold-track')).toBeNull();

    const summary = screen.getByText("Exam details");
    expect(summary.closest("details")?.open).toBe(false);
    await userEvent.setup().click(summary);
    expect(summary.closest("details")?.open).toBe(true);
    for (const text of ["Passing threshold: 85%", "2 exam forms available", "1.5×", "independent-work-v1", "40 points", "30 points", "25 points", "5 points"]) {
      expect(screen.getByText(text, { exact: true })).toBeDefined();
    }
    expect(screen.getByText(/you can try again after 48 hours with a fresh set of scenarios/)).toBeDefined();
  });

  it("keeps start disabled until the learner accepts and offers extra practice without blocking eligibility", async () => {
    mocks.readiness.mockResolvedValue(ready);
    const { container, rerender } = await renderEntry();
    const start = screen.getByRole<HTMLButtonElement>("button", { name: "Start Qualification Exam" });
    const consent = screen.getByRole<HTMLInputElement>("checkbox", { name: /I have read and will follow/ });
    const browserUser = userEvent.setup();
    expect(screen.getByRole("heading", { name: "You're eligible to start" })).toBeDefined();
    expect(screen.getByText("6 of 6 areas practiced")).toBeDefined();
    expect(screen.getByRole("link", { name: "How ready am I?" }).getAttribute("href")).toBe("/practice?competency=G2");
    expect(screen.getByText("G5 · Safety & Policy Awareness").parentElement?.textContent).toContain("1 submission");
    expect(start.previousElementSibling).toBe(screen.getByText(/timer starts immediately and cannot be paused/).parentElement);
    expect(start.disabled).toBe(true);
    expect(consent.checked).toBe(false);
    expect(container.querySelector<HTMLInputElement>('[name="independentWorkPolicyVersion"]')?.value).toBe("independent-work-v1");
    const policy = screen.getByText("Read the Independent-Work Policy");
    expect(policy.closest("details")?.open).toBe(false);
    await browserUser.click(policy);
    expect(policy.closest("details")?.querySelectorAll("li")).toHaveLength(2);
    await browserUser.click(consent);
    expect(start.disabled).toBe(false);
    await browserUser.click(consent);
    expect(start.disabled).toBe(true);

    await browserUser.click(consent);
    mocks.readiness.mockResolvedValue({ ...ready, blueprint: { ...ready.blueprint!, independentWorkPolicyVersion: "independent-work-v2" } });
    rerender(await CapstoneReadinessPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole<HTMLInputElement>("checkbox", { name: /I have read and will follow/ }).checked).toBe(false);
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Start Qualification Exam" }).disabled).toBe(true);
    expect(mocks.start).not.toHaveBeenCalled();
  });
});
