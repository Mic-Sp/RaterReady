import { Fragment } from "react";
import { qualificationExamText } from "../../lib/assessment-presentation";

/** A non-interactive, text-labeled amber pill marks synthetic content without adding live announcements or changing reading order. */
export function DemoBadge() {
  return <span className="demo-badge" data-synthetic-badge="true">DEMO - SYNTHETIC</span>;
}

/** Style every embedded demo marker as escaped React text; rebranding is opt-in for product/fixture copy, never candidate prose or code. */
export function SyntheticText({ children, rebrand = false }: { children: string | null | undefined | false; rebrand?: boolean }) {
  if (typeof children !== "string") return null;
  const text = rebrand ? qualificationExamText(children) : children;
  return text.split("DEMO - SYNTHETIC").map((part, index) => <Fragment key={index}>{index > 0 && <DemoBadge />}{part}</Fragment>);
}
