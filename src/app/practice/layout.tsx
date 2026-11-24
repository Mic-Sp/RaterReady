import type { ReactNode } from "react";

/** Practice route wrapper preserves DOM reading order; only comparison workspaces receive the 80rem canvas. */
export default function PracticeLayout({ children }: { children: ReactNode }) {
  return <div className="practice-layout">{children}</div>;
}
