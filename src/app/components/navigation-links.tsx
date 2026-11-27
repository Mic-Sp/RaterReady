"use client";

import { SyntheticText } from "./demo-badge";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@prisma/client";

const candidateLinks = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/learn", label: "Learn" },
  { href: "/practice", label: "Practice" },
  { href: "/capstone", label: "Exam" },
  { href: "/opportunities", label: "Opportunities" },
];

const exploreLinks = [
  { href: "/workflow-lab", label: "Workflow Lab" },
  { href: "/technical-preview", label: "Technical Preview" },
];

/** Role-specific links are presentation only; the active section follows client navigation, including nested routes. */
export function NavigationLinks({ role }: { role: Role }) {
  const pathname = usePathname();
  // Only the server-verified role chooses links. Hiding a link never replaces authorization.
  const isCandidate = role === "CANDIDATE";
  const links = isCandidate ? candidateLinks : [{ href: "/admin", label: "Reviewer Console" }];
  const current = (href: string) => pathname === href ? "page" : pathname.startsWith(`${href}/`) ? "location" : undefined;
  const renderLinks = (items: typeof candidateLinks) => items.map(({ href, label }) => (
    <li key={href}><Link href={href} aria-current={current(href)}><SyntheticText>{label}</SyntheticText></Link></li>
  ));
  const exploring = exploreLinks.some(({ href }) => current(href));
  return <nav aria-label="Main navigation" className={isCandidate ? "candidate-nav" : undefined}>
    <ul className="navigation-links">{renderLinks(links)}</ul>
    {isCandidate && <details className="navigation-explore" open={exploring || undefined}>
      <summary>Explore</summary>
      <ul className="navigation-links" aria-label="Optional tools">{renderLinks(exploreLinks)}</ul>
    </details>}
  </nav>;
}
