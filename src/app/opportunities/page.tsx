import { DemoBadge, SyntheticText } from "../components/demo-badge";
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
  return <article className="page-card learning-page" aria-labelledby="opportunity-heading"><p className="eyebrow"><DemoBadge /> · Independent curation</p><h1 id="opportunity-heading">Curated remote opportunity queue</h1>
    <aside className="demo-notice" aria-label="Platform independence disclosure"><p><SyntheticText>{opportunityIndependenceNotice}</SyntheticText></p></aside>
    {!view.unlocked ? <section className="learning-section" aria-labelledby="queue-lock-heading"><h2 id="queue-lock-heading">Opportunity queue locked</h2>
      <p><SyntheticText>{view.reason === "ACTIVE_CREDENTIAL_REQUIRED" ? "A finalized passing score is recorded, but an active credential is required. Suspended or revoked credentials do not unlock this queue."
        : "Access requires a finalized Generalist Qualification Exam score of at least 85.00 / 100 and an active credential from that same attempt."}</SyntheticText></p>
      <p>Public credential sharing is optional and does not affect this gate.</p><Link href="/capstone" className="inline-link">Check Generalist Qualification Exam status</Link></section> :
      <section className="learning-section" aria-labelledby="available-listings-heading"><h2 id="available-listings-heading">Available curated listings</h2>
        <p><DemoBadge />: representative links and fictional referral examples, not reserved vacancies or placement offers. Check each source’s current terms independently.</p>
        {!view.listings.length ? <p>No active listings are currently available. Owner curation may resume later.</p> : <ul className="practice-catalog">{view.listings.map((listing) => <li key={listing.code}>
          <h3><SyntheticText rebrand>{listing.title}</SyntheticText></h3><p>Organization: <SyntheticText>{listing.organization}</SyntheticText></p><p>Link type: <SyntheticText>{opportunityLinkLabels[listing.linkType]}</SyntheticText></p>
          <p>Source attribution: <SyntheticText>{listing.sourceLabel}</SyntheticText></p>
          {listing.linkType === "PERSONAL_REFERRAL" ? <p>Source reference: <SyntheticText>{listing.sourceUrl}</SyntheticText> (reserved synthetic example address)</p> : <a className="inline-link" href={listing.sourceUrl} rel="noreferrer">Inspect attributed public source</a>}
          <p>Last verified: <time dateTime={listing.lastVerifiedAt}><SyntheticText>{reviewTimestamp(listing.lastVerifiedAt)}</SyntheticText></time><SyntheticText>{listing.linkType === "PERSONAL_REFERRAL" && " · synthetic fixture validation only, not a live referral check"}</SyntheticText></p>
          <p>Eligibility notes: <SyntheticText>{listing.eligibilityNote}</SyntheticText></p><p>Limitations: <SyntheticText>{listing.limitationsNote}</SyntheticText></p><p><SyntheticText>{listing.disclosure}</SyntheticText></p>
          {listing.referralDisclosure && <p>Referral disclosure: <SyntheticText>{listing.referralDisclosure}</SyntheticText></p>}{listing.referralPermissionNote && <p>Permission note: <SyntheticText>{listing.referralPermissionNote}</SyntheticText></p>}
          {listing.linkType === "PERSONAL_REFERRAL" ? <Link href="/opportunities/referral-demo" className="inline-link">Preview synthetic personal referral</Link> :
            <a href={listing.url} className="inline-link" rel="noreferrer"><SyntheticText>{listing.linkType === "PUBLIC_APPLICATION" ? "Open direct public application (external)" : "Open public information (external)"}</SyntheticText></a>}
        </li>)}</ul>}
      </section>}
    <Link href="/dashboard" className="inline-link">Return to dashboard</Link>
  </article>;
}
