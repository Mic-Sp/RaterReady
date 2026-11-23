import type { Metadata } from "next";
import Link from "next/link";
import { requirePageRole } from "../../server/auth/page-access";
import { prisma } from "../../lib/prisma";
import { getCapstoneReadiness } from "../../server/capstone/service";
import { generalistPracticeCompetencies } from "../../lib/generalist-competencies";
import { CapstoneStartForm } from "./start-form";
import { ServerStatusRefresh } from "./server-status-refresh";
import { resumeCapstoneAction } from "./actions";
import { FinalizedResult } from "./finalized-result";

export const metadata: Metadata = { title: "Capstone readiness | RaterReady" };
const messages = {
  READY: "Eligible to start", ACTIVE: "Active capstone attempt", MISSING_PRACTICE: "Generalist practice still needed", COOLDOWN: "Retake cooldown active",
  AWAITING_REVIEW: "Awaiting owner review", ALREADY_PASSED: "Generalist capstone already passed", CAPACITY: "No fresh capstone form available", UNAVAILABLE: "Capstone configuration unavailable",
};

/** Format database timestamps in an explicit timezone; device clock/timezone cannot alter the displayed server record. */
function timestamp(value: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "long", timeZone: "UTC" }).format(new Date(value));
}

/** Candidate-only authorization precedes all allocation/status queries. This page receives metadata only, never capstone questions or keys. */
export default async function CapstoneReadinessPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const user = await requirePageRole("CANDIDATE");
  const view = await getCapstoneReadiness(prisma, user.id);
  const { notice } = await searchParams;
  const blueprint = view.blueprint;
  const notices: Record<string, string> = { started: "Synthetic attempt created. Its server deadline is now fixed.", resumed: "Your existing attempt was resumed with the same deadline.", "not-active": "There is no active unexpired attempt to resume. Review the current server status." };
  return <article className="page-card learning-page" aria-labelledby="capstone-heading">
    <p className="eyebrow">DEMO - SYNTHETIC · Generalist capstone</p><h1 id="capstone-heading">Capstone readiness</h1>
    <p className="page-intro">Check eligibility and the Independent-Work Policy before starting a server-timed attempt.</p>
    <aside className="demo-notice" aria-labelledby="lifecycle-demo-heading"><h2 id="lifecycle-demo-heading">Timed synthetic capstone</h2>
      <p>Starting reserves a fresh six-slot form and begins its deadline. Use Resume active attempt to enter the exam. Coaching and expert explanations are disabled; responses lock at final submission or expiry.</p></aside>
    {notice && Object.hasOwn(notices, notice) && <p role="status" className="success-note">{notices[notice]}</p>}
    {view.latestFinalized && <FinalizedResult result={view.latestFinalized} compact />}
    <section className="learning-section" aria-labelledby="eligibility-heading">
      {/* Announce a changed lock/eligibility state without reading a fresh timestamp every 15 seconds. */}
      <div aria-live="polite" aria-atomic="true"><h2 id="eligibility-heading">{messages[view.kind]}</h2></div>
      <p>Server checked: <time dateTime={view.serverNow}>{timestamp(view.serverNow)}</time></p>
      {view.kind === "MISSING_PRACTICE" && <p>Submit a Generalist practice exercise covering each G1–G6 area. No particular practice score or learning level is required.</p>}
      {view.kind === "CAPACITY" && <p>Previously exposed scenario families cannot be reused. Contact the project owner for additional synthetic capacity.</p>}
      {view.kind === "AWAITING_REVIEW" && <p>A submitted attempt must complete owner review before another can start.</p>}
      {view.kind === "ALREADY_PASSED" && <p>A finalized passing attempt is already recorded. This screen does not issue or change credentials.</p>}
      {view.kind === "UNAVAILABLE" && <p>The versioned capstone configuration could not be verified. Contact the project owner before starting.</p>}
      <p>Fresh form capacity: {view.remainingForms}. Each new form reserves six previously unseen scenario families.</p>
      {view.cooldownUntil && <p>Retake available after: <time dateTime={view.cooldownUntil}>{timestamp(view.cooldownUntil)}</time>. The pinned cooldown is measured from an unsuccessful finalization or the server expiry deadline.</p>}
      {view.lastExpiredAt && <p>Previous attempt expired and is locked at: <time dateTime={view.lastExpiredAt}>{timestamp(view.lastExpiredAt)}</time>.</p>}
      <form action="/capstone" method="get"><button type="submit" className="secondary-button">Check server status</button></form>
    </section>
    {view.attempt && <section className="learning-section readiness-card" aria-labelledby="active-attempt-heading">
      <h2 id="active-attempt-heading">Your fixed server timer</h2><p>Attempt reference: <span data-testid="capstone-attempt-id">{view.attempt.id}</span></p>
      <p>Started: <time dateTime={view.attempt.startedAt}>{timestamp(view.attempt.startedAt)}</time></p>
      <p>Deadline: <time dateTime={view.attempt.expiresAt}>{timestamp(view.attempt.expiresAt)}</time></p>
      <p>Independent-work acknowledgment: <time dateTime={view.attempt.acknowledgedAt}>{timestamp(view.attempt.acknowledgedAt)}</time></p>
      <p>Applied timing multiplier: {view.attempt.appliedTimeMultiplier}×. Blueprint version {view.attempt.blueprintVersion}; scoring policy version {view.attempt.scoringPolicyVersion}.</p>
      <p>Remaining at the last server check: {view.attempt.remainingSeconds} seconds. While this screen is visible, status is checked every 15 seconds and when you return to the tab.</p>
      <p>The server locks the attempt at its deadline, even if this display is stale or the page was closed. Every resume/status request persists any newly observed expiry.</p>
      <form action={resumeCapstoneAction}><button className="secondary-button" type="submit">Resume active attempt</button></form>
    </section>}
    <section className="learning-section" aria-labelledby="coverage-heading"><h2 id="coverage-heading">Required Generalist practice coverage</h2>
      <p>G1–G6 are RaterReady’s internal Generalist competency identifiers, not an external industry standard.</p>
      <ul>{Object.entries(generalistPracticeCompetencies).map(([code, title]) => <li key={code}><Link href={`/practice?competency=${code}`}>{code} · {title}</Link>: {view.practiced.includes(code as typeof view.practiced[number]) ? "Practice submitted" : "Practice still needed"}</li>)}</ul>
      <p>Diagnostic scores, Workflow Skills Lab completion and Technical Preview exercises never waive these requirements or change the 85% passing standard. Practice eligibility does not certify mastery.</p>
    </section>
    {blueprint && <>
      <section className="learning-section" aria-labelledby="pins-heading"><h2 id="pins-heading">Pinned capstone standard</h2>
        <p>Blueprint {blueprint.code}, version {blueprint.version}. Scoring policy {blueprint.scoringPolicy.code}, version {blueprint.scoringPolicy.version}.</p>
        <p>{blueprint.questionCount} scenario slots cover G1–G6; {blueprint.writtenPromptCount} require written justifications.</p>
        <p>Evaluation judgment {blueprint.scoringPolicy.judgment} points · rubric application {blueprint.scoringPolicy.rubric} · factual verification {blueprint.scoringPolicy.verification} · written justifications {blueprint.scoringPolicy.written}.</p>
        <p>Passing requires at least {blueprint.scoringPolicy.passingThreshold}% only after owner review and finalization. Starting or expiring an attempt does not issue a score or credential.</p>
        <p>Base duration: {blueprint.baseDurationSeconds / 60} minutes. Profile timing multiplier: {view.timeMultiplier}×. {view.grantedSeconds !== null && `${view.attempt ? "Reserved active duration" : "Duration for a new attempt"}: ${view.grantedSeconds / 60} minutes.`}</p>
        <p>Timing is rounded up to whole seconds. Timing-setting changes apply only to a new attempt; an active deadline remains fixed. Contact the project owner about a timing setting before starting.</p>
        <p>Retake cooldown: {blueprint.retakeCooldownHours} hours after an unsuccessful finalized or expired attempt, subject to fresh scenario capacity.</p>
      </section>
      <section className="learning-section" aria-labelledby="independent-work-heading"><h2 id="independent-work-heading">Independent-Work Policy</h2>
        <p>Policy version: {blueprint.independentWorkPolicyVersion}</p><ol>{blueprint.rules.map((rule) => <li key={rule}>{rule}</li>)}</ol>
        {view.kind === "READY" ? <CapstoneStartForm blueprint={blueprint} /> : <p>Starting a new attempt becomes available only when the server confirms eligibility. An existing active attempt uses its original acknowledgment.</p>}
      </section>
    </>}
    <ServerStatusRefresh active={view.kind === "ACTIVE"} /><Link href="/dashboard" className="inline-link">Return to dashboard</Link>
  </article>;
}
