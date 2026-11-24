import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePageRole } from "../../../server/auth/page-access";
import { prisma } from "../../../lib/prisma";
import { loadPracticeWorkspace } from "../../../server/practice/workspace";
import { PracticeEvaluationError } from "../../../server/domain/practice-scoring";
import { PracticeWorkspace } from "../workspace";

export const metadata: Metadata = { title: "A/B practice workspace | RaterReady" };

/** Candidate-only page: load a safe DTO and this learner's draft, never raw scenario rows or keys. */
export default async function PracticeWorkspacePage({ params }: { params: Promise<{ scenarioId: string }> }) {
  const user = await requirePageRole("CANDIDATE");
  const { scenarioId } = await params;
  let data: Awaited<ReturnType<typeof loadPracticeWorkspace>>;
  try {
    data = await loadPracticeWorkspace(prisma, user.id, scenarioId);
  } catch (error) {
    if (error instanceof PracticeEvaluationError) notFound();
    throw error;
  }
  return <PracticeWorkspace key={data.scenario.id} {...data} />;
}
