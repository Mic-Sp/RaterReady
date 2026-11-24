// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WelcomeCheckIn } from "./check-in";
import WelcomePage from "./page";
import OnboardingPage from "../onboarding/page";

const mocks = vi.hoisted(() => ({ guard: vi.fn(), snapshot: vi.fn(), chooseLevel: vi.fn(), beginSkillsCheck: vi.fn(), skipSkillsCheck: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../../server/auth/page-access", () => ({ requirePageRole: mocks.guard }));
vi.mock("../../lib/prisma", () => ({ prisma: "TEST_DB" }));
vi.mock("../../server/learning/service", () => ({ getLearningSnapshot: mocks.snapshot }));
vi.mock("../learning/actions", () => mocks);
beforeEach(() => {
  vi.resetAllMocks(); mocks.guard.mockResolvedValue({ id: "guarded-learner" });
  mocks.snapshot.mockResolvedValue({ onboardingCompletedAt: null, selectedLevel: "FOUNDATIONS", diagnosticStatus: "NOT_STARTED" });
});
afterEach(cleanup);

describe("welcome check-in boundaries and semantics", () => {
  it("welcomes beginners, defines terms and exposes three optional native radio groups", async () => {
    render(await WelcomePage());
    expect(screen.getByRole("heading", { level: 1, name: "Welcome to RaterReady!" })).toBeDefined();
    expect(screen.getByText("There are no wrong answers here", { exact: false })).toBeDefined();
    expect(screen.getByText("large language model (LLM)", { exact: false })).toBeDefined();
    expect(screen.getByText("Reinforcement learning from human feedback (RLHF)", { exact: false })).toBeDefined();
    expect(screen.getByText("Ctrl+F (Cmd+F on a Mac)", { exact: false })).toBeDefined();
    expect(screen.getAllByRole("group", { name: /^[123]\./ })).toHaveLength(3);
    const radios = screen.getAllByRole("radio") as HTMLInputElement[];
    expect(radios).toHaveLength(9);
    expect(radios.every((radio) => !radio.checked && !radio.required && radio.labels?.length)).toBe(true);
    expect(document.querySelector(".welcome-check-in form")).toBeNull();
    expect(screen.getAllByRole("button", { name: /^Choose (Foundations|Intermediate Practice|Advanced Calibration)$/ })).toHaveLength(3);
    const disclosures = within(screen.getByRole("complementary", { name: "Non-certifying welcome check-in" }));
    expect(disclosures.getByText("85% passing standard for a finalized Generalist Qualification Exam after owner review", { exact: false })).toBeDefined();
    expect(disclosures.getByText("never grants a credential", { exact: false })).toBeDefined();
    expect(disclosures.getByText("only a learning level you choose is saved", { exact: false })).toBeDefined();
    expect(disclosures.getByText("internal Generalist competency identifiers", { exact: false })).toBeDefined();
    expect(mocks.snapshot).toHaveBeenCalledWith("TEST_DB", "guarded-learner");
  });

  it.each([[0, "Foundations"], [1, "Intermediate Practice"], [2, "Advanced Calibration"]] as const)("recommends %s with a focused heading, one-click explicit choice and unrestricted alternatives", (index, title) => {
    render(<WelcomeCheckIn />);
    for (const group of screen.getAllByRole("group")) fireEvent.click(within(group).getAllByRole("radio")[index]);
    fireEvent.click(screen.getByRole("button", { name: "Show my starting suggestion" }));
    const result = within(screen.getByRole("region", { name: "A starting point for you" }));
    expect(result.getByRole("heading", { name: title })).toBeDefined();
    expect(document.activeElement).toBe(result.getByRole("heading", { name: "A starting point for you" }));
    const form = result.getByRole("button", { name: `Start with ${title}` }).closest("form")!;
    expect(new FormData(form).get("level")).toBe(["FOUNDATIONS", "INTERMEDIATE", "ADVANCED"][index]);
    expect([...new FormData(form).keys()]).toEqual(["level"]);
    expect(screen.getAllByRole("button", { name: /^Choose (Foundations|Intermediate Practice|Advanced Calibration)$/ })).toHaveLength(3);
    expect(mocks.chooseLevel).not.toHaveBeenCalled();
    expect(mocks.beginSkillsCheck).not.toHaveBeenCalled();
  });

  it("allows blank/partial check-ins, hides stale advice on editing and never changes a previously selected level", () => {
    render(<WelcomeCheckIn selected="ADVANCED" />);
    fireEvent.click(screen.getByRole("button", { name: "Show my starting suggestion" }));
    expect(screen.getByText("Choose any starting level")).toBeDefined();
    expect(screen.queryByRole("button", { name: /^Start with/ })).toBeNull();
    expect(screen.getByRole("link", { name: "Skip the check-in and return to dashboard" }).getAttribute("href")).toBe("/dashboard");
    fireEvent.click(screen.getAllByRole("radio")[0]);
    expect(screen.queryByRole("region", { name: "A starting point for you" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show my starting suggestion" }));
    expect(screen.getByText("You left some questions open.", { exact: false })).toBeDefined();
    expect(screen.getByRole("link", { name: "Try the Workflow Skills Lab" }).getAttribute("href")).toBe("/workflow-lab");
    expect(within(screen.getByRole("region", { name: "Advanced Calibration" })).getByText("Current level")).toBeDefined();
    expect(mocks.chooseLevel).not.toHaveBeenCalled();
  });

  it("keeps welcome entry, direct choices and the separate skills diagnostic available on onboarding", async () => {
    render(await OnboardingPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole("link", { name: "Try the welcome check-in" }).getAttribute("href")).toBe("/welcome");
    expect(screen.getByRole("button", { name: "Take the optional skills check" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Choose Advanced Calibration" })).toBeDefined();
  });

  it("withholds welcome content and profile lookups if the candidate guard fails", async () => {
    mocks.guard.mockRejectedValue(new Error("Forbidden"));
    await expect(WelcomePage()).rejects.toThrow("Forbidden");
    expect(mocks.guard).toHaveBeenCalledWith("CANDIDATE");
    expect(mocks.snapshot).not.toHaveBeenCalled();
  });
});
