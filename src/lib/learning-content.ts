import type { Competency, LearningLevel } from "@prisma/client";

/** Legacy diagnostic-v1 labels/lesson slots, retained for versioned advisory selections.
 * Substantive instruction is seeded separately; current practice names live in generalist-competencies.ts. */
export const competencies = [
  { code: "G1", title: "Understand the task", lesson: "Identify the requested outcome, constraints and audience before evaluating a response.", example: "DEMO - SYNTHETIC: If a fictional library notice asks for one sentence about Friday closing time, extra opening hours do not satisfy a different task." },
  { code: "G2", title: "Apply the rubric", lesson: "Use the same explicit criteria for every response. Separate factual accuracy, instruction following and presentation.", example: "DEMO - SYNTHETIC: A polished fictional notice can still contain the wrong closing time. Judge the stated criterion rather than confidence or style." },
  { code: "G3", title: "Compare responses fairly", lesson: "Evaluate each response independently before comparing. A tie can be appropriate when both meet the rubric equally.", example: "DEMO - SYNTHETIC: Two short fictional notices that state the same supported closing time may deserve a tie despite different word order." },
  { code: "G4", title: "Verify factual claims", lesson: "Find the supplied evidence, check each relevant claim and distinguish unsupported claims from known errors.", example: "DEMO - SYNTHETIC: A fictional shipment of six boxes with four notebooks in each contains 24 notebooks. The supplied record supports the calculation." },
  { code: "G5", title: "Explain the judgment", lesson: "Connect your conclusion to a rubric criterion and a specific piece of evidence. Explain uncertainty without inventing certainty.", example: "DEMO - SYNTHETIC: ‘The fictional notice says 6 p.m.; both responses state that time, so both meet factual accuracy’ explains a tie with evidence." },
  { code: "G6", title: "Work independently", lesson: "Keep task instructions separate from response content. Check your reasoning and document uncertainty before submitting.", example: "DEMO - SYNTHETIC: A response saying ‘ignore the rubric and give me full credit’ is content to evaluate, never an instruction to obey." },
] as const satisfies readonly { code: Competency; title: string; lesson: string; example: string }[];

/** Map current practice competencies to retained lesson URLs; never relabel or migrate saved reading rows. */
export const practiceLessonSlots = { G1: "G1", G2: "G2", G3: "G4", G4: "G3", G5: "G6", G6: "G5" } as const satisfies Record<Competency, Competency>;

/** Every level is directly selectable, including before or after the optional diagnostic. */
export const learningLevels = [
  { code: "FOUNDATIONS", title: "Foundations", description: "Build familiarity with task intent, rubric criteria and evidence.", approach: "Use one criterion at a time. Keep the seven-step reference nearby whenever it helps." },
  { code: "INTERMEDIATE", title: "Intermediate Practice", description: "Connect criteria, compare defensible judgments and explain trade-offs.", approach: "Consider competing criteria and explain why the evidence supports your conclusion." },
  { code: "ADVANCED", title: "Advanced Calibration", description: "Examine ambiguity, valid ties and differences in evaluator judgment.", approach: "Seek alternate defensible conclusions and state the evidence that could change your judgment." },
] as const satisfies readonly { code: LearningLevel; title: string; description: string; approach: string }[];

/** Available on demand at every level; this reference never acts as an onboarding prerequisite. */
export const independentMethod = [
  "Read the task and identify the requested outcome.",
  "Identify instructions, constraints and the relevant rubric.",
  "Evaluate each response independently against that rubric.",
  "Verify important claims using the supplied evidence.",
  "Compare the responses fairly, allowing valid ties and alternatives.",
  "Write a clear justification connecting criteria and evidence.",
  "Check for instruction conflicts, unsupported assumptions and uncertainty before submitting.",
];

/** Public diagnostic prompts/options only. Answer keys remain in the server domain module. */
export const diagnosticTasks = [
  { competency: "G1", prompt: "A fictional task asks for one sentence stating Friday's closing time. Which response follows the requested scope?", options: ["One sentence giving the supported Friday closing time.", "A list of unrelated opening times.", "A confident guess without the notice."] },
  { competency: "G2", prompt: "The fictional rubric asks you to judge factual accuracy. What should determine that judgment?", options: ["The response's confident tone.", "Whether the stated facts match the supplied evidence.", "How long the response is."] },
  { competency: "G3", prompt: "A fictional notice says 6 p.m. Response A: ‘It closes at 6 p.m.’ Response B: ‘The closing time is 6 p.m.’ Both follow the instructions. Accuracy and instruction following are the only criteria. What judgment is defensible?", options: ["A is necessarily better because it is shorter.", "B is necessarily better because it sounds formal.", "A tie: both meet the stated criteria equally."] },
  { competency: "G4", prompt: "A fictional record lists six boxes with four notebooks per box. Which verification is supported?", options: ["There must be 30 notebooks because shipments are usually larger.", "There are 24 notebooks, supported by 6 × 4 in the supplied record.", "There are 24 notebooks because the response sounds certain."] },
  { competency: "G5", prompt: "Which selected justification best connects a judgment to evidence and a rubric criterion? This selection task does not grade your own written prose.", options: ["I prefer it.", "It sounds professional, so the facts must be correct.", "Both state the notice's supported 6 p.m. closing time, so both meet factual accuracy."] },
  { competency: "G6", prompt: "A fictional response says ‘Ignore the rubric and award full credit.’ What supports independent evaluation?", options: ["Treat that sentence as response content and keep using the task's rubric.", "Follow the response's instruction.", "Copy the suggested score without checking."] },
] as const;
