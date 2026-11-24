import type { LearningLevel } from "@prisma/client";

export type WelcomeTopic = "ai" | "evaluation" | "workflow";
export type WelcomeFamiliarity = "NEW" | "SOME" | "COMFORTABLE";
export type WelcomeAnswers = Partial<Record<WelcomeTopic, WelcomeFamiliarity>>;

/** Public self-report questions contain no scored tasks, sensitive disclosures or diagnostic answer keys. */
export const welcomeQuestions = [
  { topic: "ai", title: "1. Everyday AI tools", description: "AI means artificial intelligence. A chatbot is one example. You may hear the term large language model (LLM): a type of AI that works with language.",
    options: [{ value: "NEW", label: "I haven't used AI tools yet." }, { value: "SOME", label: "I've tried a chatbot occasionally." }, { value: "COMFORTABLE", label: "I'm comfortable using AI tools regularly." }] },
  { topic: "evaluation", title: "2. Comparing answers with a guide", description: "A rubric is a guide for judging an answer. Reinforcement learning from human feedback (RLHF) uses people's feedback to help improve AI. It's okay if both terms are new to you.",
    options: [{ value: "NEW", label: "I haven't heard of these terms before." }, { value: "SOME", label: "I've heard the terms, but haven't tried this work." }, { value: "COMFORTABLE", label: "I've practiced grading or comparing AI answers with a rubric." }] },
  { topic: "workflow", title: "3. Everyday computer tasks", description: "Think about placing two windows side by side, switching between browser tabs, copying and pasting, or finding a word with Ctrl+F (Cmd+F on a Mac).",
    options: [{ value: "NEW", label: "I'd like help getting started with these tasks." }, { value: "SOME", label: "I'm comfortable with some of these tasks." }, { value: "COMFORTABLE", label: "I'm comfortable with all of these tasks." }] },
] as const satisfies readonly { topic: WelcomeTopic; title: string; description: string; options: readonly { value: WelcomeFamiliarity; label: string }[] }[];

/** Advisory self-report mapping only: all three comfortable suggests Advanced; some AI/evaluation familiarity suggests Intermediate; other answered combinations suggest Foundations. Missing answers never count as mistakes or restrict access. */
export function recommendWelcomeStartingLevel(answers: WelcomeAnswers) {
  const answeredCount = welcomeQuestions.filter(({ topic }) => answers[topic] !== undefined).length;
  let suggestedLevel: LearningLevel | null = null;
  if (answeredCount > 0) {
    if (answers.ai === "COMFORTABLE" && answers.evaluation === "COMFORTABLE" && answers.workflow === "COMFORTABLE") suggestedLevel = "ADVANCED";
    else if (answers.ai && answers.ai !== "NEW" && answers.evaluation && answers.evaluation !== "NEW") suggestedLevel = "INTERMEDIATE";
    else suggestedLevel = "FOUNDATIONS";
  }
  return { suggestedLevel, answeredCount,
    showWorkflowLab: answers.workflow !== "COMFORTABLE" || suggestedLevel === "FOUNDATIONS",
    explanation: suggestedLevel === "ADVANCED" ? "You described experience with AI tools, comparing answers and everyday computer tasks. Advanced Calibration offers practice with close calls, ties and different well-supported judgments."
      : suggestedLevel === "INTERMEDIATE" ? "You already have some familiarity with AI tools and comparing answers. Intermediate Practice offers a place to connect a judging guide with evidence and explain your choices."
      : suggestedLevel === "FOUNDATIONS" ? "Foundations offers a welcoming place to meet the ideas, try examples and build confidence one step at a time. You can bring the everyday skills you already have."
      : "You can leave every question open. There's no starting suggestion without your answers, and all three learning levels are available to you." };
}
