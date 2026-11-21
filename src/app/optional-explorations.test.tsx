// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
  it("offers a labeled, reversible self-check with polite feedback and explicit optional/rules notices", async () => {
    render(await WorkflowLabPage());
    expect(screen.getByText(/not required to earn the Generalist credential/).textContent).toContain("optional");
    expect(screen.getByRole("complementary").textContent).toContain("third-party assessment or employer");
    const controls = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(controls).toHaveLength(5);
    for (const control of controls) {
      expect(control.labels?.[0].textContent?.length).toBeGreaterThan(10);
      expect(document.getElementById(control.getAttribute("aria-describedby")!)).not.toBeNull();
    }
    fireEvent.click(controls[0]); fireEvent.click(controls[4]);
    expect(screen.getByRole("status").textContent).toContain("2 of 5");
    expect(screen.getByRole("status").getAttribute("aria-live")).toBe("polite");
    fireEvent.click(screen.getByRole("button", { name: "Reset self-check" }));
    expect(controls.every((control) => !control.checked)).toBe(true);
    expect(document.querySelector("form")).toBeNull();
    expect(mocks.list).not.toHaveBeenCalled(); expect(mocks.load).not.toHaveBeenCalled();
  });

  it("fixes the preview catalog/workspace track before loading any learner-facing metadata", async () => {
    render(await TechnicalPreviewPage());
    expect(screen.getByRole("complementary").textContent).toContain("do not grant a Technical credential or alter Generalist capstone eligibility");
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
