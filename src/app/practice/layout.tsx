import type { ReactNode } from "react";

/** Route marker widens only practice pages; A/B reading order stays sequential in the DOM. */
export default function PracticeLayout({ children }: { children: ReactNode }) {
  return <div className="practice-layout">{children}</div>;
}
