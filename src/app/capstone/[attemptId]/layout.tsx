import type { ReactNode } from "react";

/** Wide A/B desktop canvas shares practice styling; mobile remains sequential with equivalent controls. */
export default function CapstoneExamLayout({ children }: { children: ReactNode }) {
  return <div className="practice-layout">{children}</div>;
}
