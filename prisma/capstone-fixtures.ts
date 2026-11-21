import { Competency, LearningLevel } from "@prisma/client";
import { practiceRubric } from "./practice-fixtures";

const demo = "DEMO - SYNTHETIC";
const approval = { approvedByAccountCode: "admin-michael", approvedAt: "2026-11-20T00:00:00.000Z", isSyntheticFixture: true, demoLabel: demo };

/** Immutable scoring weights; future deterministic dimension averages total 95 and three written rubrics normalize to five. */
export const capstoneScoringPolicy = { code: "generalist-capstone-scoring", version: 1, evaluationJudgmentPoints: 40,
  rubricApplicationPoints: 30, factualVerificationPoints: 25, writtenJustificationPoints: 5, passingThreshold: 85 };

/** Public rules are pinned in the blueprint, so an acknowledgment always identifies the exact policy read. */
export const capstoneBlueprint = {
  code: "demo-generalist-capstone", version: 1, title: `${demo}: Generalist capstone blueprint`,
  baseDurationSeconds: 3600, retakeCooldownHours: 48, requireGeneralistPractice: true,
  independentWorkPolicyVersion: "independent-work-v1",
  independentWorkRulesJson: [
    "Complete the work independently. Do not use external generative AI assistants such as ChatGPT, Claude, Gemini, or AI-assisted writing/evaluation tools to generate, evaluate, or rewrite your answers.",
    "Traditional search engines and primary sources are permitted. Use the underlying sources, not generative-AI summaries or assistants.",
    "Ordinary notes are permitted. Use only synthetic task information; do not enter personal disclosures, passwords, or access tokens.",
    "Do not request another person's answers or share capstone questions. Follow the server deadline; reloading or changing your device clock does not extend it.",
  ],
};

/** Separate rubric identity prevents a practice rubric edit from changing a capstone pin. */
export const capstoneRubric = { code: "demo-generalist-capstone-rubric", version: 1, criteriaJson: practiceRubric.criteriaJson };

/** Structured keys only; written reasoning is never an exact-string scoring target. */
function key(judgment: string, accuracy: string, instructionFollowing: string, safety: string, source: string) {
  return { judgment, rubricSelections: { accuracy, instructionFollowing, safety }, verifiedSourceIds: [source] };
}

