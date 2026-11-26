import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { roleLandingPath } from "../lib/role-routing";
import { optionalPageIdentity } from "../server/auth/page-access";
import { DemoBadge } from "./components/demo-badge";
import { PublicEntryLinks } from "./components/public-entry-links";

export const metadata: Metadata = {
  title: "Free AI evaluation training | RaterReady",
  description: "Free browser-based RLHF evaluation training for justice-impacted and nontraditional talent.",
};

/** Public introduction for visitors. Existing sessions go to their server-verified candidate or reviewer destination. */
export default async function HomePage() {
  const user = await optionalPageIdentity();
  if (user) redirect(roleLandingPath(user.role));

  return <article className="page-card learning-page public-landing-page" aria-labelledby="landing-heading">
    <p className="eyebrow">RaterReady · Independent training</p>
    <h1 id="landing-heading">Learn to evaluate AI responses</h1>
    <p className="page-intro">RaterReady offers free, browser-based training for justice-impacted and nontraditional talent preparing for AI evaluation work. Learn to compare responses, check evidence and explain a judgment in your own words.</p>
    <PublicEntryLinks />
    <section className="learning-section" aria-labelledby="landing-training-heading">
      <h2 id="landing-training-heading">Learn, practice and show what you know</h2>
      <ol className="landing-steps">
        <li><strong>Learn.</strong> Choose from three levels and explore how human feedback helps improve AI responses, a process used in reinforcement learning from human feedback (RLHF).</li>
        <li><strong>Practice.</strong> Compare simulated responses, apply a rubric and use feedback to build judgment at your own pace.</li>
        <li><strong>Qualify.</strong> A passing Generalist Qualification Exam result earns a pilot credential after independent human review and owner sign-off. You decide whether to share it publicly.</li>
      </ol>
    </section>
    <section className="learning-section" aria-labelledby="landing-access-heading">
      <h2 id="landing-access-heading">Closed Alpha and demonstration access</h2>
      <div className="landing-access-grid">
        <section className="landing-access-card" aria-labelledby="landing-alpha-heading">
          <h3 id="landing-alpha-heading"><span className="role-badge">Closed Alpha</span></h3>
          <p>Register with your email to create a live learner account. Lessons and untimed practice are available before email verification.</p>
        </section>
        <section className="landing-access-card" aria-labelledby="landing-demo-heading">
          <h3 id="landing-demo-heading"><DemoBadge /></h3>
          <p>Demonstration accounts use fictional learners. Practice and exam scenarios also carry synthetic labels, including when you use a live account.</p>
        </section>
      </div>
    </section>
    <p className="learning-section">Training is free for individual learners and reentry and workforce development partners. G1–G6 are RaterReady’s internal Generalist competencies. RaterReady operates independently without third-party endorsement.</p>
  </article>;
}
