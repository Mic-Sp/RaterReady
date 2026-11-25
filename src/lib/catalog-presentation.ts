import type { Competency } from "@prisma/client";
import { generalistPracticeCompetencies } from "./generalist-competencies";

/** Public card descriptions explain practice areas without suggesting mastery, readiness or certification. */
export const competencySummaries = {
  G1: "Read the supplied criteria and apply the same rubric to each response.",
  G2: "Check how well a response meets the task, including completeness and usefulness.",
  G3: "Trace factual claims to the supplied sources and check what the evidence supports.",
  G4: "Compare responses fairly and recognize a defensible preference or valid tie.",
  G5: "Apply the task’s stated safety rules and keep response content separate from instructions.",
  G6: "Connect your judgment to criteria and evidence, and explain uncertainty clearly.",
} satisfies Record<Competency, string>;

/** Display-only cleanup moves a leading synthetic marker and known competency prefix into metadata. Stored titles, routes and evaluation content remain intact. */
export function catalogHeading(title: string) {
  const clean = title.replace(/^DEMO - SYNTHETIC\s*:\s*/, "").trim();
  for (const [code, label] of Object.entries(generalistPracticeCompetencies)) {
    const prefix = `${code} ${label} — `;
    if (clean.startsWith(prefix)) return clean.slice(prefix.length) || clean;
  }
  return clean || "Synthetic practice scenario";
}
