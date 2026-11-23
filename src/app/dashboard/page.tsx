import type { Metadata } from "next";
import { requirePageRole } from "../../server/auth/page-access";
import { redirect } from "next/navigation";
import { prisma } from "../../lib/prisma";
import { getLearningSnapshot } from "../../server/learning/service";
import { LearningDashboard } from "./learning-dashboard";
import { getCapstoneReadiness } from "../../server/capstone/service";
import { listCandidateCredentials } from "../../server/credentials/service";

export const metadata: Metadata = { title: "Candidate dashboard | RaterReady" };

/** Candidate-only Server Component; authorize before rendering identity or any dashboard content. */
export default async function CandidateDashboardPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const user = await requirePageRole("CANDIDATE");
  const profile = await getLearningSnapshot(prisma, user.id);
  if (!profile.onboardingCompletedAt) redirect("/onboarding");
  const { notice } = await searchParams;
  const readiness = await getCapstoneReadiness(prisma, user.id);
  const credentials = await listCandidateCredentials(prisma);
  return <LearningDashboard user={user} profile={profile} notice={notice} readiness={readiness} credentials={credentials} />;
}
