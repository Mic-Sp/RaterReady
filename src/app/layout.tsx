import { AccountBanner } from "./components/account-banner";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { optionalPageIdentity } from "../server/auth/page-access";
import { AuthenticatedNavigation } from "./components/authenticated-navigation";
import { LearningActivity } from "./components/learning-activity";
import "./globals.css";

export const metadata: Metadata = { title: "RaterReady", description: "Independent AI evaluation training in early access, with labeled synthetic demonstrations.", robots: { index: false, follow: false } };

/** Render the shared shell using verified identity; every protected page keeps its own authorization guard. */
export default async function RootLayout({ children }: { children: ReactNode }) {
  const user = await optionalPageIdentity();
  const operator = user?.role === "ADMIN_REVIEWER";
  return (
    <html lang="en">
      <body>
        <a href="#main-content" className="skip-link">Skip to main content</a>
        <div className={`app-shell${user ? " authenticated-shell max-w-6xl" : ""}${operator ? " operator-shell" : ""}`}>
          <header className="site-header">
            <div className="navigation-chrome">
              <div className="brand-lockup">
                <Link href="/" className="brand" aria-label="RaterReady home">
                  <span className="brand-mark" aria-hidden="true"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" focusable="false"><path d="M7 18V6h5a4 4 0 0 1 0 8H7m5 0 5 4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
                  RaterReady
                </Link>
                {!user && <span className="role-badge">Closed Alpha</span>}
                {operator && <span className="operator-mode">Operator Console</span>}
              </div>
              {user && <AuthenticatedNavigation user={user} />}
            </div>
            <AccountBanner user={user} />
          </header>
          <main id="main-content" tabIndex={-1}>{children}</main>
          {user?.role === "CANDIDATE" && <LearningActivity />}
          <footer className="site-footer">{operator ? "RaterReady · Reviewer operations" : "RaterReady · Free, independent AI evaluation training"}</footer>
        </div>
      </body>
    </html>
  );
}
