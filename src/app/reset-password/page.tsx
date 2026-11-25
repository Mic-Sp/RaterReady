import type { Metadata } from "next";
import Link from "next/link";
import { CompleteAccountLinkForm } from "../components/account-link-forms";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Set a new password | RaterReady", referrer: "no-referrer" };

/** Public token-capability form; GET/prefetch is inert and never reveals the recipient or consumes a link. */
export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const { notice } = await searchParams;
  return <section className="page-card public-auth-page" aria-labelledby="reset-heading">
    <p className="eyebrow">RaterReady · Closed Alpha</p><h1 id="reset-heading">Set a new password</h1>
    {notice === "complete" ? <p role="status">Your password has been updated. All previous sessions and older account links are revoked. Sign in with your new password.</p>
      : <><p className="page-intro">Use your single-use reset link within one hour. Your email verification status stays unchanged.</p><CompleteAccountLinkForm purpose="PASSWORD_RESET" /></>}
    <p className="form-note"><Link href="/login">Sign in</Link> · <Link href="/forgot-password">Request a new reset link</Link></p>
  </section>;
}
