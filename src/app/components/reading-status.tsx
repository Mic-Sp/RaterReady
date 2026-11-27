export const learningIndependenceNote = "G1–G6 are RaterReady’s own evaluation skills, not an industry standard. RaterReady is independent and has no employer endorsement.";

/** Give compact lesson marks a non-color cue and an accessible status. */
export function ReadingStatus({ complete }: { complete: boolean }) {
  return <span className="reading-status" data-complete={complete}>
    <span aria-hidden="true">{complete ? "✓" : "○"}</span>
    <span className="sr-only">{complete ? "Reading complete" : "Reading not yet complete"}</span>
  </span>;
}
