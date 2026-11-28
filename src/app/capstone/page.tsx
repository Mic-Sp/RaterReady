import type { Metadata } from "next";
import Link from "next/link";
import { requirePageRole } from "../../server/auth/page-access";
import { prisma } from "../../lib/prisma";
import { getCapstoneReadiness, type CapstoneReadiness } from "../../server/capstone/service";
import { generalistPracticeCompetencies } from "../../lib/generalist-competencies";
import { DemoBadge } from "../components/demo-badge";
import { VerificationRequestForm } from "../components/account-link-forms";
import { CapstoneStartForm } from "./start-form";
import { ServerStatusRefresh } from "./server-status-refresh";
import { resumeCapstoneAction } from "./actions";

export const metadata: Metadata = { title: "Generalist Qualification Exam readiness | RaterReady" };

const eligibility = {
  READY: { title: "You're eligible to start" },
  ACTIVE: { title: "Your exam is in progress" },
  MISSING_PRACTICE: { title: "Finish practicing all six areas", detail: "Submit one exercise in each area. Any practice score counts." },
  COOLDOWN: { title: "Your next attempt opens soon" },
  AWAITING_REVIEW: { title: "Your exam is being reviewed", detail: "You can see your result here after human review." },
  ALREADY_PASSED: { title: "You've passed the exam" },
  CAPACITY: { title: "You've used all the available exam forms", detail: "Check back when new scenarios are available." },
  UNAVAILABLE: { title: "The exam is temporarily unavailable", detail: "Please check back later." },
  EMAIL_UNVERIFIED: { title: "Verify your email to start" },
} satisfies Record<CapstoneReadiness["kind"], { title: string; detail?: string }>;

const notices: Record<string, string> = {
  started: "Your timer has started. Resume your exam below.",
  resumed: "Your exam has the same deadline.",
  "not-active": "There is no active exam to resume.",
};

/** Display authoritative timestamps with a consistent, explicit timezone. */
function timestamp(value: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "long", timeZone: "UTC" }).format(new Date(value));
}

function duration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return [minutes > 0 && `${minutes} ${minutes === 1 ? "minute" : "minutes"}`, remainder > 0 && `${remainder} ${remainder === 1 ? "second" : "seconds"}`].filter(Boolean).join(" ");
}

function ExamDetails({ view }: { view: CapstoneReadiness }) {
  const { blueprint, attempt } = view;
  return <details className="reference-panel exam-details">
    <summary>Exam details</summary>
    {blueprint && <>
      <h2>Scoring and retakes</h2>
      <p className="exam-threshold">Passing threshold: {blueprint.scoringPolicy.passingThreshold}%</p>
      <p>Evaluation judgment draws on G2, G4 and G5, rubric application on G1 and G5, factual verification on G3, and written justifications on G6.</p>
      <dl className="blueprint-grid">
        <div><dt>Evaluation judgment</dt><dd>{blueprint.scoringPolicy.judgment} points</dd></div>
        <div><dt>Rubric application</dt><dd>{blueprint.scoringPolicy.rubric} points</dd></div>
        <div><dt>Factual verification</dt><dd>{blueprint.scoringPolicy.verification} points</dd></div>
        <div><dt>Written justifications</dt><dd>{blueprint.scoringPolicy.written} points</dd></div>
      </dl>
      <p><strong>Wait time between attempts</strong> · If you don’t pass, you can try again after {blueprint.retakeCooldownHours} hours with a fresh set of scenarios.</p>
      <p>The wait starts when your result is finalized or your timer runs out. A new attempt requires an unused set of scenarios.</p>
    </>}
    <h2>Practice by area</h2>
    <p>G1–G6 are RaterReady’s own practice areas. Lessons, the diagnostic, Workflow Skills Lab and Technical Preview don’t count toward exam practice coverage.</p>
    <ul>
      {(Object.keys(generalistPracticeCompetencies) as (keyof typeof generalistPracticeCompetencies)[]).map((code) => {
        const count = view.practiceSubmissionCounts[code];
        return <li key={code}><Link className="inline-link" href={`/practice?competency=${code}`}>{code} · {generalistPracticeCompetencies[code]}</Link> · {count} {count === 1 ? "submission" : "submissions"}</li>;
      })}
    </ul>
    <h2>Exam setup</h2>
    <dl className="timing-grid">
      <div><dt>Last checked</dt><dd><time dateTime={view.serverNow}>{timestamp(view.serverNow)}</time></dd></div>
      <div><dt>Fresh forms</dt><dd>{view.remainingForms} exam {view.remainingForms === 1 ? "form" : "forms"} available</dd></div>
      {blueprint && <>
        <div><dt>Blueprint version</dt><dd>{blueprint.version}</dd></div>
        <div><dt>Scoring version</dt><dd>{blueprint.scoringPolicy.version}</dd></div>
        <div><dt>Independent-Work Policy version</dt><dd>{blueprint.independentWorkPolicyVersion}</dd></div>
        <div><dt>Timing multiplier</dt><dd>{attempt?.appliedTimeMultiplier ?? view.timeMultiplier}×</dd></div>
      </>}
      {attempt && <>
        <div><dt>Attempt reference</dt><dd data-testid="capstone-attempt-id">{attempt.id}</dd></div>
        <div><dt>Timer started</dt><dd><time dateTime={attempt.startedAt}>{timestamp(attempt.startedAt)}</time></dd></div>
        <div><dt>Policy accepted</dt><dd><time dateTime={attempt.acknowledgedAt}>{timestamp(attempt.acknowledgedAt)}</time></dd></div>
      </>}
    </dl>
    {blueprint && <p>Your time limit is rounded up to the nearest second. Changes to your timing settings apply to a new attempt. Contact RaterReady before starting if you have a timing question.</p>}
  </details>;
}

