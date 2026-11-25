import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { roleLandingPath } from "../../lib/role-routing";
import { optionalPageIdentity } from "../../server/auth/page-access";
import { SignInForm } from "./sign-in-form";
import Link from "next/link";

export const metadata: Metadata = { title: "Sign in | RaterReady" };

/** Public sign-in screen; existing sessions are revalidated and routed by their database role. */
export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string | string[] }> }) {
  const user = await optionalPageIdentity();
  if (user) redirect(roleLandingPath(user.role));
  const { error } = await searchParams;
  return (
    <section className="page-card" aria-labelledby="sign-in-heading">
      <p className="eyebrow">Your RaterReady account</p>
      <h1 id="sign-in-heading">Welcome back.</h1>
      <p className="page-intro">Sign in with your email address or demonstration account identifier.</p>
      <SignInForm hasError={Boolean(error)} />
      <p className="form-note">New to RaterReady? <Link href="/register">Create a candidate account</Link></p>
    </section>
  );
}
