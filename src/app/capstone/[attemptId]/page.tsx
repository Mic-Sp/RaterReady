import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePageRole } from "../../../server/auth/page-access";
import { prisma } from "../../../lib/prisma";
import { loadCapstoneWorkspace } from "../../../server/capstone/workspace";
import { CapstoneExam } from "./workspace";

export const metadata: Metadata = { title: "Timed Generalist capstone | RaterReady" };

/** Authorize the candidate and owned attempt before selecting any exam text; unavailable IDs share one generic page. */
export default async function CapstoneExamPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const user = await requirePageRole("CANDIDATE");
  const { attemptId } = await params;
  let workspace: Awaited<ReturnType<typeof loadCapstoneWorkspace>>;
  try { workspace = await loadCapstoneWorkspace(prisma, user.id, attemptId); }
  catch { notFound(); }
  return <CapstoneExam key={workspace.snapshot.id} initial={workspace} />;
}
