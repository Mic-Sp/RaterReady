"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@prisma/client";

const candidateLinks = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/practice", label: "Practice" },
  { href: "/workflow-lab", label: "Workflow Lab" },
  { href: "/technical-preview", label: "Technical Preview" },
  { href: "/capstone", label: "Capstone" },
  { href: "/opportunities", label: "Opportunities" },
];

/** Role-specific links are presentation only; the active section follows client navigation, including nested routes. */
export function NavigationLinks({ role }: { role: Role }) {
  const pathname = usePathname();
  // Only the server-verified role chooses links. Hiding a link never replaces authorization.
  const links = role === "ADMIN_REVIEWER" ? [{ href: "/admin", label: "Reviewer Console" }] : candidateLinks;
  return <nav aria-label="Main navigation"><ul className="navigation-links">{links.map(({ href, label }) =>
    <li key={href}><Link href={href} aria-current={pathname === href ? "page" : pathname.startsWith(`${href}/`) ? "location" : undefined}>{label}</Link></li>
  )}</ul></nav>;
}
