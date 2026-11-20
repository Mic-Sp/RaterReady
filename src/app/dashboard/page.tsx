import type { Metadata } from "next";
import { requirePageRole } from "../../server/auth/page-access";
import { LandingShell } from "../components/landing-shell";

export const metadata: Metadata = { title: "Candidate dashboard | RaterReady" };

/** Candidate-only Server Component; authorize before rendering identity or any dashboard content. */
export default async function CandidateDashboardPage() {
  const user = await requirePageRole("CANDIDATE");
  return <LandingShell user={user} />;
}
