import type { Competency, LearningLevel } from "@prisma/client";
import { generalistPracticeCompetencies } from "../../lib/generalist-competencies";
import { catalogHeading } from "../../lib/catalog-presentation";

export const practiceDifficulties = { FOUNDATIONS: "Foundations", INTERMEDIATE: "Intermediate", ADVANCED: "Advanced" } satisfies Record<LearningLevel, string>;
const difficultyOrder: Record<LearningLevel, number> = { FOUNDATIONS: 0, INTERMEDIATE: 1, ADVANCED: 2 };
const practiceSummaries: Readonly<Record<string, string>> = {
  "demo-generalist-g1": "Check which reply distinguishes the last sign-in time from building closing.",
  "demo-pass-zone": "Apply a transit pass exception and compare the actions each reply recommends.",
  "demo-lot-contract": "Use a sampling contract to distinguish provisional acceptance from final release.",
  "demo-generalist-g2": "Compare short shift handoffs for the details a new volunteer needs.",
  "demo-hold-message": "Check whether a pickup message gives the counter, deadline, and next step.",
  "demo-fund-note": "Check whether a budget reply explains what is available under a spending restriction.",
  "demo-supply-total": "Check whether responses distinguish packed kits from kits ready to use.",
  "demo-generalist-g3": "Use packing records to check which cartons were delivered in a split shipment.",
  "demo-queue-rate": "Check how two responses combine shift totals into one weekly service rate.",
  "demo-library-hours": "Compare weekend notices for accurate hours and complete visitor instructions.",
  "demo-generalist-g4": "Compare exhibit replies for accurate entry times and the right ticket scope.",
  "demo-packaging-test": "Compare packaging recommendations using the dimensions that matter for a flat shipment.",
  "demo-photo-board": "Apply a photo release policy to recommendations for a public event board.",
  "demo-generalist-g5": "Evaluate responses that address an urgent schedule question and account recovery.",
  "demo-record-release": "Apply a disclosure policy to a public attendance report with small groups.",
  "demo-print-proof": "Check whether a proofing note cites the relevant field and gives a clear next action.",
  "demo-waitlist": "Evaluate whether an audit note justifies a waitlist decision with a rule and a record.",
  "demo-generalist-g6": "Explain how supplied evidence supports a preference or a defensible tie.",
};

type Scenario = { id: string; family: { code: string }; title: string; difficulty: LearningLevel; competencies: Competency[] };
type Activity = { submittedFamilies: ReadonlySet<string>; openDrafts: ReadonlySet<string>; practicedCompetencies: ReadonlySet<Competency> };
export type PracticeCard = Pick<Scenario, "id" | "difficulty" | "competencies"> & {
  title: string; summary: string; status: "New" | "Practiced" | "Retry";
};

/** Build display-only practice cards and suggest the first unpracticed competency, starting with the easiest matching scenario. */
export function buildPracticeCatalog(scenarios: readonly Scenario[], activity: Activity) {
  const cards = scenarios.map((scenario): PracticeCard => {
    const title = catalogHeading(scenario.title);
    const submitted = activity.submittedFamilies.has(scenario.family.code);
    return {
      id: scenario.id, difficulty: scenario.difficulty, competencies: scenario.competencies, title,
      summary: practiceSummaries[scenario.family.code] ?? `Compare two responses to the “${title}” task using the provided rubric.`,
      status: submitted ? (activity.openDrafts.has(scenario.id) ? "Retry" : "Practiced") : "New",
    };
  }).sort((a, b) => difficultyOrder[a.difficulty] - difficultyOrder[b.difficulty] || a.title.localeCompare(b.title));

  const nextCompetency = (Object.keys(generalistPracticeCompetencies) as Competency[]).find((code) =>
    !activity.practicedCompetencies.has(code) && cards.some((card) => card.competencies.includes(code)));
  const recommendation = (nextCompetency && cards.find((card) => card.competencies.includes(nextCompetency)))
    ?? cards.find((card) => card.difficulty === "FOUNDATIONS" && card.status === "New")
    ?? cards.find((card) => card.difficulty === "FOUNDATIONS") ?? cards[0];
  return { cards, recommendation, nextCompetency };
}
