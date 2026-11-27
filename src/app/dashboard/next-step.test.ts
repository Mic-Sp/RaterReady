import { describe, expect, it } from "vitest";
import { getDashboardNextStep } from "./next-step";

const beginner = {
  level: "FOUNDATIONS",
  nextLesson: { competency: "G1", number: 1, title: "Understand the task" },
  remainingPractice: "G2",
  hasReadLesson: false,
  examPassed: false,
  opportunitiesUnlocked: false,
} as const;

describe("dashboard next action", () => {
  it("points to the first unread lesson, using the number in the selected level", () => {
    expect(getDashboardNextStep(beginner)).toMatchObject({ stage: "Learn", label: "Start Lesson 1", href: "/learn/G1?level=FOUNDATIONS" });
    expect(getDashboardNextStep({
      ...beginner, level: "ADVANCED", hasReadLesson: true,
      nextLesson: { competency: "G3", number: 3, title: "Check the evidence" },
    })).toMatchObject({ stage: "Learn", label: "Resume Lesson 3", href: "/learn/G3?level=ADVANCED" });
  });

  it("points to an unpracticed skill, then exam readiness once all six are practiced even if reading is unfinished", () => {
    expect(getDashboardNextStep({ ...beginner, nextLesson: undefined })).toMatchObject({
      stage: "Practice", label: "Continue practice", href: "/practice?competency=G2",
    });
    expect(getDashboardNextStep({ ...beginner, remainingPractice: undefined })).toMatchObject({
      stage: "Qualify", label: "Check exam readiness", href: "/capstone",
    });
  });

  it("uses actual exam and credential access states before suggesting earlier activities", () => {
    expect(getDashboardNextStep({ ...beginner, exam: "ACTIVE" }).label).toBe("Resume exam");
    expect(getDashboardNextStep({ ...beginner, exam: "AWAITING_REVIEW" }).label).toBe("Check exam status");
    expect(getDashboardNextStep({ ...beginner, examPassed: true }).href).toBe("/capstone");
    expect(getDashboardNextStep({ ...beginner, examPassed: true, opportunitiesUnlocked: true })).toMatchObject({
      stage: "Opportunities", href: "/opportunities",
    });
  });
});
