import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePageRole } from "../../../server/auth/page-access";
import { prisma } from "../../../lib/prisma";
import { loadPracticeWorkspace } from "../../../server/practice/workspace";
import { PracticeEvaluationError } from "../../../server/domain/practice-scoring";
import { PracticeWorkspace } from "../../practice/workspace";

export const metadata: Metadata = { title: "Technical Preview exercise | RaterReady" };

/** Candidate boundary fixes TECHNICAL_PREVIEW before loading a key-free DTO and this learner's own draft. */
export default async function TechnicalExercisePage({ params }: { params: Promise<{ scenarioId: string }> }) {
  const user = await requirePageRole("CANDIDATE");
  const { scenarioId } = await params;
  let data: Awaited<ReturnType<typeof loadPracticeWorkspace>>;
  try {
    data = await loadPracticeWorkspace(prisma, user.id, scenarioId, "TECHNICAL_PREVIEW");
  } catch (error) {
    if (error instanceof PracticeEvaluationError) notFound();
    throw error;
  }
  return <PracticeWorkspace key={data.scenario.id} {...data} />;
}
