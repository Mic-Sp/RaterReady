"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const sections = [
  { href: "/admin", name: "Review & Grading" },
  { href: "/admin/users", name: "Users & Access" },
  { href: "/admin/telemetry", name: "Site Telemetry" },
  { href: "/admin/audit", name: "Audit Log" },
];

/** Page links support deep links and standard keyboard navigation, marking the current control-panel view. */
export function ControlPanelNav() {
  const path = usePathname();
  const current = sections.find(({ href }) => href !== "/admin" && path.startsWith(href))?.href ?? "/admin";
  return <nav aria-label="Admin control panel" className="control-panel-nav">
    <ul role="list">{sections.map(({ href, name }) => <li key={href}>
      <Link href={href} prefetch={false} aria-current={current === href ? (path === href ? "page" : "location") : undefined}>{name}</Link>
    </li>)}</ul>
  </nav>;
}
