import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { optionalPageIdentity } from "../../server/auth/page-access";
import { roleLandingPath } from "../../lib/role-routing";
import { RegistrationForm } from "./registration-form";

export const metadata: Metadata = { title: "Create a candidate account | RaterReady" };

/** Public candidate registration; signed-in users return to their server-selected role destination. */
export default async function RegistrationPage() {
  const user = await optionalPageIdentity();
  if (user) redirect(roleLandingPath(user.role));
  return <section className="page-card registration-page public-auth-page" aria-labelledby="registration-heading">
    <p className="eyebrow">RaterReady · Closed Alpha</p>
    <h1 id="registration-heading">Create your candidate account</h1>
    <p className="page-intro">Learn at your own pace. RaterReady is free for individual learners and reentry/workforce development partners. You can begin learning while email verification is pending.</p>
    <RegistrationForm />
    <p className="form-note"><Link href="/login">Already have an account? Sign in</Link></p>
  </section>;
}
