import type { Metadata } from "next";
import Link from "next/link";
import { optionalPageIdentity } from "../../server/auth/page-access";
import { CompleteAccountLinkForm, VerificationRequestForm } from "../components/account-link-forms";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Verify email | RaterReady", referrer: "no-referrer" };

/** Public bearer-code completion; requesting a link is separately protected by a fresh candidate guard. GET never consumes a code. */
export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const viewer = await optionalPageIdentity();
  const { notice } = await searchParams;
  return <section className="page-card public-auth-page" aria-labelledby="verify-email-heading">
    <p className="eyebrow">RaterReady · Closed Alpha</p><h1 id="verify-email-heading">Verify your email</h1>
    {notice === "verified" ? <p role="status">Email verification complete. Your previous sessions have been revoked. Sign in again to continue with the updated account status.</p> : <>
      <p className="page-intro">Use your single-use verification link within 24 hours. Learning and untimed practice remain open while verification is pending.</p>
      {viewer?.role === "CANDIDATE" && !viewer.isSyntheticFixture && !viewer.emailVerifiedAt && <VerificationRequestForm />}
      {viewer?.emailVerifiedAt && <p>Your account is already marked verified.</p>}
      {!viewer && <p>Sign in to request a verification link. If you already have a link, enter its code below.</p>}
      <CompleteAccountLinkForm purpose="EMAIL_VERIFICATION" />
    </>}
    <p className="form-note"><Link href="/login">Sign in</Link> · <Link href="/dashboard">Return to dashboard</Link></p>
  </section>;
}
