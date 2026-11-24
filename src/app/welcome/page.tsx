import type { Metadata } from "next";
import { requirePageRole } from "../../server/auth/page-access";
import { prisma } from "../../lib/prisma";
import { getLearningSnapshot } from "../../server/learning/service";
import { DemoBadge } from "../components/demo-badge";
import { EvaluationReference } from "../components/evaluation-reference";
import { WelcomeCheckIn } from "./check-in";

export const metadata: Metadata = { title: "Welcome & starting-level check-in | RaterReady" };

/** Candidate-only welcome/revisit route. A GET never records answers, changes placement or requires prior onboarding. */
export default async function WelcomePage() {
  const user = await requirePageRole("CANDIDATE");
  const profile = await getLearningSnapshot(prisma, user.id);
  return <section className="page-card learning-page welcome-page" aria-labelledby="welcome-heading">
    <p className="eyebrow"><DemoBadge /> · Your starting point</p>
    <h1 id="welcome-heading">Welcome to RaterReady!</h1>
    <p className="page-intro">It’s completely okay if some of these terms are new to you. There are no wrong answers here. We’re getting a quick sense of your starting point so we can suggest a comfortable place to begin.</p>
    <p>This is a friendly check-in about what feels familiar, not a test. You can skip it at any point, choose any level and revisit whenever you like.</p>
    <WelcomeCheckIn selected={profile.onboardingCompletedAt ? profile.selectedLevel : undefined} />
    {/* These visible disclosures apply to both the check-in and its recommendation; neither can confer assessment status. */}
    <aside className="learning-section" aria-label="Non-certifying welcome check-in">
      <h2>A starting suggestion, always your choice</h2>
      <p>This optional, untimed check-in never grants a credential or a pass/fail result. It does not establish exam readiness or waive the 85% passing standard for a finalized Generalist Qualification Exam after owner review.</p>
      <p>Your check-in answers stay on this page; only a learning level you choose is saved. Reloading clears these answers. Your completed lessons stay saved.</p>
      <p>G1–G6 are RaterReady’s internal Generalist competency identifiers, not an external industry standard.</p>
    </aside>
    <EvaluationReference />
  </section>;
}
