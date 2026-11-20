import type { Metadata } from "next";
import { requirePageRole } from "../../server/auth/page-access";
import { redirect } from "next/navigation";
import { prisma } from "../../lib/prisma";
import { getLearningSnapshot } from "../../server/learning/service";
import { LearningDashboard } from "./learning-dashboard";

export const metadata: Metadata = { title: "Candidate dashboard | RaterReady" };

/** Candidate-only Server Component; authorize before rendering identity or any dashboard content. */
export default async function CandidateDashboardPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const user = await requirePageRole("CANDIDATE");
  const profile = await getLearningSnapshot(prisma, user.id);
  if (!profile.onboardingCompletedAt) redirect("/onboarding");
  const { notice } = await searchParams;
  return <LearningDashboard user={user} profile={profile} notice={notice} />;
}
