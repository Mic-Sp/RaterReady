import { DemoBadge, SyntheticText } from "../components/demo-badge";
import Link from "next/link";
import type { AuthIdentity } from "../../server/auth/accounts";
import type { getLearningSnapshot } from "../../server/learning/service";
import type { CapstoneReadiness } from "../../server/capstone/service";
import type { getCandidateOpportunities } from "../../server/opportunities/service";
import type { CandidateCredential } from "../../lib/credential-content";
import { competencies, learningLevels } from "../../lib/learning-content";
import { generalistPracticeCompetencies } from "../../lib/generalist-competencies";
import { catalogHeading, competencySummaries } from "../../lib/catalog-presentation";
import { reviewTimestamp } from "../../lib/review-presentation";
import { RubricGuide } from "../components/rubric-guide";
import { EvaluationReference } from "../components/evaluation-reference";
import { CandidateCredentials } from "../components/candidate-credentials";
import { LearningCard } from "../components/learning-card";
import { ReadingStatus, learningIndependenceNote } from "../components/reading-status";
import { chooseLevel, beginSkillsCheck } from "../learning/actions";
import { getDashboardNextStep, journey } from "./next-step";

const notices: Record<string, string> = {
  "level-saved": "Learning level saved. All completed lessons remain saved.",
  "lesson-saved": "Lesson completion saved.",
  "diagnostic-skipped": "Skills check skipped. Your learning level and completed lessons are unchanged.",
};

const examStatus = {
  READY: "Ready to start",
  ACTIVE: "Exam in progress",
  MISSING_PRACTICE: "Practice needed before the exam",
  COOLDOWN: "Waiting period before your next attempt",
  AWAITING_REVIEW: "Your exam is in review",
  ALREADY_PASSED: "Exam passed",
  CAPACITY: "A new exam form isn’t available yet",
  UNAVAILABLE: "Exam readiness is currently unavailable",
  EMAIL_UNVERIFIED: "Verify your email before starting the exam",
} satisfies Record<CapstoneReadiness["kind"], string>;

