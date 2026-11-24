// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { evaluateDiagnostic, type DiagnosticAnswers } from "../../server/domain/diagnostic";
import { diagnosticScorecardItems } from "../../lib/diagnostic-scorecard";
import { generalistPracticeCompetencies } from "../../lib/generalist-competencies";
import { AdvisoryScorecard } from "./advisory-scorecard";

vi.mock("server-only", () => ({}));
afterEach(cleanup);

describe("non-certifying advisory scorecard", () => {
  it.each([
    [{ G1: "1" }, "Foundations", "one rubric criterion at a time"],
    [{ G1: "0", G2: "1", G3: "2" }, "Intermediate Practice", "balancing several criteria"],
    [{ G1: "0", G2: "1", G3: "2", G4: "1", G5: "2", G6: "0" }, "Advanced Calibration", "valid ties and alternate conclusions"],
  ] as const)("explains the suggested level without fixing placement: %s", (answers, title, explanation) => {
    render(<AdvisoryScorecard feedback={evaluateDiagnostic(answers)} />);
    const summary = within(screen.getByRole("region", { name: "Suggested Starting Level" }));
    expect(summary.getByText(title)).toBeDefined();
    expect(summary.getByText(explanation, { exact: false })).toBeDefined();
    expect(summary.getByText("switch anytime", { exact: false })).toBeDefined();
    expect(summary.getByText("Completed learning stays saved.", { exact: false })).toBeDefined();
    expect(summary.getByRole("link", { name: "Choose your starting level" }).getAttribute("href")).toBe("#choose-level-heading");
  });

  it("maps legacy samples to six current competency cards with distinct titles, statuses and practice links", () => {
    const feedback = evaluateDiagnostic({ G1: "0", G2: "0", G3: "0", G4: "1", G5: "2" });
    const original = structuredClone(feedback);
    const items = diagnosticScorecardItems(feedback);
    render(<AdvisoryScorecard feedback={feedback} />);
    expect(items.filter((item) => item.status === "strong").map((item) => item.competency)).toEqual(["G1", "G3", "G6"]);
    expect(new Set(items.map((item) => item.message)).size).toBe(6);
    for (const item of items) {
      const card = screen.getByRole("region", { name: `${item.competency} ${generalistPracticeCompetencies[item.competency]}` });
      expect(within(card).getByText(item.competency, { exact: true }).tagName).toBe("P");
      expect(within(card).getByRole("heading", { name: item.title, level: 3 })).toBeDefined();
      expect(within(card).getByText(item.statusLabel)).toBeDefined();
      expect(within(card).getByRole("link", { name: `Practice ${item.competency}` }).getAttribute("href")).toBe(`/practice?competency=${item.competency}`);
    }
    expect(within(screen.getByRole("region", { name: "G3 Factual Verification" })).getByText("supplied record and calculation", { exact: false })).toBeDefined();
    expect(within(screen.getByRole("region", { name: "G4 Comparative Judgment" })).getByText("allow a tie", { exact: false })).toBeDefined();
    const policy = within(screen.getByRole("region", { name: "G5 Safety & Policy Awareness" }));
    expect(policy.getByText("Suggested focus area")).toBeDefined();
    expect(policy.getByText("Not sampled", { exact: false })).toBeDefined();
    expect(feedback).toEqual(original);
  });

  it.each([
    [{ G1: "0", G2: "1", G3: "2", G4: "1", G5: "2", G6: "0" }, "Strong signal"],
    [{ G1: "1", G2: "0", G3: "0", G4: "0", G5: "0", G6: "1" }, "Suggested focus area"],
  ] satisfies [DiagnosticAnswers, string][])("uses observed outcomes consistently across all six cards: %s", (answers, label) => {
    render(<AdvisoryScorecard feedback={evaluateDiagnostic(answers)} />);
    expect(screen.getAllByText(label)).toHaveLength(6);
    expect(screen.getAllByText("In this short sample")).toHaveLength(6);
  });

  it("labels absent evidence honestly and keeps every mandatory disclosure visible", () => {
    render(<AdvisoryScorecard feedback={evaluateDiagnostic({})} />);
    expect(screen.getByText("Choose any starting level")).toBeDefined();
    expect(screen.getAllByText("Not sampled", { exact: false })).toHaveLength(6);
    const disclosures = within(screen.getByRole("complementary", { name: "Non-certifying advisory feedback" }));
    expect(disclosures.getByText("Optional, untimed and non-certifying.")).toBeDefined();
    expect(disclosures.getByText("never grants a credential", { exact: false })).toBeDefined();
    expect(disclosures.getByText("never waives the 85% passing standard for a finalized Generalist Qualification Exam after owner review", { exact: false })).toBeDefined();
    expect(disclosures.getByText("internal Generalist competency identifiers, not an external industry standard", { exact: false })).toBeDefined();
    expect(disclosures.getByText("DEMO - SYNTHETIC").classList.contains("demo-badge")).toBe(true);
    expect(screen.queryByRole("timer")).toBeNull();
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });
});
