import { Competency, LearningLevel } from "@prisma/client";
import { generalistPracticeCompetencies } from "../src/lib/generalist-competencies";

const demo = "DEMO - SYNTHETIC";
const approval = { approvedByAccountCode: "admin-michael", approvedAt: "2026-11-20T00:00:00.000Z", isSyntheticFixture: true, demoLabel: demo };
const ratings = [
  { id: "A_ONLY", label: "Only A meets the criterion" }, { id: "B_ONLY", label: "Only B meets the criterion" },
  { id: "BOTH_MEET", label: "Both meet the criterion" }, { id: "NEITHER_MEETS", label: "Neither meets the criterion" },
];

/** New immutable rubric version adds learner-safe structured criteria without rewriting historical v1. */
export const practiceRubric = {
  code: "demo-generalist-evaluation", version: 2,
  criteriaJson: {
    demoLabel: demo,
    deterministicWeights: { evaluationJudgment: 40, rubricApplication: 30, factualVerification: 25 }, writtenWeight: 5,
    practice: {
      description: "Apply the stated task priorities. Accuracy, instruction following and safety are rated separately; valid ties and owner-approved alternatives receive full judgment credit.",
      criteria: [{ id: "accuracy", label: "Factual accuracy", options: ratings }, { id: "instructionFollowing", label: "Instruction following", options: ratings }, { id: "safety", label: "Safety and stated policy", options: ratings }],
      verificationInstruction: "Select the supplied source identifiers that support your verification. Order does not matter.",
    },
    written: {
      alignment: { min: 0, max: 2, description: "Connect the judgment to the pinned rubric." },
      evidence: { min: 0, max: 2, description: "Use specific details and the supplied evidence." },
      clarity: { min: 0, max: 1, description: "Make the reasoning understandable to another evaluator." },
    },
  },
};

/** Complete structured tuples keep alternative reasoning coherent; prose is deliberately absent from keys. */
function key(judgment: "A_BETTER" | "B_BETTER" | "TIE", accuracy: string, instructionFollowing: string, safety: string, sourceId: string) {
  return { judgment, rubricSelections: { accuracy, instructionFollowing, safety }, verifiedSourceIds: [sourceId] };
}

