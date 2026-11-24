import { SyntheticText } from "../components/demo-badge";
import Link from "next/link";
import type { Metadata } from "next";
import { requirePageRole } from "../../server/auth/page-access";
import { prisma } from "../../lib/prisma";
import { getLearningSnapshot } from "../../server/learning/service";
import { EvaluationReference } from "../components/evaluation-reference";
import { LevelChoices } from "../components/level-choices";
import { beginSkillsCheck, skipSkillsCheck } from "../learning/actions";

export const metadata: Metadata = { title: "Choose a learning path | RaterReady" };

/** Candidate-only welcome: a diagnostic, beginner path or previous completion can never gate level choice. */
export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const user = await requirePageRole("CANDIDATE");
  const profile = await getLearningSnapshot(prisma, user.id);
  const { notice } = await searchParams;
  return <section className="page-card learning-page" aria-labelledby="welcome-heading">
    <p className="eyebrow">Generalist learning · your starting point</p>
    <h1 id="welcome-heading">Welcome to RaterReady!</h1>
    <p className="page-intro">New to AI? You belong here. It’s okay if these ideas are unfamiliar. Choose a gentle check-in, try the Optional Skills Check or pick any level directly. You can switch anytime; completed lessons stay saved.</p>
    {notice === "diagnostic-skipped" && <p role="status" className="success-note">Skills check skipped. Choose any learning level below.</p>}
    {notice === "invalid-level" && <p role="status" className="form-error">Choose one of the three learning levels below.</p>}
    <section className="learning-section welcome-entry" aria-labelledby="welcome-check-in-heading">
      <h2 id="welcome-check-in-heading">Welcome &amp; starting-level check-in</h2>
      <p>Three optional questions about what feels familiar: AI tools, comparing answers and everyday computer tasks. There are no wrong answers, no time limit and no required starting level.</p>
      <Link href="/welcome" className="primary-button button-link">Try the welcome check-in</Link>
      <p className="field-hint">Untimed and non-certifying. Skip it whenever you like, or revisit it here or from your dashboard.</p>
    </section>
    <section className="learning-section" aria-labelledby="optional-check-heading">
      <h2 id="optional-check-heading">Optional skills diagnostic</h2>
      <p>Untimed, non-certifying and skippable at any point. Selected-response tasks provide advisory feedback across G1–G6, RaterReady’s internal Generalist competency identifiers.</p>
      <form action={beginSkillsCheck}><button type="submit" className="secondary-button"><SyntheticText>{profile.diagnosticStatus === "COMPLETED" ? "View advisory feedback" : "Take the optional skills check"}</SyntheticText></button></form>
      {profile.diagnosticStatus !== "COMPLETED" && <form action={skipSkillsCheck}><button type="submit" className="text-button">Skip the diagnostic</button></form>}
    </section>
    <section className="learning-section" aria-labelledby="direct-path-heading"><h2 id="direct-path-heading" tabIndex={-1}>Or choose a learning level</h2>
      <p>All levels are open. No diagnostic or introductory lesson is required.</p>
      <LevelChoices selected={profile.onboardingCompletedAt ? profile.selectedLevel : undefined} />
    </section>
    <EvaluationReference />
    {profile.onboardingCompletedAt && <Link href="/dashboard" className="inline-link">Return to dashboard</Link>}
  </section>;
}
