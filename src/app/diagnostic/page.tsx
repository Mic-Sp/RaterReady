import { DemoBadge, SyntheticText } from "../components/demo-badge";
import Link from "next/link";
import type { Metadata } from "next";
import { requirePageRole } from "../../server/auth/page-access";
import { prisma } from "../../lib/prisma";
import { competencies, diagnosticTasks, learningLevels } from "../../lib/learning-content";
import { getLearningSnapshot } from "../../server/learning/service";
import { diagnosticAnswersSchema, evaluateDiagnostic } from "../../server/domain/diagnostic";
import { beginSkillsCheck, skipSkillsCheck } from "../learning/actions";
import { submitDiagnostic } from "./actions";
import { LevelChoices } from "../components/level-choices";
import { EvaluationReference } from "../components/evaluation-reference";

export const metadata: Metadata = { title: "Optional skills check | RaterReady" };

/** Candidate-only diagnostic: untimed selections, no prose grading, credentials or assessment attempts. */
export default async function DiagnosticPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const user = await requirePageRole("CANDIDATE");
  const profile = await getLearningSnapshot(prisma, user.id);
  const session = profile.diagnostic;
  const { notice } = await searchParams;
  const answers = diagnosticAnswersSchema.parse(session?.answersJson ?? {});
  const completed = session?.status === "COMPLETED";
  const feedback = completed ? evaluateDiagnostic(answers) : null;
  return <section className="page-card learning-page" aria-labelledby="diagnostic-heading">
    <p className="eyebrow"><DemoBadge /> · Generalist learning</p><h1 id="diagnostic-heading">Optional skills check</h1>
    <p className="page-intro">Untimed and non-certifying. This is a small learning sample, not a pass/fail test. It never grants a credential or changes the 85% finalized Generalist Qualification Exam standard.</p>
    <p>G1–G6 are RaterReady’s internal Generalist competency identifiers, not an external industry standard. Use only the fictional task information; no personal disclosures are requested.</p>
    {!completed && <form action={skipSkillsCheck}><button type="submit" className="secondary-button">Skip the diagnostic</button><p className="field-hint">You can skip before answering anything, without explanation or penalty.</p></form>}
    {notice === "saved" && <p role="status" className="success-note">Your selections are saved. You can leave and resume later.</p>}
    {notice === "not-saved" && <p role="status" className="form-error">Selections were not saved. Reload to get the latest check and choose at least one response for feedback, or skip at any time.</p>}
    {!session || session.status === "SKIPPED" ? <form action={beginSkillsCheck}><button className="primary-button" type="submit">Start optional skills check</button></form>
      : !completed ? <form action={submitDiagnostic} className="diagnostic-form">
        <input type="hidden" name="revision" value={session.revision} />
        {diagnosticTasks.map((task) => <fieldset key={task.competency}><legend><SyntheticText>{task.competency}</SyntheticText> · <SyntheticText rebrand>{competencies.find((item) => item.code === task.competency)!.title}</SyntheticText></legend>
          <p id={`${task.competency}-prompt`}><DemoBadge />: <SyntheticText rebrand>{task.prompt}</SyntheticText></p>
          {task.options.map((option, index) => <label className="radio-choice" key={option}>
            <input type="radio" name={task.competency} value={String(index)} defaultChecked={answers[task.competency] === String(index)} aria-describedby={`${task.competency}-prompt`} />
            <span><SyntheticText>{option}</SyntheticText></span>
          </label>)}
        </fieldset>)}
        <p>You can leave areas unanswered. Unanswered areas receive “Not observed” feedback.</p>
        <button className="secondary-button" type="submit" name="intent" value="save">Save selections for later</button>
        <button className="primary-button" type="submit" name="intent" value="finish">Get advisory feedback</button>
      </form> : null}
    {feedback && <section className="learning-section" aria-labelledby="feedback-heading"><h2 id="feedback-heading">Your advisory learning snapshot</h2>
      <p role="status">Skills check complete. No credential or Generalist Qualification Exam result has been issued.</p>
      <p>Suggested starting level: <strong><SyntheticText rebrand>{learningLevels.find((level) => level.code === feedback.suggestedLevel)?.title ?? "Choose any level"}</SyntheticText></strong>. You can override this suggestion below.</p>
      <ul className="feedback-list">{feedback.items.map((item) => <li key={item.competency}><h3><SyntheticText>{item.competency}</SyntheticText> · <SyntheticText rebrand>{competencies.find((c) => c.code === item.competency)!.title}</SyntheticText></h3><p><strong><SyntheticText>{item.outcome}</SyntheticText></strong>. <SyntheticText rebrand>{item.message}</SyntheticText></p><Link href={`/learn/${item.competency}?level=${profile.selectedLevel}`} className="inline-link">Explore <SyntheticText>{item.competency}</SyntheticText></Link></li>)}</ul>
      <h2>Choose your learning level</h2><LevelChoices suggested={feedback.suggestedLevel} selected={profile.onboardingCompletedAt ? profile.selectedLevel : undefined} />
    </section>}
    {!completed && session?.status === "IN_PROGRESS" && <form action={skipSkillsCheck}><button type="submit" className="text-button">Skip the diagnostic without submitting</button></form>}
    <EvaluationReference />
    <Link href="/onboarding" className="inline-link">Choose any level without finishing this check</Link>
    {profile.onboardingCompletedAt && <Link href="/dashboard" className="inline-link">Return to dashboard</Link>}
  </section>;
}
