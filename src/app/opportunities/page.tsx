import Link from "next/link";
import { requirePageRole } from "../../server/auth/page-access";
import { prisma } from "../../lib/prisma";
import { getCandidateOpportunities } from "../../server/opportunities/service";
import { opportunityIndependenceNotice, opportunityLinkLabels } from "../../lib/opportunity-content";
import { reviewTimestamp } from "../../lib/review-presentation";

/** Candidate role and finalized-pass/active-credential gate are checked server-side before any listing can enter HTML or RSC payloads. */
export default async function OpportunityQueuePage() {
  await requirePageRole("CANDIDATE");
  const view = await getCandidateOpportunities(prisma);
  return <article className="page-card learning-page" aria-labelledby="opportunity-heading"><p className="eyebrow">DEMO - SYNTHETIC · Independent curation</p><h1 id="opportunity-heading">Curated remote opportunity queue</h1>
    <aside className="demo-notice" aria-label="Platform independence disclosure"><p>{opportunityIndependenceNotice}</p></aside>
    {!view.unlocked ? <section className="learning-section" aria-labelledby="queue-lock-heading"><h2 id="queue-lock-heading">Opportunity queue locked</h2>
      <p>{view.reason === "ACTIVE_CREDENTIAL_REQUIRED" ? "A finalized passing score is recorded, but an active credential is required. Suspended or revoked credentials do not unlock this queue."
        : "Access requires a finalized Generalist capstone score of at least 85.00 / 100 and an active credential from that same attempt."}</p>
      <p>Public credential sharing is optional and does not affect this gate.</p><Link href="/capstone" className="inline-link">Check capstone status</Link></section> :
      <section className="learning-section" aria-labelledby="available-listings-heading"><h2 id="available-listings-heading">Available curated listings</h2>
        <p>DEMO - SYNTHETIC: representative links and fictional referral examples, not reserved vacancies or placement offers. Check each source’s current terms independently.</p>
        {!view.listings.length ? <p>No active listings are currently available. Owner curation may resume later.</p> : <ul className="practice-catalog">{view.listings.map((listing) => <li key={listing.code}>
          <h3>{listing.title}</h3><p>Organization: {listing.organization}</p><p>Link type: {opportunityLinkLabels[listing.linkType]}</p>
          <p>Source attribution: {listing.sourceLabel}</p>
          {listing.linkType === "PERSONAL_REFERRAL" ? <p>Source reference: {listing.sourceUrl} (reserved synthetic example address)</p> : <a className="inline-link" href={listing.sourceUrl} rel="noreferrer">Inspect attributed public source</a>}
          <p>Last verified: <time dateTime={listing.lastVerifiedAt}>{reviewTimestamp(listing.lastVerifiedAt)}</time>{listing.linkType === "PERSONAL_REFERRAL" && " · synthetic fixture validation only, not a live referral check"}</p>
          <p>Eligibility notes: {listing.eligibilityNote}</p><p>Limitations: {listing.limitationsNote}</p><p>{listing.disclosure}</p>
          {listing.referralDisclosure && <p>Referral disclosure: {listing.referralDisclosure}</p>}{listing.referralPermissionNote && <p>Permission note: {listing.referralPermissionNote}</p>}
          {listing.linkType === "PERSONAL_REFERRAL" ? <Link href="/opportunities/referral-demo" className="inline-link">Preview synthetic personal referral</Link> :
            <a href={listing.url} className="inline-link" rel="noreferrer">{listing.linkType === "PUBLIC_APPLICATION" ? "Open direct public application (external)" : "Open public information (external)"}</a>}
        </li>)}</ul>}
      </section>}
    <Link href="/dashboard" className="inline-link">Return to dashboard</Link>
  </article>;
}
