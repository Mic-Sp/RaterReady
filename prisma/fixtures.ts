import { Competency, LearningLevel, OpportunityLinkType, Role, Track } from "@prisma/client";

/** All accounts and assessment content below are Stage A fixtures, never real learner data. */
export const DEMO_LABEL = "DEMO - SYNTHETIC";

/** Stable Credentials identifiers; reseeding must not reset existing onboarding/progress. */
export const demoAccounts = [
  { accountCode: "demo-marcus", name: "Marcus Vance", role: Role.CANDIDATE, level: LearningLevel.FOUNDATIONS, track: Track.GENERALIST },
  { accountCode: "demo-elena", name: "Elena Rostova", role: Role.CANDIDATE, level: LearningLevel.ADVANCED, track: Track.TECHNICAL_PREVIEW },
  { accountCode: "admin-michael", name: "Michael Anthony Sprague", role: Role.ADMIN_REVIEWER },
] as const;

/** Fixed content dates keep seed reruns from implying a new approval or link verification. */
export const fixtureDate = new Date("2026-11-20T00:00:00.000Z");

/** Versioned rubric content; written judgments use criteria, never prose matching. */
export const generalistRubric = {
  code: "demo-generalist-evaluation",
  version: 1,
  criteriaJson: {
    demoLabel: DEMO_LABEL,
    deterministicWeights: { evaluationJudgment: 40, rubricApplication: 30, factualVerification: 25 },
    writtenWeight: 5,
    written: {
      alignment: { min: 0, max: 2, description: "Apply the task's pinned rubric to the chosen judgment." },
      evidence: { min: 0, max: 2, description: "Ground the judgment in specific response details and supplied evidence." },
      clarity: { min: 0, max: 1, description: "Explain the reasoning clearly enough for another evaluator to follow." },
    },
  },
};

/** Human-approved alternatives are simulated owner approvals, explicitly labeled as fixtures. */
const syntheticApproval = {
  demoLabel: DEMO_LABEL,
  approvedByAccountCode: "admin-michael",
  approvedAt: fixtureDate.toISOString(),
  isSyntheticFixture: true,
};

/** Two separate Generalist practice families; no capstone keys or real AI calls are seeded. */
export const practiceScenarios = [
  {
    familyCode: "demo-library-hours",
    version: 1,
    title: `${DEMO_LABEL}: Compare two library notices`,
    competencies: [Competency.G1, Competency.G2, Competency.G3],
    difficulty: LearningLevel.FOUNDATIONS,
    prompt: `${DEMO_LABEL}. Write one sentence stating when the fictional Birch Library closes on Friday. Evaluate accuracy and instruction following equally; concise phrasing is a secondary preference.`,
    responseA: `${DEMO_LABEL}: Birch Library closes at 6 p.m. on Friday.`,
    responseB: `${DEMO_LABEL}: On Friday, the closing time for Birch Library is 6 p.m.`,
    evidenceJson: { demoLabel: DEMO_LABEL, sources: [{ id: "library-notice", text: "Fictional Birch Library: Friday hours are 10 a.m. to 6 p.m." }] },
    answerKeyJson: { judgment: "TIE", rubricSelections: { accuracy: "BOTH_MEET", instructionFollowing: "BOTH_MEET" }, verifiedSourceIds: ["library-notice"] },
    allowedAlternativesJson: [{ ...syntheticApproval, judgment: "A_BETTER", rubricSelections: { accuracy: "BOTH_MEET", instructionFollowing: "BOTH_MEET" }, verifiedSourceIds: ["library-notice"], rationale: "A slight preference for A is reasonable under the secondary concision criterion; both satisfy the primary criteria." }],
    expertExplanation: `${DEMO_LABEL}. Both responses give the supported closing time in one sentence, so a tie earns full credit. The synthetic owner-approved preference for A's concision also earns full credit. Cite the notice; do not invent additional hours.`,
  },
  {
    familyCode: "demo-supply-total",
    version: 1,
    title: `${DEMO_LABEL}: Verify a supply total`,
    competencies: [Competency.G4, Competency.G5, Competency.G6],
    difficulty: LearningLevel.INTERMEDIATE,
    prompt: `${DEMO_LABEL}. State the total number of notebooks in the fictional shipment. Prioritize factual accuracy and relevance; showing the calculation is helpful but optional.`,
    responseA: `${DEMO_LABEL}: There are 24 notebooks: 6 boxes multiplied by 4 notebooks per box.`,
    responseB: `${DEMO_LABEL}: The shipment contains 24 notebooks.`,
    evidenceJson: { demoLabel: DEMO_LABEL, sources: [{ id: "shipment-record", text: "Fictional shipment: 6 boxes, each containing 4 notebooks." }] },
    answerKeyJson: { judgment: "A_BETTER", rubricSelections: { accuracy: "BOTH_MEET", relevance: "BOTH_MEET" }, verifiedSourceIds: ["shipment-record"] },
    allowedAlternativesJson: [{ ...syntheticApproval, judgment: "TIE", rubricSelections: { accuracy: "BOTH_MEET", relevance: "BOTH_MEET" }, verifiedSourceIds: ["shipment-record"], rationale: "Both responses are accurate and relevant. A tie is valid because showing the calculation is optional." }],
    expertExplanation: `${DEMO_LABEL}. Six times four is 24. A makes verification easier, but B meets the primary task as well. Both the preferred A judgment and the synthetic owner-approved tie receive full credit. Written reasoning is evaluated with the pinned rubric, not exact wording.`,
  },
];

/** Public pages checked on the fixed date above; no claims about hiring, pay, or eligibility. */
export const opportunityListings = [
  {
    code: "demo-dataannotation-information",
    title: `${DEMO_LABEL}: DataAnnotation public opportunity information`,
    organization: "DataAnnotation",
    url: "https://www.dataannotation.tech/",
    linkType: OpportunityLinkType.PUBLIC_INFORMATION,
    limitationsNote: `${DEMO_LABEL}. Independently curated information only. Availability, geographic restrictions, screening, and eligibility must be checked with the organization. No guaranteed work, acceptance, compensation, or credential recognition.`,
  },
  {
    code: "demo-outlier-information",
    title: `${DEMO_LABEL}: Outlier public opportunity information`,
    organization: "Outlier",
    url: "https://outlier.ai/",
    linkType: OpportunityLinkType.PUBLIC_INFORMATION,
    limitationsNote: `${DEMO_LABEL}. Independently curated information only. Requirements vary by opportunity and may include domain expertise and screening. Verify current terms directly. No guaranteed work, acceptance, compensation, or credential recognition.`,
  },
];
