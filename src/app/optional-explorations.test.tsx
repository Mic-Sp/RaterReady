// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WorkflowLabPage from "./workflow-lab/page";
import TechnicalPreviewPage from "./technical-preview/page";
import TechnicalExercisePage from "./technical-preview/[scenarioId]/page";

const mocks = vi.hoisted(() => ({ guard: vi.fn(), list: vi.fn(), load: vi.fn(), notFound: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../server/auth/page-access", () => ({ requirePageRole: mocks.guard }));
vi.mock("../lib/prisma", () => ({ prisma: "TEST_DB" }));
vi.mock("../server/practice/workspace", () => ({ listPracticeScenarios: mocks.list, loadPracticeWorkspace: mocks.load }));
vi.mock("./practice/workspace", () => ({ PracticeWorkspace: () => null }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));

beforeEach(() => { vi.resetAllMocks(); mocks.guard.mockResolvedValue({ id: "guarded-learner" }); mocks.list.mockResolvedValue([]); });
afterEach(cleanup);

describe("optional exploration boundaries and semantics", () => {
  it("frames the lab as pre-flight setup with one active example and a collapsed lesson reference", async () => {
    const { container } = render(await WorkflowLabPage());
    expect(screen.getByText(/optional, unscored pre-flight workspace setup guide/)).toBeDefined();
    const setup = screen.getByRole("region", { name: "Set up your workspace" });
    const steps = within(setup).getByRole("navigation", { name: "Setup steps" });
    expect(within(steps).getAllByRole("button")).toHaveLength(5);
    const panel = within(setup).getByRole("region", { name: "Arrange your comparison windows" });
    expect(within(setup).queryByRole("region", { name: "Set up tabs and zoom" })).toBeNull();
    expect(within(panel).getByText("Why this matters.")).toBeDefined();
    expect(within(panel).getByText("DEMO - SYNTHETIC")).toBeDefined();
    expect(within(panel).getByText("Rushed setup")).toBeDefined();
    expect(within(panel).getByText("Ready workspace")).toBeDefined();
    expect(screen.getByRole("link", { name: "Try these habits in Generalist practice" }).getAttribute("href")).toBe("/practice");
    expect(screen.getByRole("link", { name: "Return to dashboard" }).getAttribute("href")).toBe("/dashboard");
    const reference = screen.getByText("Reference: The Seven-Step Evaluation Method (taught in the lessons)");
    expect(container.querySelector("article")?.lastElementChild).toBe(reference.closest("details"));
    expect(reference.closest("details")?.open).toBe(false);
    await userEvent.setup().click(reference);
    expect(screen.getByRole("link", { name: "Open the Generalist lessons" }).getAttribute("href")).toBe("/learn");
  });

  it("keeps the setup checks client-only and preserves optional and assessment rules disclosures", async () => {
    render(await WorkflowLabPage());
    expect(screen.getByText(/not required to earn the Generalist credential/).textContent).toContain("optional");
    expect(screen.getByRole("complementary").textContent).toContain("third-party assessment or employer");
    await userEvent.setup().click(screen.getByRole("radio", { name: "One window is easier to read" }));
    expect(screen.getByText("1 of 5 complete")).toBeDefined();
    expect(document.querySelector("form")).toBeNull();
    expect(mocks.list).not.toHaveBeenCalled(); expect(mocks.load).not.toHaveBeenCalled();
  });

  it("fixes the preview catalog/workspace track before loading any learner-facing metadata", async () => {
    render(await TechnicalPreviewPage());
    expect(screen.getByRole("complementary").textContent).toContain("do not grant a Technical credential or alter Generalist Qualification Exam eligibility");
    expect(mocks.list).toHaveBeenCalledWith("TEST_DB", {}, "TECHNICAL_PREVIEW");
    mocks.load.mockResolvedValue({ scenario: { id: "preview-id" }, draft: null });
    await TechnicalExercisePage({ params: Promise.resolve({ scenarioId: "preview-id" }) });
    expect(mocks.load).toHaveBeenCalledWith("TEST_DB", "guarded-learner", "preview-id", "TECHNICAL_PREVIEW");
  });

  it("denies unauthorized roles before any catalog, draft or exercise lookup", async () => {
    mocks.guard.mockRejectedValue(new Error("Forbidden"));
    for (const page of [WorkflowLabPage, TechnicalPreviewPage, () => TechnicalExercisePage({ params: Promise.resolve({ scenarioId: "private" }) })]) {
      await expect(page()).rejects.toThrow("Forbidden");
    }
    expect(mocks.guard).toHaveBeenCalledWith("CANDIDATE");
    expect(mocks.list).not.toHaveBeenCalled(); expect(mocks.load).not.toHaveBeenCalled();
  });
});