const definitions = [
  { competency: Competency.G1, difficulty: LearningLevel.FOUNDATIONS, title: "Use the stated accuracy rubric", sourceId: "demo-hours-policy",
    prompt: "State the fictional Birch Library's Friday closing time in one sentence. Factual accuracy is the priority; confidence and elegance do not earn extra credit.",
    source: "Fictional Birch Library closes at 6 p.m. on Friday. No safety restriction applies to sharing public hours.",
    a: "It definitely closes at 5 p.m. on Friday.", b: "The fictional Birch Library's Friday closing time is 6 p.m.",
    primary: key("B_BETTER", "B_ONLY", "BOTH_MEET", "BOTH_MEET", "demo-hours-policy"), alternatives: [],
    explanation: "B matches the supplied 6 p.m. notice. Both are one sentence, and neither presents a safety concern. The rubric prioritizes factual accuracy, so confident wording cannot rescue A's unsupported 5 p.m. claim." },
  { competency: Competency.G2, difficulty: LearningLevel.FOUNDATIONS, title: "Check completeness and usefulness", sourceId: "demo-desk-guide",
    prompt: "Give both fictional desk steps: check the drawer label, then count the notebooks. Correctness and including both steps matter more than brevity.",
    source: "Fictional desk guide: first check the drawer label; then count the notebooks. These are ordinary public instructions with no safety restriction.",
    a: "Check the drawer label, then count the notebooks.", b: "Check the drawer label.",
    primary: key("A_BETTER", "BOTH_MEET", "A_ONLY", "BOTH_MEET", "demo-desk-guide"), alternatives: [],
    explanation: "A supplies both required steps in order. B's included statement is accurate, but it omits the count. This distinguishes factual correctness from task completeness under the pinned rubric." },
  { competency: Competency.G3, difficulty: LearningLevel.INTERMEDIATE, title: "Verify a fictional shipment claim", sourceId: "demo-notebook-record",
    prompt: "Report the total notebooks in the fictional shipment. Verify the arithmetic against the supplied record; do not infer extra boxes.",
    source: "Fictional shipment: six boxes containing four notebooks each. The inventory count is public and safe to report.",
    a: "There are 24 notebooks: six times four.", b: "There are 28 notebooks: six times four.",
    primary: key("A_BETTER", "A_ONLY", "BOTH_MEET", "BOTH_MEET", "demo-notebook-record"), alternatives: [],
    explanation: "The supplied record supports 6 × 4 = 24. Both attempt the requested total and neither has a safety issue, but B's arithmetic is incorrect. Evidence selection should identify the shipment record." },
  { competency: Competency.G4, difficulty: LearningLevel.INTERMEDIATE, title: "Accept a defensible tie", sourceId: "demo-comparison-notice",
    prompt: "State Friday's fictional closing time in one sentence. Accuracy and instruction following are the primary criteria; concision is a secondary preference. Compare both responses fairly.",
    source: "The fictional Birch Library closes at 6 p.m. on Friday. Public hours can be shared safely.",
    a: "It closes at 6 p.m. on Friday.", b: "On Friday, the closing time is 6 p.m.",
    primary: key("TIE", "BOTH_MEET", "BOTH_MEET", "BOTH_MEET", "demo-comparison-notice"),
    alternatives: [{ ...key("A_BETTER", "BOTH_MEET", "BOTH_MEET", "BOTH_MEET", "demo-comparison-notice"), ...approval,
      rationale: `${demo}: The simulated owner approves a slight preference for A because it is more concise, while both responses fully meet the primary accuracy and instruction criteria. A tie is equally defensible.` }],
    explanation: "Both responses give the supported time in one sentence, so the primary key is a tie. A preference for A is also valid under the explicitly secondary concision preference; it must not be penalized as an incorrect judgment." },
  { competency: Competency.G5, difficulty: LearningLevel.INTERMEDIATE, title: "Apply a fictional access-safety policy", sourceId: "demo-access-policy",
    prompt: "Help a fictional user regain access while following the supplied policy. Judge safety and policy compliance, not merely willingness to help. Do not enter any real password or personal information.",
    source: "Fictional access policy: direct users to the approved reset process. Never request, collect or share passwords or access tokens.",
    a: "Use the approved reset process; do not share your password or access token.", b: "Send your password and access token here so I can restore access for you.",
    primary: key("A_BETTER", "A_ONLY", "A_ONLY", "A_ONLY", "demo-access-policy"), alternatives: [],
    explanation: "A follows the supplied reset policy and avoids collecting secrets. B directly contradicts the policy and requests sensitive credentials. Policy awareness is a separate criterion; no real secret should be submitted for this synthetic exercise." },
  { competency: Competency.G6, difficulty: LearningLevel.ADVANCED, title: "Calibrate a judgment with evidence", sourceId: "demo-calibration-record",
    prompt: "Give the fictional notebook total. Accuracy and relevance are primary. Showing the calculation is helpful but optional. After selecting a judgment, explain it against the rubric; your prose is accepted for review, not exact-matched.",
    source: "Fictional shipment: six boxes with four notebooks per box. The public total can be reported without a safety concern.",
    a: "The total is 24 notebooks, from 6 × 4.", b: "The total is 24 notebooks.",
    primary: key("A_BETTER", "BOTH_MEET", "BOTH_MEET", "BOTH_MEET", "demo-calibration-record"),
    alternatives: [{ ...key("TIE", "BOTH_MEET", "BOTH_MEET", "BOTH_MEET", "demo-calibration-record"), ...approval,
      rationale: `${demo}: The simulated owner approves a tie because both responses are accurate and relevant, and showing the working is optional. A preference for A's transparency is valid but is not the only defensible conclusion.` }],
    explanation: "A makes its reasoning easier to verify; B also meets the primary task. Both the preferred ranking and the approved tie deserve full judgment credit. A written justification should explain the chosen interpretation using the record; varied wording is not evidence of poor reasoning." },
];

/** Six new, distinct published practice families use the requested internal G1–G6 competency definitions. */
export const expandedPracticeScenarios = definitions.map((item) => ({
  familyCode: `demo-generalist-${item.competency.toLowerCase()}`, version: 1,
  title: `${demo}: ${item.competency} ${generalistPracticeCompetencies[item.competency]} — ${item.title}`,
  competencies: [item.competency], difficulty: item.difficulty,
  prompt: `${demo}: ${item.prompt}`, responseA: `${demo}: ${item.a}`, responseB: `${demo}: ${item.b}`,
  evidenceJson: { demoLabel: demo, sources: [{ id: item.sourceId, text: `${demo}: ${item.source}` }] },
  answerKeyJson: item.primary, allowedAlternativesJson: item.alternatives,
  expertExplanation: `${demo}: ${item.explanation}`,
}));
