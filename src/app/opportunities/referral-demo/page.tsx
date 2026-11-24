import { SyntheticText } from "../../components/demo-badge";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageRole } from "../../../server/auth/page-access";
import { prisma } from "../../../lib/prisma";
import { getCandidateOpportunities } from "../../../server/opportunities/service";
import { opportunityIndependenceNotice } from "../../../lib/opportunity-content";

/** A guessed referral URL repeats the gate; the Stage A preview never sends an application, referral token or personal data externally. */
export default async function ReferralDemoPage() {
  await requirePageRole("CANDIDATE");
  const view = await getCandidateOpportunities(prisma);
  const listing = view.listings.find((l) => l.code === "demo-permitted-personal-referral");
  if (view.unlocked && !listing) notFound();
  return <article className="page-card learning-page" aria-labelledby="referral-heading"><h1 id="referral-heading"><SyntheticText>{view.unlocked ? "DEMO - SYNTHETIC: Personal referral preview" : "Opportunity queue locked"}</SyntheticText></h1>
    {listing ? <><p><SyntheticText>{listing.sourceLabel}</SyntheticText></p><p><SyntheticText>{listing.referralPermissionNote}</SyntheticText></p><p><SyntheticText>{listing.referralDisclosure}</SyntheticText></p>
      <p>No live employer application, personal referral permission, paid referral benefit or preferential hiring is represented by this synthetic example.</p></>
      : <p>A finalized Generalist score of at least 85 and an active credential are required before accessing opportunity or referral details.</p>}
    <p className="demo-notice"><SyntheticText>{opportunityIndependenceNotice}</SyntheticText></p><Link href="/opportunities" className="inline-link">Return to opportunity queue</Link>
  </article>;
}
