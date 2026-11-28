import Link from "next/link";
import { DemoBadge, SyntheticText } from "../components/demo-badge";
import { requirePageRole } from "../../server/auth/page-access";
import { prisma } from "../../lib/prisma";
import { getCandidateOpportunities } from "../../server/opportunities/service";
import { getCapstoneReadiness, type CapstoneReadiness } from "../../server/capstone/service";
import { externalOpportunityUrl, opportunityLinkLabels } from "../../lib/opportunity-content";
import { reviewTimestamp } from "../../lib/review-presentation";
import { AboutOpportunityLinks } from "./about-links";

const steps = ["Practice", "Qualification Exam", "Owner Review", "Queue Unlocked"];

function lockedJourney(readiness: CapstoneReadiness, waitingForCredential: boolean) {
  if (waitingForCredential) return { step: 3, detail: "Your passing exam result is recorded. The queue opens when your credential is active.", action: "Check my exam status" };
  if (readiness.kind === "AWAITING_REVIEW") return { step: 2, detail: "Your submission is in review. You can check its status on the exam page.", action: "Check my exam status" };
  if (readiness.kind === "ACTIVE") return { step: 1, detail: "Your exam is in progress. Resume it from the exam page.", action: "Check my exam status" };
  if (readiness.kind === "COOLDOWN" || readiness.latestFinalized) return { step: 1, detail: "A passing exam result of 85% or higher opens the queue. Check your exam status for your result or next attempt.", action: "Check my exam status" };
  if (readiness.missingPractice.length) return { step: 0, detail: `${readiness.practiced.length} of ${readiness.practiced.length + readiness.missingPractice.length} practice areas complete. Finish practicing all six areas to prepare for the exam.`, action: "Go to the Qualification Exam" };
  return { step: 1, detail: "The queue opens after owner review confirms a passing exam result of 85% or higher.", action: "Go to the Qualification Exam" };
}

function OpportunityPreview() {
  return <section className="learning-section" aria-labelledby="opportunity-preview-heading">
    <h2 id="opportunity-preview-heading">What you’ll find here</h2>
    <ul className="learning-card-grid" role="list">
      <li><article className="learning-card">
        <p className="competency-tag opportunity-sample-label">Sample preview</p>
        <h3>Public applications</h3>
        <p>Public application pages for remote AI evaluation, with notes on where to check screening and eligibility.</p>
      </article></li>
      <li><article className="learning-card">
        <p className="competency-tag opportunity-sample-label">Sample preview</p>
        <h3>Role information</h3>
        <p>Public information about evaluation work, with source and verification dates so you know where to check current terms.</p>
      </article></li>
    </ul>
  </section>;
}

/** Candidate role and the finalized-pass/active-credential gate precede all real listing rendering. Locked previews use static sample copy. */
export default async function OpportunityQueuePage() {
  const candidate = await requirePageRole("CANDIDATE");
  const view = await getCandidateOpportunities(prisma);
  const journey = view.unlocked ? null : lockedJourney(await getCapstoneReadiness(prisma, candidate.id), view.reason === "ACTIVE_CREDENTIAL_REQUIRED");
  return <article className="page-card learning-page opportunities-page" aria-labelledby="opportunity-heading">
    <header>
      <p className="eyebrow"><DemoBadge /> · Independent curation</p>
      <h1 id="opportunity-heading">Curated remote opportunity queue</h1>
      <p className="page-intro">Chosen by RaterReady, not by employers</p>
    </header>
    {journey ? <>
      <section className="learning-section" aria-labelledby="queue-progress-heading">
        <h2 id="queue-progress-heading">Unlock your opportunity queue</h2>
        <ol className="opportunity-steps" role="list" aria-label="Progress toward queue access">
          {steps.map((label, index) => <li key={label} aria-current={index === journey.step ? "step" : undefined}>
            <span aria-hidden="true">{index < journey.step ? "✓" : "○"}</span>
            <strong>{label}</strong>
            <span className="opportunity-step-status">{index < journey.step ? "Complete" : index === journey.step ? "You are here" : "Upcoming"}</span>
          </li>)}
        </ol>
        <p>{journey.detail}</p>
        {journey.step === 0 && <p>The queue opens after a passing exam result of 85% or higher.</p>}
      </section>
      <OpportunityPreview />
      <div className="opportunity-actions">
        <Link href="/capstone" className="primary-button button-link">{journey.action}</Link>
        <Link href="/dashboard" className="inline-link">Return to dashboard</Link>
      </div>
    </> : <section className="learning-section" aria-labelledby="available-listings-heading">
      <h2 id="available-listings-heading">Available curated listings</h2>
      <p>These are representative links and fictional referral examples. Check current terms with each organization.</p>
      {!view.listings.length ? <p>No active listings are available right now.</p> : <ul className="practice-catalog">{view.listings.map((listing) => {
        const referral = listing.linkType === "PERSONAL_REFERRAL";
        const source = referral ? null : externalOpportunityUrl(listing.sourceUrl);
        const destination = referral ? null : externalOpportunityUrl(listing.url);
        return <li key={listing.code}>
          <h3><SyntheticText rebrand>{listing.title}</SyntheticText></h3>
          <p>Organization: <SyntheticText>{listing.organization}</SyntheticText></p>
          <p>Link type: {opportunityLinkLabels[listing.linkType]}</p>
          <p>Source attribution: <SyntheticText>{listing.sourceLabel}</SyntheticText></p>
          {source && <a className="inline-link" href={source} rel="noreferrer">Inspect attributed public source</a>}
          <p>{referral ? "Example checked" : "Last verified"}: <time dateTime={listing.lastVerifiedAt}>{reviewTimestamp(listing.lastVerifiedAt)}</time></p>
          <p>Eligibility notes: <SyntheticText>{listing.eligibilityNote}</SyntheticText></p>
          <p>Limitations: <SyntheticText>{listing.limitationsNote}</SyntheticText></p>
          {listing.referralDisclosure && <p>Referral disclosure: <SyntheticText>{listing.referralDisclosure}</SyntheticText></p>}
          {listing.referralPermissionNote && <p>Permission note: <SyntheticText>{listing.referralPermissionNote}</SyntheticText></p>}
          {referral ? <Link href="/opportunities/referral-demo" className="inline-link">Preview synthetic personal referral</Link>
            : destination ? <a href={destination} className="inline-link" rel="noreferrer">{listing.linkType === "PUBLIC_APPLICATION" ? "Open direct public application (external)" : "Open public information (external)"}</a>
              : <p>Link pending verification</p>}
        </li>;
      })}</ul>}
      <Link href="/dashboard" className="inline-link">Return to dashboard</Link>
    </section>}
    <AboutOpportunityLinks />
  </article>;
}
