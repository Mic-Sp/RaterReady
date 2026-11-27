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
      <SignInForm hasError={Boolean(error)} />
      <div className="auth-secondary-links">
        <Link href="/forgot-password" className="inline-link">Forgot your password?</Link>
        <Link href="/register" className="inline-link">New here? Create a free learner account</Link>
      </div>
    </section>
  );
}