/** Candidate-only authorization precedes the metadata lookup. Only the server can grant eligibility or start an exam timer. */
export default async function CapstoneReadinessPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const user = await requirePageRole("CANDIDATE");
  const view = await getCapstoneReadiness(prisma, user.id);
  const { notice } = await searchParams;
  const { blueprint, attempt } = view;
  // A changed pin remounts the consent form so acceptance cannot carry over to a revised policy.
  const policyKey = blueprint && [blueprint.id, blueprint.version, blueprint.scoringPolicy.version, blueprint.independentWorkPolicyVersion].join(":");
  const ready = view.kind === "READY";
  const current: { title: string; detail?: string } = eligibility[view.kind];
  const practiceTarget = view.missingPractice[0] ?? view.practiced.find((code) => view.practiceSubmissionCounts[code] === 1);
  const areaCount = view.practiced.length + view.missingPractice.length;
  return <article className="page-card learning-page qualification-readiness" aria-labelledby="capstone-heading">
    <header>
      <p className="eyebrow"><DemoBadge /></p>
      <h1 id="capstone-heading">Generalist Qualification Exam</h1>
    </header>
    {blueprint && <div className="exam-overview">
      <p>{duration(blueprint.baseDurationSeconds)} · {blueprint.questionCount} scenarios ({blueprint.writtenPromptCount} with short written answers) · Pass at {blueprint.scoringPolicy.passingThreshold}% · Retakes allowed after {blueprint.retakeCooldownHours} hours.</p>
      {view.grantedSeconds !== null && view.grantedSeconds !== blueprint.baseDurationSeconds && <p>Your time limit: <strong>{duration(view.grantedSeconds)}</strong>.</p>}
    </div>}
    {notice && Object.hasOwn(notices, notice) && <p role="status" className="success-note">{notices[notice]}</p>}

    <section className="exam-readiness" aria-labelledby="exam-readiness-heading">
      <h2 id="exam-readiness-heading">Before you start</h2>
      <CapstoneStartForm key={policyKey} blueprint={blueprint} ready={ready} active={Boolean(attempt)}>
        <li className="exam-check-row">
          <span className="exam-check-icon" aria-hidden="true">{view.missingPractice.length === 0 ? "✓" : "○"}</span>
          <div>
            <strong>{view.practiced.length} of {areaCount} areas practiced</strong>
            {view.missingPractice.length > 0 && <> · {view.missingPractice.length} to go</>}
            {" "}<Link className="inline-link" href={practiceTarget ? `/practice?competency=${practiceTarget}` : "/practice"}>How ready am I?</Link>
          </div>
        </li>
        <li className="exam-check-row">
          <span className="exam-check-icon" aria-hidden="true">{ready ? "✓" : "○"}</span>
          {/* Announce eligibility changes without rereading a fresh UTC timestamp on each server refresh. */}
          <div aria-live="polite" aria-atomic="true">
            <h3>{current.title}</h3>
            {current.detail && <p>{current.detail}</p>}
            {view.kind === "COOLDOWN" && view.cooldownUntil && <p>Try again after <time dateTime={view.cooldownUntil}>{timestamp(view.cooldownUntil)}</time>.</p>}
            {view.kind === "COOLDOWN" && view.lastExpiredAt && <p>Your previous timer ended at <time dateTime={view.lastExpiredAt}>{timestamp(view.lastExpiredAt)}</time>.</p>}
            {view.latestFinalized && <Link className="inline-link" href={`/capstone/${view.latestFinalized.attemptId}`}>View your latest result</Link>}
          </div>
        </li>
      </CapstoneStartForm>
    </section>

    {view.kind === "EMAIL_UNVERIFIED" && <section className="learning-section readiness-summary-card" aria-label="Generalist Qualification Exam email verification">
      <h2>Confirm your email address</h2>
      <p>While you verify your email, you can keep learning and practicing at your own pace.</p>
      <VerificationRequestForm /><Link href="/verify-email" className="inline-link">Manage email verification</Link>
    </section>}
    {attempt && <section className="exam-resume" aria-labelledby="active-attempt-heading">
      <h2 id="active-attempt-heading">Your exam deadline</h2>
      <p><time dateTime={attempt.expiresAt}>{timestamp(attempt.expiresAt)}</time>. Your timer keeps running while you’re away.</p>
      <form action={resumeCapstoneAction}><button className="primary-button" type="submit">Resume active attempt</button></form>
    </section>}

    <section className="exam-after-submit" aria-labelledby="after-submit-heading">
      <h2 id="after-submit-heading">What happens after you submit</h2>
      <p>A person reviews every submission before your result appears, so review times vary during the pilot. A passing result earns your pilot credential and opens the Opportunities queue.</p>
    </section>
    <ExamDetails view={view} />
    <div className="exam-entry-links">
      <Link href="/dashboard" className="inline-link">Return to dashboard</Link>
      {!ready && !attempt && <form action="/capstone" method="get"><button type="submit" className="text-button">Check eligibility again</button></form>}
    </div>
    <ServerStatusRefresh active={view.kind === "ACTIVE"} />
  </article>;
}
