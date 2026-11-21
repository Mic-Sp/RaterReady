import { Competency, LearningLevel } from "@prisma/client";
import { practiceRatings } from "../src/lib/practice-controls";

const demo = "DEMO - SYNTHETIC";

/** Independent pinned rubric for original, static JavaScript review exercises; no candidate code is executed. */
export const technicalRubric = {
  code: "demo-technical-evaluation", version: 1,
  criteriaJson: {
    demoLabel: demo,
    deterministicWeights: { evaluationJudgment: 40, rubricApplication: 30, factualVerification: 25 }, writtenWeight: 5,
    practice: {
      description: "Compare each response against the stated input contract and supplied hand traces. For explanation tasks, rate the behavior it reports; for solution tasks, rate the code's observable behavior, including required side effects. Rate instruction compliance and explanation accuracy separately. Equivalent correct solutions may tie; style alone does not prove correctness.",
      criteria: [
        { id: "behavior", label: "Behavior or reported result matches the contract", options: [...practiceRatings] },
        { id: "instructionFollowing", label: "Instruction compliance", options: [...practiceRatings] },
        { id: "reasoning", label: "Explanation matches the code and evidence", options: [...practiceRatings] },
      ],
      verificationInstruction: "Select the supplied contract/trace source that supports your comparison. These original synthetic records are exercise evidence, not external performance claims.",
    },
    written: {
      alignment: { min: 0, max: 2, description: "Connect the comparison to the pinned coding rubric." },
      evidence: { min: 0, max: 2, description: "Use the supplied contract, examples and hand traces." },
      clarity: { min: 0, max: 1, description: "Make your technical reasoning understandable." },
    },
  },
};

/** Structured keys share the practice evaluator's contract; no prose or executable grading is embedded. */
function key(judgment: "A_BETTER" | "B_BETTER" | "TIE", behavior: string, instructionFollowing: string, reasoning: string, source: string) {
  return { judgment, rubricSelections: { behavior, instructionFollowing, reasoning }, verifiedSourceIds: [source] };
}

