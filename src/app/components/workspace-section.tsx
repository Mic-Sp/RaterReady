import type { ReactNode } from "react";

/** Named cards create explicit task/evidence/rubric boundaries without changing DOM order, focus, or disclosure behavior. */
export function WorkspaceSection({ headingId, title, kind, children }: { headingId: string; title: string; kind: "task" | "evidence" | "rubric"; children: ReactNode }) {
  return <section className={`workspace-card workspace-${kind}`} aria-labelledby={headingId} data-workspace-section={kind}>
    <header className="workspace-card-header"><h2 id={headingId}>{title}</h2></header>
    <div className="workspace-card-content">{children}</div>
  </section>;
}
