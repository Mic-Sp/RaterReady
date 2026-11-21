import { describe, expect, it } from "vitest";
import { DEMO_LABEL, demoAccounts, generalistRubric, opportunityListings, practiceScenarios } from "./fixtures";
import { expandedPracticeScenarios, practiceRubric } from "./practice-fixtures";
import { generalistPracticeCompetencies } from "../src/lib/generalist-competencies";
import { technicalPreviewScenarios, technicalRubric } from "./technical-fixtures";

describe("Stage A synthetic fixtures", () => {
  it("contains exactly the two approved candidates and sole owner reviewer", () => {
    expect(demoAccounts.map(({ accountCode }) => accountCode)).toEqual(["demo-marcus", "demo-elena", "admin-michael"]);
    expect(demoAccounts[0]).toMatchObject({ level: "FOUNDATIONS", track: "GENERALIST", role: "CANDIDATE" });
    expect(demoAccounts[1]).toMatchObject({ level: "ADVANCED", track: "TECHNICAL_PREVIEW", role: "CANDIDATE" });
    expect(demoAccounts[2]).toMatchObject({ name: "Michael Anthony Sprague", role: "ADMIN_REVIEWER" });
  });

  it("provides distinct scenario families and marked synthetic A/B content", () => {
    expect(new Set(practiceScenarios.map(({ familyCode }) => familyCode)).size).toBe(2);
    for (const scenario of practiceScenarios) {
      for (const text of [scenario.title, scenario.prompt, scenario.responseA, scenario.responseB, scenario.expertExplanation]) {
        expect(text).toContain(DEMO_LABEL);
      }
      expect(scenario.allowedAlternativesJson.length).toBeGreaterThan(0);
      expect(scenario.allowedAlternativesJson[0]).toMatchObject({ approvedByAccountCode: "admin-michael", isSyntheticFixture: true, demoLabel: DEMO_LABEL });
      expect(scenario.allowedAlternativesJson[0].judgment).not.toBe(scenario.answerKeyJson.judgment);
    }
  });

  it("pins the 40/30/25/5 scoring distribution and written criterion bounds", () => {
    expect(generalistRubric.criteriaJson.deterministicWeights).toEqual({ evaluationJudgment: 40, rubricApplication: 30, factualVerification: 25 });
    expect(generalistRubric.criteriaJson.writtenWeight).toBe(5);
    expect(generalistRubric.criteriaJson.written.alignment.max).toBe(2);
    expect(generalistRubric.criteriaJson.written.evidence.max).toBe(2);
    expect(generalistRubric.criteriaJson.written.clarity.max).toBe(1);
  });

  it("labels external links as informational with explicit limitations", () => {
    expect(opportunityListings).toHaveLength(2);
    for (const listing of opportunityListings) {
      expect(new URL(listing.url).protocol).toBe("https:");
      expect(listing.linkType).toBe("PUBLIC_INFORMATION");
      expect(listing.title).toContain(DEMO_LABEL);
      expect(listing.limitationsNote).toContain("No guaranteed work");
    }
  });

  it("adds one synthetic practice family for every requested internal Generalist competency", () => {
    expect(expandedPracticeScenarios).toHaveLength(6);
    expect(new Set(expandedPracticeScenarios.flatMap((item) => item.competencies))).toEqual(new Set(["G1", "G2", "G3", "G4", "G5", "G6"]));
    expect(practiceRubric.version).toBe(2);
    for (const scenario of expandedPracticeScenarios) {
      expect(scenario.title).toContain(generalistPracticeCompetencies[scenario.competencies[0]]);
      for (const text of [scenario.prompt, scenario.responseA, scenario.responseB, scenario.expertExplanation]) expect(text).toContain(DEMO_LABEL);
    }
    expect(expandedPracticeScenarios.some((item) => item.answerKeyJson.judgment === "TIE")).toBe(true);
    expect(expandedPracticeScenarios.some((item) => item.allowedAlternativesJson.some((key) => key.judgment === "TIE"))).toBe(true);
  });

  it("provides five distinct original synthetic coding exercises with a separate pinned rubric and approved tie", () => {
    expect(technicalPreviewScenarios).toHaveLength(5);
    expect(new Set(technicalPreviewScenarios.map((item) => item.familyCode)).size).toBe(5);
    expect(technicalRubric.code).not.toBe(practiceRubric.code);
    expect(technicalRubric.criteriaJson.deterministicWeights).toEqual(practiceRubric.criteriaJson.deterministicWeights);
    for (const item of technicalPreviewScenarios) {
      for (const text of [item.title, item.prompt, item.responseA, item.responseB, item.expertExplanation]) expect(text).toContain(DEMO_LABEL);
      expect(item.responseA).toContain("simulated AI code/text output");
      expect(item.responseB).toContain("simulated AI code/text output");
    }
    expect(technicalPreviewScenarios[4].allowedAlternativesJson[0]).toMatchObject({ judgment: "TIE", approvedByAccountCode: "admin-michael", isSyntheticFixture: true });
  });
});
