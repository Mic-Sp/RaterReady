import Link from "next/link";
import type { ReactNode } from "react";
import { SyntheticText } from "./demo-badge";

/** Metadata → plain heading → summary → footer. One CTA uses its heading as accessible context, avoiding underlined paragraphs and nested links. */
export function LearningCard({ headingId, headingLevel = 2, title, metadata, summary, detail, href, action = "Open scenario" }: {
  headingId: string; headingLevel?: 2 | 3; title: string; metadata: ReactNode; summary: ReactNode; detail?: ReactNode; href: string; action?: string;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return <article className="learning-card" aria-labelledby={headingId}>
    <div className="learning-card-meta">{metadata}</div>
    <Heading id={headingId}><SyntheticText rebrand>{title}</SyntheticText></Heading>
    <div className="learning-card-summary">{summary}</div>
    {detail && <p className="learning-card-detail">{detail}</p>}
    <footer className="learning-card-footer"><Link href={href} className="secondary-button button-link" aria-describedby={headingId}>{action}<span aria-hidden="true"> →</span></Link></footer>
  </article>;
}
