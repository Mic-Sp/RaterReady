import { describe, expect, it } from "vitest";
import { recommendWelcomeStartingLevel, type WelcomeAnswers, type WelcomeFamiliarity } from "./welcome-check-in";

describe("optional welcome recommendation", () => {
  it("offers no invented placement, grade or credential when every question is skipped", () => {
    const result = recommendWelcomeStartingLevel({});
    expect(result.suggestedLevel).toBeNull();
    expect(result.answeredCount).toBe(0);
    expect(result.explanation).toContain("all three learning levels");
    expect(result).not.toHaveProperty("passed");
    expect(result).not.toHaveProperty("score");
  });

  it.each(["ai", "evaluation", "workflow"] as const)("keeps a partial %s response advisory and leaves input unchanged", (topic) => {
    const answers: WelcomeAnswers = { [topic]: "COMFORTABLE" };
    expect(recommendWelcomeStartingLevel(answers)).toMatchObject({ suggestedLevel: "FOUNDATIONS", answeredCount: 1 });
    expect(answers).toEqual({ [topic]: "COMFORTABLE" });
  });

  it("maps every combination without scoring self-reported comfort or imposing a prerequisite", () => {
    const familiarity: WelcomeFamiliarity[] = ["NEW", "SOME", "COMFORTABLE"];
    for (const ai of familiarity) for (const evaluation of familiarity) for (const workflow of familiarity) {
      const result = recommendWelcomeStartingLevel({ ai, evaluation, workflow });
      const expected = ai === "COMFORTABLE" && evaluation === "COMFORTABLE" && workflow === "COMFORTABLE" ? "ADVANCED"
        : ai !== "NEW" && evaluation !== "NEW" ? "INTERMEDIATE" : "FOUNDATIONS";
      expect(result.suggestedLevel).toBe(expected);
      expect(result.answeredCount).toBe(3);
      expect(result.showWorkflowLab).toBe(workflow !== "COMFORTABLE" || expected === "FOUNDATIONS");
    }
  });

  it("suggests optional computer practice without keeping an experienced evaluator at Foundations", () => {
    const result = recommendWelcomeStartingLevel({ ai: "COMFORTABLE", evaluation: "COMFORTABLE", workflow: "NEW" });
    expect(result.suggestedLevel).toBe("INTERMEDIATE");
    expect(result.showWorkflowLab).toBe(true);
    expect(result.explanation).toContain("comparing answers");
  });
});