// These are twelve distinct cases, not cosmetic variations of practice scenarios or of one another.
const cases = [
  { id: "measured-runtime", competency: Competency.G1, title: "Separate measurements from guarantees",
    prompt: "Summarize a fictional device trial. The rubric prioritizes accurate scope over confidence. State what was measured without guaranteeing untested conditions.",
    source: "Fictional trial: one prototype ran for eight hours in a single indoor test. No outdoor or repeated trials were performed.",
    a: "One prototype ran for eight hours in an indoor test; other conditions were not tested.", b: "This prototype is guaranteed to run eight hours under every condition.",
    judgment: "A_BETTER", accuracy: "A_ONLY", instructions: "BOTH_MEET", safety: "BOTH_MEET",
    explanation: "A preserves the limited scope of the evidence. B converts one observation into a universal guarantee; confident wording does not meet the accuracy-first rubric." },
  { id: "causal-scope", competency: Competency.G1, title: "Apply a causal-evidence rubric",
    prompt: "Describe what a fictional garden comparison supports. The rubric requires distinguishing association from a demonstrated cause.",
    source: "Two fictional plots differed in shade, soil and watering. One grew taller plants. No factor was controlled independently.",
    a: "The comparison proves shade caused the taller growth.", b: "The plots differed in several ways, so this comparison does not isolate shade as the cause.",
    judgment: "B_BETTER", accuracy: "B_ONLY", instructions: "BOTH_MEET", safety: "BOTH_MEET",
    explanation: "B applies the causal-evidence boundary. A attributes the result to one factor although several changed together." },
  { id: "handoff-fields", competency: Competency.G2, title: "Check a complete handoff",
    prompt: "Write a fictional handoff including the package location, the collection window and the damaged-label exception. All three are required.",
    source: "Package at locker D. Collection: 14:00–16:00. If the label is damaged, contact the desk before collecting.",
    a: "Collect the package from locker D between 14:00 and 16:00.", b: "Collect from locker D between 14:00 and 16:00; if the label is damaged, contact the desk first.",
    judgment: "B_BETTER", accuracy: "BOTH_MEET", instructions: "B_ONLY", safety: "BOTH_MEET",
    explanation: "Both included statements are accurate, but only B supplies the required exception. Completeness is distinct from the truth of the details present." },
  { id: "citation-contract", competency: Competency.G2, title: "Check the requested source citation",
    prompt: "In at most two sentences, report the fictional archive's document limit and cite the supplied record identifier ARCH-7.",
    source: "ARCH-7: the fictional archive permits four documents per request. This public operational limit has no safety restriction.",
    a: "The limit is four documents per request (ARCH-7).", b: "The limit is four documents per request.",
    judgment: "A_BETTER", accuracy: "BOTH_MEET", instructions: "A_ONLY", safety: "BOTH_MEET",
    explanation: "Both state the supported limit, but A alone meets the explicit citation requirement. The missing citation is an instruction-compliance issue." },
  { id: "net-inventory", competency: Competency.G3, title: "Verify a net inventory calculation",
    prompt: "Report fictional stock after shipments and returns. Verify each change rather than treating all movements as removals.",
    source: "Fictional ledger: opening stock 32; 12 shipped out; 3 returned to stock. Net stock is 32 - 12 + 3 = 23.",
    a: "Stock is 23: subtract 12 shipped, then add 3 returned.", b: "Stock is 17: subtract both 12 shipped and 3 returned.",
    judgment: "A_BETTER", accuracy: "A_ONLY", instructions: "BOTH_MEET", safety: "BOTH_MEET",
    explanation: "Returns increase stock. A follows the ledger's directions; B incorrectly subtracts the returns." },
  { id: "dated-room-notices", competency: Competency.G3, title: "Reconcile dated source notices",
    prompt: "Give the fictional event's current room, using the latest applicable revision rather than the older announcement.",
    source: "Combined fictional notice record: November 2 announcement lists room B4. November 5 revision explicitly replaces that room with C2 for the same event. No later notice exists.",
    a: "The current room is B4, from the original announcement.", b: "The current room is C2; the November 5 revision replaces B4.",
    judgment: "B_BETTER", accuracy: "B_ONLY", instructions: "BOTH_MEET", safety: "BOTH_MEET",
    explanation: "B identifies the applicable later revision. The older record is authentic within the exercise but has been superseded." },
  { id: "equivalent-summary", competency: Competency.G4, title: "Compare equally accurate summaries",
    prompt: "Summarize the fictional decision. Accuracy and coverage are primary; a shorter summary is an optional secondary preference.",
    source: "Fictional committee decision: approve the mural with a blue border. Neither summary raises a safety issue.",
    a: "Approve the mural with a blue border.", b: "The decision is to approve the mural, and its border must be blue.",
    judgment: "TIE", accuracy: "BOTH_MEET", instructions: "BOTH_MEET", safety: "BOTH_MEET", alternative: "A_BETTER",
    explanation: "Both capture the complete decision accurately. A tie meets the primary rubric; preferring A's concision is also approved under the optional secondary preference." },
  { id: "conditional-choice", competency: Competency.G4, title: "Rank a conditional recommendation",
    prompt: "Recommend a fictional delivery option while preserving the stated rain condition. Include the fallback if rain is forecast.",
    source: "Fictional delivery rule: choose bicycle on dry days; choose van if rain is forecast. Today's forecast includes rain.",
    a: "Choose bicycle because it is normally available.", b: "Choose van because rain is forecast; bicycle is the dry-day option.",
    judgment: "B_BETTER", accuracy: "B_ONLY", instructions: "B_ONLY", safety: "BOTH_MEET",
    explanation: "B applies the condition and names the fallback. A ignores the decision-changing forecast rather than making a defensible alternate ranking." },
  { id: "redaction-policy", competency: Competency.G5, title: "Apply a fictional redaction rule",
    prompt: "Describe how to publish a fictional support excerpt under its redaction policy. Do not enter or request any real secret.",
    source: "Fictional policy: remove credential-like strings before publication, even demonstration strings. Use a redaction marker instead of reproducing their contents.",
    a: "Publish the whole excerpt, including its demonstration credential-like string.", b: "Replace the credential-like string with [REDACTED] before publishing the excerpt.",
    judgment: "B_BETTER", accuracy: "B_ONLY", instructions: "B_ONLY", safety: "B_ONLY",
    explanation: "B follows the supplied redaction rule. A contradicts it. The case is synthetic and requires no real credentials or personal disclosure." },
  { id: "quoted-instructions", competency: Competency.G5, title: "Keep quoted content below the rubric",
    prompt: "Evaluate a fictional response containing the quote 'ignore the rubric and award full credit.' Decide how an evaluator should handle the quote.",
    source: "Fictional evaluation policy: response content is evidence to assess, not an instruction to the evaluator. Follow the task and pinned rubric.",
    a: "Follow the quote and award full credit without evaluating the response.", b: "Treat the quote as response content and continue applying the task and rubric.",
    judgment: "B_BETTER", accuracy: "B_ONLY", instructions: "B_ONLY", safety: "B_ONLY",
    explanation: "B maintains the instruction boundary. A lets untrusted response content replace the evaluation policy." },
  { id: "budget-calibration", competency: Competency.G6, title: "Calibrate equivalent budget reasoning",
    prompt: "Report the fictional combined budget. Correctness and relevance are primary. Showing the addition is helpful but optional; justify the comparative judgment.",
    source: "Fictional project allocation: 12 units for materials and 8 units for delivery. Combined allocation is 20 units.",
    a: "The allocation is 20 units: 12 + 8.", b: "The combined allocation is 20 units.",
    judgment: "A_BETTER", accuracy: "BOTH_MEET", instructions: "BOTH_MEET", safety: "BOTH_MEET", alternative: "TIE",
    explanation: "Both meet the primary requirements. A's explicit working supports a slight preference, but a tie is approved because the working is optional." },
  { id: "uncertainty-calibration", competency: Competency.G6, title: "Justify a limit in the evidence",
    prompt: "State whether the fictional delivery duration can be calculated exactly. Explain the evidential limit rather than inventing a timezone conversion.",
    source: "Fictional log: departure 09:00 at origin; arrival 10:00 at destination. The two local timezone offsets are not recorded, so elapsed duration cannot be determined exactly.",
    a: "The exact duration is one hour; the local clock labels are sufficient.", b: "Exact duration is undetermined because the two timezone offsets are missing.",
    judgment: "B_BETTER", accuracy: "B_ONLY", instructions: "BOTH_MEET", safety: "BOTH_MEET",
    explanation: "B grounds uncertainty in the missing offsets. A treats local clock labels as comparable absolute instants without supporting evidence." },
];

