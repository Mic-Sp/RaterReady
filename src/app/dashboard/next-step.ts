import type { Competency, LearningLevel } from "@prisma/client";
import type { CapstoneReadinessKind } from "../../server/domain/capstone-timer";

export const journey = ["Learn", "Practice", "Qualify", "Opportunities"] as const;
type NextStep = { stage: (typeof journey)[number]; label: string; href: string; description: string };

/** Recommend a next action from saved progress. Suggestions do not grant exam or opportunity access. */
export function getDashboardNextStep({ level, nextLesson, remainingPractice, hasReadLesson, exam, examPassed, opportunitiesUnlocked }: {
  level: LearningLevel;
  nextLesson?: { competency: Competency; number: number; title: string };
  remainingPractice?: Competency;
  hasReadLesson: boolean;
  exam?: CapstoneReadinessKind;
  examPassed: boolean;
  opportunitiesUnlocked: boolean;
}): NextStep {
  if (opportunitiesUnlocked) {
    return { stage: "Opportunities", label: "Explore opportunities", href: "/opportunities", description: "Your exam result and active credential unlock the curated opportunity queue." };
  }
  const passedAction = { label: "Review your exam result", description: "You passed. An active credential opens the opportunity queue." };
  const examActions: Partial<Record<CapstoneReadinessKind, Omit<NextStep, "stage" | "href">>> = {
    ACTIVE: { label: "Resume exam", description: "Your timed exam is in progress." },
    AWAITING_REVIEW: { label: "Check exam status", description: "Your exam is submitted and waiting for review." },
    ALREADY_PASSED: passedAction,
    COOLDOWN: { label: "Check your retake options", description: "See when you can try the exam again." },
  };
  const examAction = exam ? examActions[exam] : undefined;
  if (examAction || examPassed) {
    return { stage: "Qualify", href: "/capstone", ...(examAction ?? passedAction) };
  }
  // Reading is optional. Submitted practice or a ready exam can put a learner directly at Qualify.
  if (exam === "READY" || !remainingPractice) {
    return { stage: "Qualify", label: "Check exam readiness", href: "/capstone", description: "Review what you need to start the timed Generalist Qualification Exam." };
  }
  if (nextLesson) {
    return {
      stage: "Learn", label: `${hasReadLesson ? "Resume" : "Start"} Lesson ${nextLesson.number}`,
      href: `/learn/${nextLesson.competency}?level=${level}`, description: nextLesson.title,
    };
  }
  return { stage: "Practice", label: "Continue practice", href: `/practice?competency=${remainingPractice}`, description: "Try an exercise in a skill area you haven’t practiced yet." };
}
