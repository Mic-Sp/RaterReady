import { SyntheticText } from "../components/demo-badge";
import Link from "next/link";
import type { AuthIdentity } from "../../server/auth/accounts";
import type { getLearningSnapshot } from "../../server/learning/service";
import { nextLesson } from "../../server/learning/service";
import { competencies, learningLevels } from "../../lib/learning-content";
import { generalistPracticeCompetencies } from "../../lib/generalist-competencies";
import { RubricGuide } from "../components/rubric-guide";
import { EvaluationReference } from "../components/evaluation-reference";
import { chooseLevel, beginSkillsCheck } from "../learning/actions";
import type { CapstoneReadiness } from "../../server/capstone/service";
import { FinalizedResult } from "../capstone/finalized-result";
import type { CandidateCredential } from "../../lib/credential-content";
import { CandidateCredentials } from "../components/candidate-credentials";

/** Server-rendered learning progress uses independent persisted lesson rows, never diagnostic scores. */
export function LearningDashboard({ user, profile, notice, readiness, credentials = [], opportunities }: { user: AuthIdentity; profile: Awaited<ReturnType<typeof getLearningSnapshot>>; notice?: string; readiness?: CapstoneReadiness; credentials?: CandidateCredential[]; opportunities?: { unlocked: boolean } }) {
  const completed = profile.moduleProgress.filter((item) => item.level === profile.selectedLevel);
  const resume = nextLesson(profile.moduleProgress, profile.selectedLevel);
  const level = learningLevels.find((item) => item.code === profile.selectedLevel)!;
  const practiceAreas = new Set(profile.practiceProgress.map((item) => item.competency));
  const nextPractice = competencies.find((item) => !practiceAreas.has(item.code))?.code ?? "G1";
  const notices: Record<string, string> = { "level-saved": "Learning level saved. All completed lessons remain saved.", "lesson-saved": "Lesson completion saved. This is learning progress, not a certification result.", "diagnostic-skipped": "Skills check skipped. Your learning level and completed lessons are unchanged." };
  return <section className="page-card learning-page" aria-labelledby="landing-heading">
    <p className="eyebrow">Generalist learning</p><h1 id="landing-heading">Your candidate dashboard</h1>
    <p className="page-intro">Welcome, <SyntheticText>{user.name}</SyntheticText>. Keep building independent evaluation judgment at your own pace.</p>
    <p>G1–G6 below are RaterReady’s internal Generalist competency identifiers.</p>
    {notice && Object.hasOwn(notices, notice) && <p role="status" className="success-note"><SyntheticText>{notices[notice]}</SyntheticText></p>}
    <Link href="#rubric-guide" className="inline-link">Understanding Rubrics &amp; Evaluation Criteria</Link>
    {/* Desktop pairs summary cards in DOM order; full-width curriculum grids reflow sequentially on mobile. */}
    <div className="dashboard-grid">
    <section className="learning-section dashboard-wide" aria-labelledby="practice-progress-heading"><h2 id="practice-progress-heading">Generalist practice progress</h2>
      <p>{practiceAreas.size} of 6 competency areas practiced</p><progress max={6} value={practiceAreas.size} aria-label="Competency areas with submitted practice" />
      <p>Practice completion records submissions, not mastery, passing status or Generalist Qualification Exam readiness. All scenarios remain open for unlimited retries.</p>
      {profile.practiceDrafts[0] && <p><Link href={`/practice/${profile.practiceDrafts[0].scenarioId}`} className="inline-link">Resume saved draft: <SyntheticText rebrand>{profile.practiceDrafts[0].scenario.title}</SyntheticText></Link></p>}
      <Link href={`/practice?competency=${nextPractice}`} className="primary-button button-link">Resume practice: <SyntheticText>{nextPractice}</SyntheticText></Link>
      <Link href="/practice" className="inline-link">Browse all Generalist practice scenarios</Link>
      <ol className="curriculum-list">{Object.entries(generalistPracticeCompetencies).map(([code, title]) => {
        const records = profile.practiceProgress.filter((item) => item.competency === code);
        return <li key={code}><h3><Link href={`/practice?competency=${code}`}><SyntheticText>{code}</SyntheticText> · <SyntheticText rebrand>{title}</SyntheticText></Link></h3><p><SyntheticText>{records.length ? `${records.reduce((sum, item) => sum + item.submissionCount, 0)} practice submission(s)` : "No practice submitted yet"}</SyntheticText></p></li>;
      })}</ol>
    </section>
    <section className="learning-section" aria-labelledby="progress-heading"><h2 id="progress-heading">Your learning progress</h2>
      <p><strong><SyntheticText rebrand>{level.title}</SyntheticText></strong> · {completed.length} of 6 lessons marked complete</p>
      <progress max={6} value={completed.length} aria-label="Lessons marked complete at the current level" />
      <p>Completion records reflect lessons you mark complete. They are not graded practice results, a Generalist Qualification Exam readiness decision, or a credential.</p>
      <Link href={`/learn/${resume}?level=${profile.selectedLevel}`} className="primary-button button-link"><SyntheticText>{completed.length === 6 ? `Review ${resume}` : `Resume learning: ${resume}`}</SyntheticText></Link>
    </section>
    <section className="learning-section" aria-labelledby="level-heading"><h2 id="level-heading">Change your learning level</h2>
      <p>Switch freely. Earlier completions remain available at their original level.</p>
      <form action={chooseLevel} className="form-field"><label htmlFor="learning-level">Learning level</label>
        <select id="learning-level" name="level" defaultValue={profile.selectedLevel}>{learningLevels.map((item) => <option key={item.code} value={item.code}><SyntheticText rebrand>{item.title}</SyntheticText></option>)}</select>
        <button className="secondary-button" type="submit">Save learning level</button>
      </form>
      <Link href="/onboarding" className="inline-link">Revisit all starting options</Link>
      <Link href="/welcome" className="inline-link">Revisit the welcome check-in</Link>
    </section>
    <section className="learning-section dashboard-wide" aria-labelledby="curriculum-heading"><h2 id="curriculum-heading">Six-module curriculum</h2>
      <p>G1–G6 are RaterReady’s internal Generalist competency identifiers, not an external industry standard. Follow the sequence or revisit any lesson.</p>
      <ol className="curriculum-list">{competencies.map((item) => <li key={item.code}><h3><Link href={`/learn/${item.code}?level=${profile.selectedLevel}`}><SyntheticText>{item.code}</SyntheticText> · <SyntheticText rebrand>{item.title}</SyntheticText></Link></h3>
        <p><SyntheticText>{completed.some((entry) => entry.competency === item.code) ? "Complete at this level" : "Not yet marked complete at this level"}</SyntheticText></p>
        <p className="field-hint">Completed at: <SyntheticText rebrand>{profile.moduleProgress.filter((entry) => entry.competency === item.code).map((entry) => learningLevels.find((l) => l.code === entry.level)!.title).join(", ") || "No levels yet"}</SyntheticText></p>
      </li>)}</ol>
    </section>
    <section className="learning-section" aria-labelledby="diagnostic-status-heading"><h2 id="diagnostic-status-heading">Optional skills diagnostic</h2>
      <p>Status: <SyntheticText>{({ NOT_STARTED: "Not started", IN_PROGRESS: "In progress", SKIPPED: "Skipped", COMPLETED: "Completed · advisory only" })[profile.diagnosticStatus]}</SyntheticText>. Untimed and non-certifying.</p>
      <form action={beginSkillsCheck}><button className="secondary-button" type="submit"><SyntheticText>{profile.diagnosticStatus === "COMPLETED" ? "View advisory feedback" : profile.diagnosticStatus === "IN_PROGRESS" ? "Resume optional skills check" : "Take the optional skills check"}</SyntheticText></button></form>
    </section>
    <section className="learning-section readiness-card" aria-labelledby="readiness-heading"><h2 id="readiness-heading">Generalist Qualification Exam readiness</h2>
      {readiness?.latestFinalized ? <FinalizedResult result={readiness.latestFinalized} compact /> : <p><strong><SyntheticText>{readiness?.kind === "AWAITING_REVIEW" ? "Awaiting owner review" : readiness?.kind === "ACTIVE" ? "Active Generalist Qualification Exam attempt" : "Not yet assessed"}</SyntheticText></strong></p>}
      {readiness?.cooldownUntil && <p>Retake cooldown active until <SyntheticText>{new Date(readiness.cooldownUntil).toUTCString()}</SyntheticText>. Eligibility is checked on the server.</p>}
      <p>Lesson completion and diagnostic feedback do not establish Generalist Qualification Exam readiness. The readiness screen checks Generalist practice coverage, cooldown, fresh scenario capacity and server timer status.</p>
      <p>The Generalist Qualification Exam passing standard stays at 85% or higher after owner review and finalization. This dashboard and the skills check do not issue credentials.</p>
      <Link href="/capstone" className="primary-button button-link">Check Generalist Qualification Exam readiness</Link>
    </section>
    <div className="dashboard-wide"><CandidateCredentials records={credentials} /></div>
    <section className="learning-section" aria-labelledby="opportunity-access-heading"><h2 id="opportunity-access-heading">Remote opportunity access</h2>
      <p><SyntheticText>{opportunities?.unlocked ? "Opportunity queue unlocked: a finalized passing Generalist Qualification Exam and active credential are recorded." : "Opportunity queue locked: a finalized Generalist score of at least 85 and an active credential from that attempt are required. Suspended or revoked credentials do not unlock the queue."}</SyntheticText></p>
      <Link href="/opportunities" className="inline-link">Check curated opportunity queue</Link>
    </section>
    <section className="learning-section" aria-labelledby="optional-heading"><h2 id="optional-heading">Optional explorations</h2>
      <ul><li><Link href="/workflow-lab">Workflow Skills Lab</Link> · optional, unscored, never required for the Generalist credential</li>
        <li><Link href="/technical-preview">Technical Preview</Link> · non-credentialing</li></ul>
    </section>
    <div className="learning-section dashboard-wide"><RubricGuide /><EvaluationReference /></div>
    </div>
  </section>;
}
