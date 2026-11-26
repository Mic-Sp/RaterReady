import type { Metadata } from "next";
import Link from "next/link";
import { missingPage } from "../lib/page-not-found";

export const metadata: Metadata = { title: `${missingPage.title} | RaterReady`, robots: { index: false, follow: false } };

/** Public-safe 404. Never reflect the requested URL, token, or reason a protected resource was unavailable. */
export default function NotFoundPage() {
  return <section className="page-card public-auth-page" aria-labelledby="missing-heading">
    <p className="eyebrow">RaterReady · 404</p>
    <h1 id="missing-heading">{missingPage.title}</h1>
    <p className="page-intro">{missingPage.message}</p>
    <Link className="primary-button button-link" href="/">{missingPage.action}</Link>
  </section>;
}
