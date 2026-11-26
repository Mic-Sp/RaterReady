import { SyntheticText } from "../../components/demo-badge";
import type { Metadata } from "next";
import { prisma } from "../../../lib/prisma";
import { getPublicCredential } from "../../../server/credentials/service";
import { CredentialDisclosures } from "../../components/credential-disclosures";
import { PublicEntryLinks } from "../../components/public-entry-links";
import { reviewTimestamp } from "../../../lib/review-presentation";

export const metadata: Metadata = { title: "Credential verification | RaterReady", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Public, uncached evidence-only verification. All unavailable cases render this same
 * generic 200 state with no reflected code or private identity, preventing existence enumeration.
 * Consent/lifecycle changes are checked on every request; there are no authenticated-name fallbacks.
 */
export default async function CredentialVerificationPage({ params }: { params: Promise<{ credentialCode: string }> }) {
  const { credentialCode } = await params;
  const credential = await getPublicCredential(prisma, credentialCode);
  return <article className={`page-card learning-page verification-certificate${credential ? " certificate-available" : ""}`} aria-labelledby="verification-heading">
    <p className="eyebrow">RaterReady · Public verification</p><h1 id="verification-heading"><SyntheticText>{credential ? "RaterReady Generalist credential" : "Credential unavailable"}</SyntheticText></h1>
    <CredentialDisclosures />
    {credential ? <section className="learning-section" aria-labelledby="verified-evidence-heading"><h2 id="verified-evidence-heading">Verified Generalist Qualification Exam evidence</h2>
      <p className="success-note">Active · Public sharing enabled</p>
      <p>The owner reviewed and finalized a passing result on RaterReady’s internal competency assessment.</p>
      {/* Only the consent-filtered public DTO enters these metadata rows; no identity, score or review fallback is introduced. */}
      <dl className="certificate-metadata">
        <div><dt>Credential code</dt><dd><SyntheticText>{credential.credentialCode}</SyntheticText></dd></div>
        <div><dt>Track</dt><dd>RaterReady Generalist</dd></div>
        <div><dt>Covered competencies</dt><dd><SyntheticText>{credential.competencies.join(" · ")}</SyntheticText></dd></div>
        <div><dt>Blueprint version</dt><dd>{credential.blueprintVersion}</dd></div>
        <div><dt>Scoring policy version</dt><dd>{credential.scoringPolicyVersion}</dd></div>
        <div><dt>Issued</dt><dd><time dateTime={credential.issuedAt}><SyntheticText>{reviewTimestamp(credential.issuedAt)}</SyntheticText></time></dd></div>
      </dl>
      <p>Sharing includes assessment metadata only. Candidate names, assessment responses, and private review details are not published.</p>
    </section> : <p>This credential is unavailable for public verification. A code may be unknown, sharing may have been withdrawn, or a credential may be suspended or revoked.</p>}
    <section className="learning-section" aria-labelledby="verification-learn-heading">
      <h2 id="verification-learn-heading">Learn with RaterReady</h2>
      <p>Free AI evaluation training for justice-impacted and nontraditional talent. Register for a live Closed Alpha account or sign in with an existing learner or demonstration account.</p>
      <PublicEntryLinks />
    </section>
  </article>;
}
