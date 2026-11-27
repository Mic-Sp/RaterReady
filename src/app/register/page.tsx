import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { optionalPageIdentity } from "../../server/auth/page-access";
import { roleLandingPath } from "../../lib/role-routing";
import { RegistrationForm } from "./registration-form";

export const metadata: Metadata = { title: "Create a learner account | RaterReady" };

/** Public candidate registration; signed-in users return to their server-selected role destination. */
export default async function RegistrationPage() {
  const user = await optionalPageIdentity();
  if (user) redirect(roleLandingPath(user.role));
  return <section className="page-card registration-page public-auth-page" aria-labelledby="registration-heading">
    <h1 id="registration-heading">Create your learner account</h1>
    <p className="page-intro">Start learning and practicing for free. You can get started before verifying your email.</p>
    <RegistrationForm />
    <div className="auth-secondary-links"><Link href="/login" className="inline-link">Already have an account? Sign in</Link></div>
  </section>;
}
