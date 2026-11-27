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
    <h1 id="landing-heading">Learn to evaluate AI responses</h1>
    <p className="page-intro landing-promise">Build practical skills for remote AI evaluation work at your own pace.</p>
    <PublicEntryLinks />
    <p>RaterReady is built for justice-impacted and nontraditional talent. It’s free for learners and for reentry and workforce development partners.</p>
    <section className="learning-section" aria-labelledby="landing-training-heading">
      <h2 id="landing-training-heading">Learn, practice and show what you know</h2>
      <ol className="landing-steps">
        <li><strong>Learn.</strong> Choose from three levels and see how human ratings help improve AI responses. This approach is called reinforcement learning from human feedback (RLHF).</li>
        <li><strong>Practice.</strong> Compare simulated responses, apply a rubric and use feedback to build judgment at your own pace.</li>
        <li><strong>Qualify.</strong> The Generalist Qualification Exam is a timed assessment where you compare AI responses and explain your choices. A passing result earns a pilot credential after independent human review and owner sign-off. You decide whether to share it publicly.</li>
      </ol>
    </section>
    <p className="learning-section">Early access is open to sign-ups. You can start lessons and untimed practice before verifying your email. Fictional scenarios and demonstration accounts are marked <DemoBadge />.</p>
    <p>RaterReady is independent and has no third-party endorsement. Its six Generalist skill areas (G1–G6) are specific to RaterReady. A pilot credential does not guarantee employment.</p>
  </article>;
}
