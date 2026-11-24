// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DemoBadge, SyntheticText } from "./demo-badge";
import { WorkspaceSection } from "./workspace-section";
import { ResponseComparison } from "./response-comparison";
import { qualificationExamText, qualificationRubricLabel } from "../../lib/assessment-presentation";

afterEach(cleanup);
describe("qualification terminology and synthetic presentation", () => {
  it("maps legacy human copy without doubling Generalist or changing internal routes/codes", () => {
    expect(qualificationExamText("Generalist capstone standard; capstone exam; capstone readiness.")).toBe("Generalist Qualification Exam standard; Generalist Qualification Exam; Generalist Qualification Exam readiness.");
    expect(qualificationExamText("/capstone/attempt demo-generalist-capstone-rubric")).toBe("/capstone/attempt demo-generalist-capstone-rubric");
    expect(qualificationRubricLabel("demo-generalist-capstone-rubric")).toBe("RaterReady Generalist Qualification Exam rubric");
  });

  it("renders a single readable, non-interactive badge with no redundant live announcement", () => {
    render(<DemoBadge />);
    const badge = screen.getByText("DEMO - SYNTHETIC");
    expect(badge.classList.contains("demo-badge")).toBe(true);
    expect(badge.getAttribute("data-synthetic-badge")).toBe("true");
    expect(badge.hasAttribute("role")).toBe(false);
    expect(badge.hasAttribute("aria-live")).toBe(false);
  });

  it("styles every embedded marker while preserving untrusted prose and escaping markup", () => {
    const text = "DEMO - SYNTHETIC: capstone wording <script>alert(1)</script> DEMO - SYNTHETIC";
    const { container } = render(<p><SyntheticText>{text}</SyntheticText></p>);
    expect(container.textContent).toBe(text);
    expect(container.querySelectorAll('[data-synthetic-badge="true"]')).toHaveLength(2);
    expect(container.querySelector("script")).toBeNull();
  });

  it("rebrands stored product/fixture text only when the presentation boundary opts in", () => {
    const { container } = render(<h1><SyntheticText rebrand>DEMO - SYNTHETIC: Generalist capstone blueprint</SyntheticText></h1>);
    expect(screen.getByRole("heading", { name: "DEMO - SYNTHETIC: Generalist Qualification Exam blueprint" })).toBeDefined();
    expect(container.querySelector('[data-synthetic-badge="true"]')).not.toBeNull();
  });

  it("provides distinct named task/evidence/rubric and response cards without changing reading order", () => {
    const { container } = render(<article>
      <WorkspaceSection headingId="task" title="Task prompt" kind="task"><p>Context</p></WorkspaceSection>
      <WorkspaceSection headingId="evidence" title="Supplied evidence" kind="evidence"><p>Source</p></WorkspaceSection>
      <WorkspaceSection headingId="rubric" title="Pinned evaluation rubric" kind="rubric"><p>Version 1</p></WorkspaceSection>
      <ResponseComparison responseA="DEMO - SYNTHETIC: A" responseB="DEMO - SYNTHETIC: B" />
    </article>);
    expect([...container.querySelectorAll("[data-workspace-section]")].map((card) => card.getAttribute("data-workspace-section"))).toEqual(["task", "evidence", "rubric", "response-a", "response-b"]);
    for (const card of container.querySelectorAll("[data-workspace-section]")) {
      expect(card.querySelector(":scope > .workspace-card-header")).not.toBeNull();
      expect(card.querySelector(":scope > .workspace-card-content")).not.toBeNull();
      expect(card.getAttribute("aria-labelledby")).toBeTruthy();
    }
  });
});
