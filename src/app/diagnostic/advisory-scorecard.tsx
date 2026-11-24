import Link from "next/link";
import type { DiagnosticFeedback } from "../../server/domain/diagnostic";
import { learningLevels } from "../../lib/learning-content";
import { advisoryLevelDescriptions, diagnosticScorecardItems } from "../../lib/diagnostic-scorecard";
import { DemoBadge, SyntheticText } from "../components/demo-badge";

/** Server-rendered advisory regions keep summary, six G-area cards and truthfulness disclosures in the same reading order at every width. */
export function AdvisoryScorecard({ feedback }: { feedback: DiagnosticFeedback }) {
  const level = learningLevels.find((item) => item.code === feedback.suggestedLevel);
  const items = diagnosticScorecardItems(feedback);
  return <section className="learning-section advisory-scorecard" aria-labelledby="feedback-heading">
    <h2 id="feedback-heading">Your advisory learning snapshot</h2>
    <p role="status">Skills check complete. Here are a few places to build on what you tried.</p>
    <section className="advisory-summary" aria-labelledby="suggested-level-heading">
      <div>
        <h3 id="suggested-level-heading">Suggested Starting Level</h3>
        <p className="advisory-level">{level?.title ?? "Choose any starting level"}</p>
        <p>{feedback.suggestedLevel ? advisoryLevelDescriptions[feedback.suggestedLevel] : "No starting level is suggested without an answered sample. You can choose whichever level feels useful."}</p>
        <p>This is a starting point, not a fixed placement. You can choose any level and switch anytime. Completed learning stays saved.</p>
        <p className="advisory-sample-note">Based on {feedback.answeredCount} of 6 optional responses. A short sample is not proof of mastery.</p>
      </div>
      {/* Native fragment navigation moves keyboard focus to the level heading as well as scrolling. */}
      <a href="#choose-level-heading" className="primary-button button-link">Choose your starting level</a>
    </section>
    {/* One status label per card provides a non-color signal; missing samples explicitly explain the absence of evidence. */}
    <div className="advisory-grid">{items.map((item) => <section key={item.competency} className="advisory-signal-card" data-competency={item.competency}
      aria-labelledby={`signal-${item.competency}-code signal-${item.competency}-heading`}>
      <header>
        <p className="advisory-competency-code" id={`signal-${item.competency}-code`}>{item.competency}</p>
        <h3 id={`signal-${item.competency}-heading`}>{item.title}</h3>
        <span className={`advisory-signal-badge signal-${item.status}`} data-signal={item.status}>{item.statusLabel}</span>
      </header>
      <p className="advisory-signal-context">{item.sampled ? "In this short sample" : "Not sampled · this optional item was left unanswered"}</p>
      <p><SyntheticText>{item.message}</SyntheticText></p>
      <div className="advisory-card-action"><Link href={`/practice?competency=${item.competency}`} className="secondary-button button-link">Practice {item.competency}</Link></div>
    </section>)}</div>
    {/* Disclosures remain visible together, rather than repeated in each card or hidden behind a disclosure control. */}
    <aside className="advisory-disclosures" aria-label="Non-certifying advisory feedback">
      <p><DemoBadge /> <strong>Optional, untimed and non-certifying.</strong> This check never grants a credential or a pass/fail result.</p>
      <p>It never waives the 85% passing standard for a finalized Generalist Qualification Exam after owner review, and does not establish exam readiness.</p>
      <p>G1–G6 are RaterReady’s internal Generalist competency identifiers, not an external industry standard.</p>
    </aside>
  </section>;
}
