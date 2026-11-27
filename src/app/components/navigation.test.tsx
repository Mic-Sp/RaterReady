// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthenticatedNavigation } from "./authenticated-navigation";
import { EvaluationReference } from "./evaluation-reference";
import { RubricGuide } from "./rubric-guide";
import type { AuthIdentity } from "../../server/auth/accounts";

const mocks = vi.hoisted(() => ({ pathname: "/practice/synthetic-scenario", signOut: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname }));
vi.mock("../actions/session", () => ({ submitSignOut: mocks.signOut }));
const candidate: AuthIdentity = { id: "demo", accountCode: "demo-marcus", name: "Marcus Vance", role: "CANDIDATE", sessionVersion: 0, isSyntheticFixture: true, emailVerifiedAt: "2026-11-20T00:00:00.000Z", demoLabel: "DEMO - SYNTHETIC" };
afterEach(cleanup);

describe("shared authenticated navigation", () => {
  it("exposes all candidate destinations, identity and one sign-out control", async () => {
    render(<AuthenticatedNavigation user={candidate} />);
    const nav = screen.getByRole("navigation", { name: "Main navigation" });
    const [core] = within(nav).getAllByRole("list");
    expect(within(core).getAllByRole("link").map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Dashboard", "/dashboard"], ["Learn", "/learn"], ["Practice", "/practice"], ["Exam", "/capstone"], ["Opportunities", "/opportunities"],
    ]);
    expect(within(nav).getByRole("link", { name: "Practice", current: "location" })).toBeDefined();
    expect(screen.getByText(candidate.name)).toBeDefined();
    expect(screen.getByText("Candidate")).toBeDefined();
    expect(screen.getByText("DEMO - SYNTHETIC")).toBeDefined();
    const user = userEvent.setup();
    const explore = within(nav).getByText("Explore", { exact: true });
    expect(explore.closest("details")?.open).toBe(false);
    await user.click(explore);
    expect(explore.closest("details")?.open).toBe(true);
    const optional = within(nav).getByRole("list", { name: "Optional tools" });
    expect(within(optional).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(["/workflow-lab", "/technical-preview"]);
    await user.click(screen.getByRole("button", { name: "Sign out" }));
    expect(mocks.signOut).toHaveBeenCalled();
  });

  it("limits reviewer navigation to the console and updates the current page after navigation", () => {
    mocks.pathname = "/admin/reviews/demo";
    const { rerender } = render(<AuthenticatedNavigation user={{ ...candidate, role: "ADMIN_REVIEWER", name: "Michael Anthony Sprague" }} />);
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Reviewer Console", current: "location" }).getAttribute("href")).toBe("/admin");
    expect(screen.getByText("Admin reviewer")).toBeDefined();
    mocks.pathname = "/practice";
    rerender(<AuthenticatedNavigation user={candidate} />);
    expect(screen.getByRole("link", { name: "Practice", current: "page" })).toBeDefined();
    expect(screen.queryByRole("link", { name: "Reviewer Console" })).toBeNull();
  });
});

describe("rubric and criteria reference", () => {
  it("explains weights, priorities and each criterion with synthetic examples", () => {
    render(<RubricGuide />);
    const guide = screen.getByRole("region", { name: "Understanding Rubrics & Evaluation Criteria" });
    for (const criterion of ["Factual accuracy", "Instruction following", "Safety & stated policy"]) expect(within(guide).getByText(criterion)).toBeDefined();
    expect(guide.textContent).toContain("Weights describe how much");
    expect(guide.textContent).toContain("Priorities describe which requirements take precedence");
    expect(guide.textContent).toContain("harmful, unsafe or policy-violating");
    expect(guide.textContent).toContain("guidelines supplied for that task");
    expect(guide.textContent).toContain("DEMO - SYNTHETIC");
    expect(guide.textContent).toContain("not an external industry standard");
  });

  it("opens the Practice guide on demand without a forced walkthrough", async () => {
    render(<EvaluationReference includeRubricGuide />);
    const summary = screen.getByText("Seven-Step Independent Evaluation Method");
    // jsdom does not implement native summary keyboard activation; the browser suite exercises Enter.
    await userEvent.setup().click(summary);
    expect(summary.closest("details")?.open).toBe(true);
    expect(screen.getByRole("region", { name: "Understanding Rubrics & Evaluation Criteria" })).toBeDefined();
  });

  it("keeps the existing method-only reference available to other callers", () => {
    render(<EvaluationReference />);
    expect(screen.queryByText("Safety & stated policy")).toBeNull();
  });
});
