import type { Metadata } from "next";
import Link from "next/link";
import { optionalPageIdentity } from "../../server/auth/page-access";
import { ForgotPasswordForm } from "../components/account-link-forms";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Request password reset | RaterReady", referrer: "no-referrer" };

/** Public request page: account/sole-owner identity controls preview privileges, never the generic public confirmation. */
export default async function ForgotPasswordPage() {
  const viewer = await optionalPageIdentity();
  return <section className="page-card public-auth-page" aria-labelledby="forgot-heading">
    <p className="eyebrow">RaterReady · Closed Alpha</p><h1 id="forgot-heading">Reset your password</h1>
    <p className="page-intro">Request a one-time link for your live candidate account. Reset links expire after one hour.</p>
    <p>When outbound email is unavailable, a link preview is visible only to the signed-in account or Michael Sprague’s admin session. Signed-out testers can ask Michael for help; public confirmations never reveal whether an email is registered.</p>
    {viewer?.role === "ADMIN_REVIEWER" && viewer.accountCode === "admin-michael" && <p className="success-note">Owner preview access: enter the intended candidate’s email and share their one-time link privately.</p>}
    <ForgotPasswordForm />
    <p className="form-note"><Link href="/login">Return to sign in</Link></p>
  </section>;
}
