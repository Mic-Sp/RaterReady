import type { listAdminOpportunities } from "../../server/opportunities/service";
import { externalOpportunityUrl, opportunityIndependenceLimits, opportunityLinkLabels } from "../../lib/opportunity-content";
import { DemoBadge, SyntheticText } from "../components/demo-badge";
import { StatusBadge } from "../components/status-badge";
import { OpportunityControls } from "./opportunity-controls";

type Listing = Awaited<ReturnType<typeof listAdminOpportunities>>[number];

function CurationListing({ listing, synthetic }: { listing: Listing; synthetic: boolean }) {
  const name = listing.title.replace(/^DEMO - SYNTHETIC:\s*/, "");
  const source = synthetic ? null : externalOpportunityUrl(listing.sourceUrl);
  const destination = synthetic ? null : externalOpportunityUrl(listing.url);
  return <li><details className="curation-listing">
    <summary>{synthetic && <span className="curation-example-band"><strong>Synthetic example</strong> <DemoBadge /></span>}
      <SyntheticText>{name}</SyntheticText> <StatusBadge tone={listing.active ? "success" : "pending"}>{listing.active ? "Active" : "Paused"}</StatusBadge>
    </summary>
    <div className="curation-listing-body">
      <p>Organization: <SyntheticText>{listing.organization}</SyntheticText> · {opportunityLinkLabels[listing.linkType]}</p>
      {destination && <a href={destination} rel="noreferrer" className="inline-link">Open listing destination (external)</a>}
      <p>Source: <SyntheticText>{listing.sourceLabel}</SyntheticText></p>
      {source ? <a href={source} rel="noreferrer" className="inline-link">Open attributed source (external)</a> : <p className="field-hint">Link pending verification</p>}
      <OpportunityControls code={listing.code} name={name} active={listing.active} verifiedAt={listing.lastVerifiedAt} synthetic={synthetic} />
    </div>
  </details></li>;
}

/** Present the owner-only listing projection as native disclosures with each listing’s own curation form. */
export function OpportunityCuration({ listings }: { listings: Listing[] }) {
  // The seeded public links use synthetic records too, so classify by referral type instead of the record's demo flag.
  const external = listings.filter((listing) => listing.linkType !== "PERSONAL_REFERRAL");
  const examples = listings.filter((listing) => listing.linkType === "PERSONAL_REFERRAL");
  return <section id="opportunity-curation" className="learning-section" aria-labelledby="admin-opportunities-heading" tabIndex={-1}>
    <h2 id="admin-opportunities-heading">Opportunity curation</h2>
    <p className="opportunity-about">RaterReady curates these links independently and has no formal partnerships with these companies. {opportunityIndependenceLimits}</p>
    {([{ title: "External listings", rows: external, synthetic: false }, { title: "Synthetic examples", rows: examples, synthetic: true }]).map(({ title, rows, synthetic }) => (
      <section key={title} className="curation-group" aria-label={title}>
        <h3>{title}</h3>
        {rows.length ? <ul className="curation-list" role="list">{rows.map((listing) => <CurationListing key={listing.code} listing={listing} synthetic={synthetic} />)}</ul>
          : <p>{synthetic ? "No synthetic examples." : "No external listings."}</p>}
      </section>
    ))}
  </section>;
}
