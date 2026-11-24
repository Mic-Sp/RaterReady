import { SyntheticText } from "../components/demo-badge";
import Link from "next/link";
import type { FinalizedCapstoneResult } from "../../lib/capstone-results";
import { competencyResultGuidance } from "../../lib/capstone-results";
import { generalistPracticeCompetencies } from "../../lib/generalist-competencies";
import { reviewTimestamp } from "../../lib/review-presentation";
import { CandidateCredentials } from "../components/candidate-credentials";
import { CandidateAppeals } from "../appeals/candidate-appeals";

/** Finalized-only score display: public competency guidance has no secure capstone answers or reviewer/model details. */
export function FinalizedResult({ result, compact = false }: { result: FinalizedCapstoneResult; compact?: boolean }) {
  return <section className="learning-section" aria-labelledby="finalized-result-heading">
    <h2 id="finalized-result-heading">Finalized Generalist Qualification Exam result</h2>
    <p className="success-note" role="status"><strong><SyntheticText>{result.passed ? "Passed" : "Not yet passed"}</SyntheticText> · <SyntheticText>{result.finalScore.toFixed(2)}</SyntheticText> / 100</strong></p>
    <p>The passing standard is 85.00 / 100 after owner review and finalization.</p>
    {result.originalFinalScore != null && <p>Current score includes a resolved appeal adjustment. Original finalized score: <SyntheticText>{result.originalFinalScore.toFixed(2)}</SyntheticText> / 100. Original grading records remain preserved.</p>}
    <dl className="score-breakdown"><dt>Deterministic subtotal</dt><dd><SyntheticText>{result.deterministicScore.toFixed(2)}</SyntheticText> / 95</dd>
      <dt>Written justification score</dt><dd><SyntheticText>{result.writtenScore.toFixed(2)}</SyntheticText> / 5</dd><dt>Finalized total</dt><dd><SyntheticText>{result.finalScore.toFixed(2)}</SyntheticText> / 100</dd></dl>
    <p>Finalized: <time dateTime={result.finalizedAt}><SyntheticText>{reviewTimestamp(result.finalizedAt)}</SyntheticText></time></p>
    {!result.passed && result.retakeAvailableAfter && <p>Retake policy: cooldown ends <time dateTime={result.retakeAvailableAfter}><SyntheticText>{reviewTimestamp(result.retakeAvailableAfter)}</SyntheticText></time>. The server checks practice coverage and fresh form capacity before a retake can start.</p>}
    {compact ? <Link href={`/capstone/${result.attemptId}`} className="inline-link">View finalized result and competency guidance</Link> : <>
      <p><SyntheticText>{result.passed ? "You met the Generalist Qualification Exam standard. You can keep practicing any competency area." : "You can build on this attempt. Use the focused practice links below, then check the server-confirmed retake policy."}</SyntheticText></p>
      <section className="learning-section" aria-labelledby="result-guidance-heading"><h3 id="result-guidance-heading">Competency practice guidance</h3>
        <p>G1–G6 are RaterReady’s internal Generalist competency identifiers. These practice suggestions are not item-level Generalist Qualification Exam answer explanations.</p>
        <ul className="curriculum-list">{Object.entries(generalistPracticeCompetencies).map(([code, title]) => <li key={code}>
          <h3><SyntheticText>{code}</SyntheticText> · <SyntheticText rebrand>{title}</SyntheticText></h3><p><SyntheticText>{competencyResultGuidance[code as keyof typeof competencyResultGuidance]}</SyntheticText></p>
          <Link href={`/practice?competency=${code}`} className="inline-link">Practice <SyntheticText>{code}</SyntheticText>: <SyntheticText rebrand>{title}</SyntheticText></Link></li>)}</ul>
      </section>
      <Link href="/capstone" className="inline-link">Check retake eligibility and cooldown</Link>
      {result.credential && <CandidateCredentials records={[result.credential]} />}
      <CandidateAppeals attemptId={result.attemptId} appeals={result.appeals ?? []} />
    </>}
  </section>;
}
