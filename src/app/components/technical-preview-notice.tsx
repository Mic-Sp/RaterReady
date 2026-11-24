import { DemoBadge } from "./demo-badge";
/** Shared visible boundary on both catalog and workspace; preview scores never imply credential eligibility. */
export function TechnicalPreviewNotice() {
  return <aside className="demo-notice preview-notice" aria-labelledby="technical-boundary-heading">
    <h2 id="technical-boundary-heading">Technical Preview · non-credentialing</h2>
    <p><DemoBadge />: These optional exercises preview a future specialist track. They do not grant a Technical credential or alter Generalist Qualification Exam eligibility in the MVP.</p>
    <p>Scores are practice feedback only. No Generalist module progress is awarded. Compare the supplied code and hand traces; this preview does not execute code.</p>
  </aside>;
}
