import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { roleLandingPath } from "../../lib/role-routing";
import { optionalPageIdentity } from "../../server/auth/page-access";
import { SignInForm } from "./sign-in-form";
import Link from "next/link";
import { REGISTRATION_SIGN_IN_NOTICE } from "./form-state";

export const metadata: Metadata = { title: "Sign in | RaterReady" };

/** Public sign-in screen; existing sessions are revalidated and routed by their database role. */
export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string | string[]; notice?: string | string[] }> }) {
  const user = await optionalPageIdentity();
  if (user) redirect(roleLandingPath(user.role));
  const { error, notice } = await searchParams;
  return (
    <section className="page-card public-auth-page" aria-labelledby="sign-in-heading">
      <p className="eyebrow">Your RaterReady account</p>
      <h1 id="sign-in-heading">Welcome back.</h1>
      {notice === "registration-sign-in" && <p className="registration-sign-in-notice" role="status" aria-label="Registration sign-in notice">{REGISTRATION_SIGN_IN_NOTICE}</p>}
      <section className="registration-cta" aria-labelledby="registration-cta-heading">
        <h2 id="registration-cta-heading">New to RaterReady?</h2>
        <p>Create your free candidate account and start learning.</p>
        <Link href="/register" className="primary-button button-link">Create a candidate account</Link>
      </section>
      <p className="page-intro">Sign in with your email address or demonstration account identifier.</p>
      <SignInForm hasError={Boolean(error)} />
      <p className="form-note"><Link href="/forgot-password">Forgot your password?</Link></p>
    </section>
  );
}
