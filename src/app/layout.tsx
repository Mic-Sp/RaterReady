import type { ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = { title: "RaterReady", description: "Independent AI evaluation training. DEMO - SYNTHETIC accounts only.", robots: { index: false, follow: false } };

/** Shared accessible document shell; the synthetic-only notice persists across every UI route. */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a href="#main-content" className="skip-link">Skip to main content</a>
        <div className="app-shell">
          <header className="site-header">
            <Link href="/" className="brand" aria-label="RaterReady home">
              <span className="brand-mark" aria-hidden="true"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" focusable="false"><path d="M7 18V6h5a4 4 0 0 1 0 8H7m5 0 5 4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
              RaterReady
            </Link>
            <p className="brand-description">Independent AI evaluation training</p>
            <aside className="demo-notice" aria-label="Synthetic demonstration access">
              <p className="notice-label">DEMO - SYNTHETIC</p>
              <p>Training and reviewer access use synthetic demonstration accounts. Shared pilot credentials may be verified publicly.</p>
            </aside>
          </header>
          <main id="main-content" tabIndex={-1}>{children}</main>
          <footer className="site-footer"><p>Build judgment. Practice with purpose.</p><p>RaterReady · Free learning, independent evaluation.</p></footer>
        </div>
      </body>
    </html>
  );
}