const definitions = [
  {
    family: "comprehension", title: "Code comprehension: trace a positive sum", level: LearningLevel.FOUNDATIONS,
    competencies: [Competency.G2, Competency.G3], source: "demo-positive-sum-trace",
    prompt: "Explain the return value of positiveSum([2, -1, 4]). Inputs are finite integers. The task is to explain the supplied function, not replace it. Compare the correctness and completeness of the explanations.",
    a: "function positiveSum(values) {\n  let total = 0;\n  for (const value of values) {\n    if (value > 0) total += value;\n  }\n  return total;\n}\n// Explanation: It counts the positive items, so it returns 2.",
    b: "function positiveSum(values) {\n  let total = 0;\n  for (const value of values) {\n    if (value > 0) total += value;\n  }\n  return total;\n}\n// Explanation: It adds positive values: 2 + 4 = 6; -1 is skipped.",
    evidence: "Contract: explain the given function on [2, -1, 4]. Hand trace: total starts at 0, becomes 2, stays 2, then becomes 6. The code adds each positive value; it does not increment a count by one.",
    primary: key("B_BETTER", "B_ONLY", "BOTH_MEET", "B_ONLY", "demo-positive-sum-trace"),
    explanation: "B correctly traces addition and the return value 6. A describes a count of 2 although both show the same sum code. Both attempt the requested explanation without replacing the function; instruction compliance alone cannot make A's explanation accurate.",
  },
  {
    family: "bug-detection", title: "Bug detection: distinguish a strict boundary", level: LearningLevel.FOUNDATIONS,
    competencies: [Competency.G2, Competency.G3], source: "demo-strict-limit-trace",
    prompt: "Return the first index with a value strictly below limit, or -1 if none exists. Inputs are finite integers. Evaluate the fix for an equality-boundary bug using values [10, 7] and limit 10.",
    a: "function firstBelow(values, limit) {\n  for (let i = 0; i < values.length; i++) {\n    if (values[i] <= limit) return i;\n  }\n  return -1;\n}\n// Explanation: <= excludes equality, fixing the strict-boundary bug.",
    b: "function firstBelow(values, limit) {\n  for (let i = 0; i < values.length; i++) {\n    if (values[i] < limit) return i;\n  }\n  return -1;\n}\n// Explanation: < skips 10 and returns index 1 for the value 7.",
    evidence: "Contract: strictly below excludes equality. With [10, 7] and limit 10 the required index is 1. A accepts 10 <= 10 and returns 0. B skips equality and returns 1. For [10] and limit 10, the required result is -1; only B produces it.",
    primary: key("B_BETTER", "B_ONLY", "B_ONLY", "B_ONLY", "demo-strict-limit-trace"),
    explanation: "B fixes the strict comparison with <. A still includes equality and incorrectly claims <= excludes it. The boundary trace demonstrates the behavioral error and the unmet explicit instruction; confident fix language is not evidence.",
  },
  {
    family: "instruction-compliance", title: "Instruction compliance: preserve the input array", level: LearningLevel.INTERMEDIATE,
    competencies: [Competency.G1, Competency.G2], source: "demo-sort-copy-trace",
    prompt: "Return integers in ascending order without changing the caller's input array. Inputs are arrays of finite integers. Compare both solutions, including the caller-visible state after sortedCopy([3, 1]).",
    a: "function sortedCopy(values) {\n  return values.sort((a, b) => a - b);\n}\n// Explanation: This returns [1, 3] and leaves the original unchanged.",
    b: "function sortedCopy(values) {\n  return [...values].sort((a, b) => a - b);\n}\n// Explanation: Sort a new array; return [1, 3] and leave the input [3, 1].",
    evidence: "Contract: sorted return value AND unchanged input. Supplied operation rule: Array.sort rearranges its receiver; [...values] creates a separate array here. Trace from input [3, 1]: A returns [1, 3] but input becomes [1, 3]; B returns [1, 3] while input remains [3, 1].",
    primary: key("B_BETTER", "B_ONLY", "B_ONLY", "B_ONLY", "demo-sort-copy-trace"),
    explanation: "Both return the sorted values, but the contract includes observable input state. B copies before sorting, preserving the input. A mutates the caller's array and its explanation falsely denies that mutation. A correct return value alone does not satisfy the full requirement.",
  },
  {
    family: "behavior-verification", title: "Behavior verification: check the empty case", level: LearningLevel.INTERMEDIATE,
    competencies: [Competency.G3, Competency.G4], source: "demo-mean-boundary-trace",
    prompt: "Return the arithmetic mean of finite integer values; return null for an empty array. Review normal and boundary cases. The empty result is specified, so a different fallback is not interchangeable.",
    a: "function mean(values) {\n  if (values.length === 0) return 0;\n  let total = 0;\n  for (const value of values) total += value;\n  return total / values.length;\n}\n// Explanation: The empty result 0 satisfies the null requirement.",
    b: "function mean(values) {\n  if (values.length === 0) return null;\n  let total = 0;\n  for (const value of values) total += value;\n  return total / values.length;\n}\n// Explanation: [] gives null; [2, 4] gives 3; [-2, 2] gives 0.",
    evidence: "Contract table: [] -> null, [2, 4] -> 3, [-2, 2] -> 0. Hand trace: both divide 6 by 2 for [2, 4]. At the empty branch A returns the number 0; B returns null. The contract treats these as different results.",
    primary: key("B_BETTER", "B_ONLY", "B_ONLY", "B_ONLY", "demo-mean-boundary-trace"),
    explanation: "B meets both ordinary arithmetic and the explicit empty-input contract. A passes the ordinary example but returns the wrong kind of empty result. Its claim that 0 satisfies null is contradicted by the supplied contract, so one successful example cannot establish full compliance.",
  },
  {
    family: "solution-ranking", title: "Rank technical solutions: accept an equivalent tie", level: LearningLevel.ADVANCED,
    competencies: [Competency.G4, Competency.G6], source: "demo-positive-count-trace",
    prompt: "Count values strictly greater than zero without mutating the input. Inputs are finite integers. Correctness and compliance are primary. Explicit step-by-step tracing is helpful but optional; no speed or memory ranking is requested.",
    a: "function countPositive(values) {\n  let count = 0;\n  for (const value of values) {\n    if (value > 0) count += 1;\n  }\n  return count;\n}\n// Explanation: For [0, -1, 2, 5], count changes 0, 0, 1, 2; return 2.",
    b: "function countPositive(values) {\n  return values.filter(value => value > 0).length;\n}\n// Explanation: Filter keeps 2 and 5 from [0, -1, 2, 5]; return 2.",
    evidence: "Contract: count strictly positive finite integers and preserve input. Trace table for both solutions: [] -> 0; [0, -1, 2, 5] -> 2; [-3, 0] -> 0. The loop only updates a local count; filter creates a separate array. Both preserve the original input. No performance benchmark is provided.",
    primary: key("A_BETTER", "BOTH_MEET", "BOTH_MEET", "BOTH_MEET", "demo-positive-count-trace"),
    explanation: "Both solutions satisfy the finite-integer contract and explain the same correct behavior. A preference for A's explicit running count is defensible under the optional tracing preference. A tie is equally valid: the primary requirements do not demand that style, and unsupported performance claims should not break the tie.",
  },
];

/** Five original published fixture families; G-tags are Generalist reference links, never Technical mastery credit. */
export const technicalPreviewScenarios = definitions.map((item) => ({
  familyCode: `demo-technical-${item.family}`, version: 1, title: `${demo}: ${item.title}`,
  difficulty: item.level, competencies: item.competencies,
  prompt: `${demo}: ${item.prompt}`, responseA: `// ${demo}: simulated AI code/text output\n${item.a}`,
  responseB: `// ${demo}: simulated AI code/text output\n${item.b}`,
  evidenceJson: { demoLabel: demo, sources: [{ id: item.source, text: `${demo}: ${item.evidence}` }] },
  answerKeyJson: item.primary,
  allowedAlternativesJson: item.family === "solution-ranking" ? [{
    ...key("TIE", "BOTH_MEET", "BOTH_MEET", "BOTH_MEET", item.source),
    approvedByAccountCode: "admin-michael", approvedAt: "2026-11-20T00:00:00.000Z", isSyntheticFixture: true, demoLabel: demo,
    rationale: `${demo}: The simulated owner approves a tie because both solutions satisfy the same input contract and preserve the input. Explicit tracing is optional; a stylistic preference for A cannot make B incorrect.`,
  }] : [],
  expertExplanation: `${demo}: ${item.explanation}`,
}));
