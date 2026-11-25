import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CapstoneReadinessPage from "./page";
import type { CapstoneReadiness } from "../../server/capstone/service";

const mocks = vi.hoisted(() => ({ guard: vi.fn(), readiness: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../../lib/prisma", () => ({ prisma: "TEST_DB" }));
vi.mock("../../server/auth/page-access", () => ({ requirePageRole: mocks.guard }));
vi.mock("../../server/capstone/service", () => ({ getCapstoneReadiness: mocks.readiness }));
vi.mock("./actions", () => ({ resumeCapstoneAction: vi.fn() }));
vi.mock("./start-form", () => ({ CapstoneStartForm: () => <p>START_FORM_SENTINEL</p> }));
vi.mock("./server-status-refresh", () => ({ ServerStatusRefresh: () => null }));
vi.mock("../credentials/actions", () => ({ updateCredentialSharingAction: vi.fn() }));
vi.mock("../appeals/actions", () => ({ submitAppealAction: vi.fn() }));
const base: CapstoneReadiness = { kind: "MISSING_PRACTICE", serverNow: "2026-11-20T12:00:00.000Z", timeMultiplier: 1.5,
  grantedSeconds: 5400, practiced: [], missingPractice: ["G1", "G2", "G3", "G4", "G5", "G6"], remainingForms: 2, cooldownUntil: null, attempt: null, lastExpiredAt: null,
  blueprint: { id: "blueprint", code: "demo-generalist-capstone", version: 1, title: "DEMO - SYNTHETIC blueprint", baseDurationSeconds: 3600, retakeCooldownHours: 48,
    requireGeneralistPractice: true, questionCount: 6, writtenPromptCount: 3, independentWorkPolicyVersion: "independent-work-v1", rules: ["Independent work only; no generative AI assistants."],
    scoringPolicy: { code: "capstone-scoring", version: 1, passingThreshold: 85, judgment: 40, rubric: 30, verification: 25, written: 5 } } };
beforeEach(() => { vi.resetAllMocks(); mocks.guard.mockResolvedValue({ id: "guarded-candidate" }); mocks.readiness.mockResolvedValue(base); });

describe("Generalist Qualification Exam readiness page", () => {
  it("checks the exact page role before any readiness lookup", async () => {
    mocks.guard.mockRejectedValue(new Error("Forbidden"));
    await expect(CapstoneReadinessPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("Forbidden");
    expect(mocks.guard).toHaveBeenCalledWith("CANDIDATE"); expect(mocks.readiness).not.toHaveBeenCalled();
  });
  it("shows requirements, accommodation and unchanged passing standard; start form appears only when eligible", async () => {
    const html = renderToStaticMarkup(await CapstoneReadinessPage({ searchParams: Promise.resolve({ notice: "PRIVATE_MESSAGE" }) }));
    expect(html).toContain("Generalist practice still needed"); expect(html).toContain("85%");
    expect(html).toContain("Diagnostic scores, Workflow Skills Lab completion and Technical Preview exercises never waive");
    expect(html).toContain("Profile timing multiplier: 1.5"); expect(html).not.toContain("START_FORM_SENTINEL"); expect(html).not.toContain("PRIVATE_MESSAGE");
    mocks.readiness.mockResolvedValue({ ...base, kind: "READY" });
    expect(renderToStaticMarkup(await CapstoneReadinessPage({ searchParams: Promise.resolve({}) }))).toContain("START_FORM_SENTINEL");
  });
  it("groups server-derived scoring, timing and coverage into cards without inventing eligibility", async () => {
    mocks.readiness.mockResolvedValue({ ...base, practiced: ["G1"], missingPractice: ["G2", "G3", "G4", "G5", "G6"] });
    const html = renderToStaticMarkup(await CapstoneReadinessPage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain('class="blueprint-grid"');
    expect(html).toContain('class="timing-grid"');
    expect(html).toContain('class="readiness-coverage"');
    expect(html.match(/Practice submitted/g)).toHaveLength(1);
    expect(html.match(/Practice still needed/g)).toHaveLength(5);
    for (const points of [40, 30, 25, 5]) expect(html).toContain(`<dd>${points} <span>points</span></dd>`);
    expect(html).toContain("85% passing standard");
    expect(html).toContain("No active cooldown");
    expect(html).not.toContain("START_FORM_SENTINEL");
  });
});
