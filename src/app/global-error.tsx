"use client";

import { PageErrorRecovery } from "./components/page-error-recovery";
import "./globals.css";

/** Root-layout recovery has its own document and never depends on identity, environment, database data, or error details. */
export default function GlobalError({ retry }: { error: Error; retry: () => void }) {
  return <html lang="en">
    <head><title>Page unavailable | RaterReady</title><meta name="robots" content="noindex, nofollow" /></head>
    <body><main className="app-shell"><PageErrorRecovery retry={retry} /></main></body>
  </html>;
}
