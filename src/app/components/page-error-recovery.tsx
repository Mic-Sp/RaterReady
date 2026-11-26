"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";

/** Focus the recovery heading. Only static copy is rendered, even if a framework error contains request details. */
export function PageErrorRecovery({ retry }: { retry: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  return <section className="page-card public-auth-page" aria-labelledby="recovery-heading">
    <p className="eyebrow">RaterReady</p>
    <h1 id="recovery-heading" ref={heading} tabIndex={-1}>Something went wrong</h1>
    <p className="page-intro">This page could not finish loading. Try again, or return to RaterReady and check your progress there.</p>
    <div className="public-entry-links">
      <button type="button" className="primary-button" onClick={retry}>Try again</button>
      <Link className="secondary-button button-link" href="/" prefetch={false}>Return to RaterReady</Link>
    </div>
  </section>;
}
