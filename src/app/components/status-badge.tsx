import type { ReactNode } from "react";

/** Static text-bearing status; color is supplementary and live announcements remain with the existing authoritative status regions. */
export function StatusBadge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "success" | "pending" }) {
  return <span className={`status-badge status-${tone}`}>{children}</span>;
}