/** Present saved reading, practice and exam progress without treating suggestions as prerequisites. */
export function LearningDashboard({ user, profile, notice, readiness, credentials = [], opportunities }: {
  user: AuthIdentity;
  profile: Awaited<ReturnType<typeof getLearningSnapshot>>;
  notice?: string;
  readiness?: CapstoneReadiness;
  credentials?: CandidateCredential[];
  opportunities?: Pick<Awaited<ReturnType<typeof getCandidateOpportunities>>, "unlocked" | "reason">;
}) {
  const completed = new Set(profile.moduleProgress.filter((item) => item.level === profile.selectedLevel).map((item) => item.competency));
  const unreadIndex = profile.curriculum.findIndex((item) => !completed.has(item.competency));
  const unread = profile.curriculum[unreadIndex];
  const level = learningLevels.find((item) => item.code === profile.selectedLevel)!;
  const practiceAreas = new Set(profile.practiceProgress.map((item) => item.competency));
  const remainingPractice = competencies.find((item) => !practiceAreas.has(item.code))?.code;
  const examPassed = Boolean(opportunities?.unlocked || opportunities?.reason === "ACTIVE_CREDENTIAL_REQUIRED" || readiness?.latestFinalized?.passed);
  const next = getDashboardNextStep({
    level: profile.selectedLevel,
    nextLesson: unread && { competency: unread.competency, title: unread.title, number: unreadIndex + 1 },
    remainingPractice,
    hasReadLesson: completed.size > 0,
    exam: readiness?.kind,
    examPassed,
    opportunitiesUnlocked: Boolean(opportunities?.unlocked),
  });
  const curriculum = <section className="learning-section dashboard-wide" aria-labelledby="curriculum-heading">
    <h2 id="curriculum-heading">Six-module curriculum</h2>
    <p>{level.title} · Read in order or revisit any lesson.</p>
    <ol className="curriculum-list learning-card-grid" role="list">{profile.curriculum.map((item, index) => <li key={item.competency}>
      <LearningCard headingId={`lesson-${item.competency}`} headingLevel={3} title={item.title}
        href={`/learn/${item.competency}?level=${profile.selectedLevel}`} action={`Read lesson ${index + 1}`}
        metadata={<><span className="competency-tag">Lesson {index + 1}</span><ReadingStatus complete={completed.has(item.competency)} /></>}
        summary={<p>{item.summary}</p>} />
    </li>)}</ol>
  </section>;

  const practice = <section className="learning-section dashboard-wide" aria-labelledby="practice-progress-heading">
    <div className="learning-section-title"><h2 id="practice-progress-heading">Generalist practice progress</h2><DemoBadge /></div>
    <p className="progress-metric">{practiceAreas.size} of 6 competency areas practiced</p>
    <progress max={6} value={practiceAreas.size} aria-label="Competency areas with submitted practice" />
    <p>{remainingPractice ? "Send a practice submission to check off a skill area." : "You’ve submitted practice in all six skill areas."} You can revisit any exercise.</p>
    {profile.practiceDrafts[0] && <p><Link href={`/practice/${profile.practiceDrafts[0].scenarioId}`} className="inline-link">Open saved draft: <SyntheticText rebrand>{catalogHeading(profile.practiceDrafts[0].scenario.title)}</SyntheticText></Link></p>}
    <Link href="/practice" className="inline-link">Browse all Generalist practice scenarios</Link>
    <ul className="competency-grid learning-card-grid" role="list">{competencies.map(({ code }) => {
      const submissions = profile.practiceProgress.filter((item) => item.competency === code).reduce((sum, item) => sum + item.submissionCount, 0);
      return <li key={code}><LearningCard headingId={`practice-area-${code}`} headingLevel={3} title={generalistPracticeCompetencies[code]}
        metadata={<span className="competency-tag">{code} · All levels</span>} summary={<p>{competencySummaries[code]}</p>}
        detail={submissions ? `${submissions} practice ${submissions === 1 ? "submission" : "submissions"}` : "Ready to try"}
        href={`/practice?competency=${code}`} action={`Practice ${code}`} /></li>;
    })}</ul>
  </section>;

  return <section className="page-card learning-page learning-dashboard" aria-labelledby="landing-heading">
    <h1 id="landing-heading">Your candidate dashboard</h1>
    <p className="page-intro">Welcome, <SyntheticText>{user.name}</SyntheticText>.</p>
    {notice && Object.hasOwn(notices, notice) && <p role="status" className="success-note">{notices[notice]}</p>}

    <section className="dashboard-next" aria-labelledby="dashboard-next-heading">
      <h2 id="dashboard-next-heading">What’s next</h2>
      <ol className="dashboard-journey" aria-label="Your Generalist journey" role="list">
        {journey.map((stage, index) => <li key={stage} aria-current={next.stage === stage ? "step" : undefined}>
          <span><span aria-hidden="true">{index + 1}. </span>{stage}</span>
          {next.stage === stage && <strong>You are here</strong>}
        </li>)}
      </ol>
      <p>{next.description}</p>
      <Link href={next.href} className="primary-button button-link">{next.label}</Link>
    </section>

    <div className="dashboard-grid">
      {unread ? <>{curriculum}{practice}</> : <>{practice}{curriculum}</>}
      <section className="learning-section" aria-labelledby="progress-heading">
        <h2 id="progress-heading">Your learning progress</h2>
        <p className="progress-metric"><strong>{level.title}</strong> · {completed.size} of {profile.curriculum.length} lessons marked complete</p>
        <progress max={profile.curriculum.length || 6} value={completed.size} aria-label="Lessons marked complete at the current level" />
        <Link href={`/learn?level=${profile.selectedLevel}`} className="inline-link">Browse all lessons in {level.title}</Link>
      </section>
      <section className="learning-section" aria-labelledby="level-heading">
        <h2 id="level-heading">Change your learning level</h2>
        <p>Switch freely. Completed lessons stay saved at their original level.</p>
        <form action={chooseLevel} className="form-field">
          <label htmlFor="learning-level">Learning level</label>
          <select id="learning-level" name="level" defaultValue={profile.selectedLevel}>{learningLevels.map((item) => <option key={item.code} value={item.code}>{item.title}</option>)}</select>
          <button className="secondary-button" type="submit">Save learning level</button>
        </form>
        <Link href="/onboarding" className="inline-link">Revisit starting options</Link>
        <Link href="/welcome" className="inline-link">Revisit the welcome check-in</Link>
      </section>
      <section className="learning-section readiness-card" aria-labelledby="readiness-heading">
        <h2 id="readiness-heading">Generalist Qualification Exam readiness</h2>
        <p><strong>{readiness ? examStatus[readiness.kind] : "Not yet assessed"}</strong></p>
        {readiness?.latestFinalized && <p>Latest score: {readiness.latestFinalized.finalScore.toFixed(2)} / 100 · {readiness.latestFinalized.passed ? "Passed" : "Not yet passed"}. <Link href={`/capstone/${readiness.latestFinalized.attemptId}`} className="inline-link">View score and feedback</Link></p>}
        {readiness?.cooldownUntil && <p>Next attempt available after <time dateTime={readiness.cooldownUntil}>{reviewTimestamp(readiness.cooldownUntil)}</time>.</p>}
        <p>Review the practice and timing requirements before starting. A reviewed score of 85% or higher passes.</p>
        <Link href="/capstone" className="secondary-button button-link">View exam readiness</Link>
      </section>
      <section className="learning-section" aria-labelledby="opportunity-access-heading">
        <h2 id="opportunity-access-heading">Remote opportunity access</h2>
        <p><strong>{opportunities?.unlocked ? "Your opportunity queue is open" : examPassed ? "You passed the exam" : "Opportunities unlock after you pass the exam"}</strong></p>
        <progress max={2} value={opportunities?.unlocked ? 2 : examPassed ? 1 : 0} aria-label="Progress toward opportunity access" />
        <p>{opportunities?.unlocked ? "Browse curated listings. Each listing explains how to apply and what to expect." : examPassed ? "An active credential is the last step to access the queue." : "Pass the Generalist Qualification Exam and earn an active credential to access the queue."}</p>
        <Link href="/opportunities" className="inline-link">Check curated opportunity queue</Link>
      </section>
      {credentials.length > 0 && <div className="dashboard-wide"><CandidateCredentials records={credentials} compact /></div>}
      <section className="learning-section" aria-labelledby="diagnostic-status-heading">
        <h2 id="diagnostic-status-heading">Optional skills diagnostic</h2>
        <p>{({ NOT_STARTED: "Not started", IN_PROGRESS: "In progress", SKIPPED: "Skipped", COMPLETED: "Completed · advisory only" })[profile.diagnosticStatus]}. Use this untimed check to find a learning level that feels right.</p>
        <form action={beginSkillsCheck}><button className="secondary-button" type="submit">{profile.diagnosticStatus === "COMPLETED" ? "View advisory feedback" : profile.diagnosticStatus === "IN_PROGRESS" ? "Resume optional skills check" : "Take the optional skills check"}</button></form>
      </section>
      <section className="learning-section" aria-labelledby="optional-heading">
        <h2 id="optional-heading">Optional explorations</h2>
        <ul><li><Link href="/workflow-lab">Workflow Skills Lab</Link> · Set up your workspace</li>
          <li><Link href="/technical-preview">Technical Preview</Link> · Try technical evaluation</li></ul>
      </section>
    </div>

    <details className="reference-panel dashboard-reference">
      <summary>Reference</summary>
      <RubricGuide showDisclosure={false} />
      <EvaluationReference />
    </details>
    <p className="learning-independence-note">{learningIndependenceNote}</p>
  </section>;
}