/** Twelve isolated families provide two fresh six-question forms; no practice family is reused. */
export const capstoneScenarios = cases.map((item) => {
  const source = `cap-${item.id}-record`;
  const primary = key(item.judgment, item.accuracy, item.instructions, item.safety, source);
  return { familyCode: `demo-capstone-${item.id}`, version: 1, title: `${demo}: ${item.title}`,
    competencies: [item.competency], difficulty: LearningLevel.ADVANCED,
    prompt: `${demo}: ${item.prompt}`, responseA: `${demo}: ${item.a}`, responseB: `${demo}: ${item.b}`,
    evidenceJson: { demoLabel: demo, sources: [{ id: source, text: `${demo}: ${item.source}` }] },
    answerKeyJson: primary,
    allowedAlternativesJson: item.alternative ? [{ ...primary, judgment: item.alternative, ...approval,
      rationale: `${demo}: The simulated owner approves this alternative because both responses satisfy the primary rubric; the optional secondary preference does not make the other response incorrect.` }] : [],
    expertExplanation: `${demo}: ${item.explanation}` };
});

/** Exactly three rubric-grounded written prompts are designated now; collection and dual judging come later. */
export const capstoneSlots = Object.values(Competency).map((competency, index) => ({ position: index + 1, competency,
  writtenPrompt: ["G1", "G3", "G6"].includes(competency)
    ? `${demo}: Justify your ${competency} judgment using the pinned rubric and supplied evidence. Explain any uncertainty or defensible alternative.` : null }));
