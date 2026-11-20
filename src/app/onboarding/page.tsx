import Link from "next/link";
import type { Metadata } from "next";
import { requirePageRole } from "../../server/auth/page-access";
import { prisma } from "../../lib/prisma";
import { getLearningSnapshot } from "../../server/learning/service";
import { EvaluationReference } from "../components/evaluation-reference";
import { LevelChoices } from "../components/level-choices";
import { LearnerIdentity } from "../components/learner-identity";
import { beginSkillsCheck, skipSkillsCheck } from "../learning/actions";

export const metadata: Metadata = { title: "Choose a learning path | RaterReady" };

/** Candidate-only welcome: a diagnostic, beginner path or previous completion can never gate level choice. */
export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const user = await requirePageRole("CANDIDATE");
  const profile = await getLearningSnapshot(prisma, user.id);
  const { notice } = await searchParams;
  return <section className="page-card learning-page" aria-labelledby="welcome-heading">
    <LearnerIdentity user={user} />
    <p className="eyebrow">Generalist learning · your starting point</p>
    <h1 id="welcome-heading">Choose where to begin.</h1>
    <p className="page-intro">Take a short skills check or choose any level directly. You can change levels and revisit earlier lessons at any time. Completed lessons stay saved.</p>
    {notice === "diagnostic-skipped" && <p role="status" className="success-note">Skills check skipped. Choose any learning level below.</p>}
    {notice === "invalid-level" && <p role="status" className="form-error">Choose one of the three learning levels below.</p>}
    <section className="learning-section" aria-labelledby="optional-check-heading">
      <h2 id="optional-check-heading">Optional skills diagnostic</h2>
      <p>Untimed, non-certifying and skippable at any point. Selected-response tasks provide advisory feedback across G1–G6, RaterReady’s internal Generalist competency identifiers.</p>
      <form action={beginSkillsCheck}><button type="submit" className="secondary-button">{profile.diagnosticStatus === "COMPLETED" ? "View advisory feedback" : "Take the optional skills check"}</button></form>
      {profile.diagnosticStatus !== "COMPLETED" && <form action={skipSkillsCheck}><button type="submit" className="text-button">Skip the diagnostic</button></form>}
    </section>
    <section className="learning-section" aria-labelledby="direct-path-heading"><h2 id="direct-path-heading">Or choose a learning level</h2>
      <p>All levels are open. No diagnostic or introductory lesson is required.</p>
      <LevelChoices selected={profile.onboardingCompletedAt ? profile.selectedLevel : undefined} />
    </section>
    <EvaluationReference />
    {profile.onboardingCompletedAt && <Link href="/dashboard" className="inline-link">Return to dashboard</Link>}
  </section>;
}
