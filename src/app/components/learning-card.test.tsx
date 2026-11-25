// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LearningCard } from "./learning-card";
import { DemoBadge } from "./demo-badge";
import { catalogHeading } from "../../lib/catalog-presentation";

afterEach(cleanup);
describe("learning card hierarchy", () => {
  it("moves known title metadata into separate tiers without changing stored copy or arbitrary content", () => {
    const title = "DEMO - SYNTHETIC: G1 Rubric Interpretation — Use the stated accuracy rubric";
    expect(catalogHeading(title)).toBe("Use the stated accuracy rubric");
    expect(title).toContain("DEMO - SYNTHETIC");
    expect(catalogHeading("DEMO - SYNTHETIC: Compare two library notices")).toBe("Compare two library notices");
    expect(catalogHeading("DEMO - SYNTHETIC: Code comprehension: trace a positive sum")).toBe("Code comprehension: trace a positive sum");
    expect(catalogHeading("A — B <script>alert(1)</script>")).toBe("A — B <script>alert(1)</script>");
  });

  it("keeps one CTA with heading context, a plain heading, distinct metadata and escaped summary", () => {
    const { container } = render(<LearningCard headingId="scenario-one" title="Use the stated accuracy rubric" href="/practice/example"
      metadata={<><DemoBadge /><span>G1 · Foundations</span></>} summary={<p>{"Check evidence <script>untrusted</script>"}</p>} detail="Scenario version 1 · Untimed practice" />);
    const card = screen.getByRole("article", { name: "Use the stated accuracy rubric" });
    const heading = within(card).getByRole("heading", { level: 2 });
    expect(heading.querySelector("a")).toBeNull();
    expect(within(card).getAllByRole("link")).toHaveLength(1);
    const action = within(card).getByRole("link", { name: "Open scenario" });
    expect(action.getAttribute("href")).toBe("/practice/example");
    expect(action.getAttribute("aria-describedby")).toBe(heading.id);
    expect(card.firstElementChild?.textContent).toContain("DEMO - SYNTHETIC");
    expect(card.lastElementChild?.tagName).toBe("FOOTER");
    expect(container.querySelector("script")).toBeNull();
  });

  it("supports competency and lesson CTAs without claiming a scenario or changing destinations", () => {
    render(<LearningCard headingId="g3" headingLevel={3} title="Factual Verification" href="/practice?competency=G3" action="Practice G3"
      metadata={<><DemoBadge /> G3 · All levels</>} summary={<p>Trace supplied evidence.</p>} detail="No practice submitted yet" />);
    expect(screen.getByRole("heading", { level: 3, name: "Factual Verification" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Practice G3" }).getAttribute("href")).toBe("/practice?competency=G3");
  });
});
