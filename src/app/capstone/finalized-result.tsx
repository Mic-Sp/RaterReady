import Link from "next/link";
import type { FinalizedCapstoneResult } from "../../lib/capstone-results";
import { competencyResultGuidance } from "../../lib/capstone-results";
import { generalistPracticeCompetencies } from "../../lib/generalist-competencies";
import { reviewTimestamp } from "../../lib/review-presentation";
import { CandidateCredentials } from "../components/candidate-credentials";

/** Finalized-only score display: public competency guidance has no secure capstone answers or reviewer/model details. */
export function FinalizedResult({ result, compact = false }: { result: FinalizedCapstoneResult; compact?: boolean }) {
  return <section className="learning-section" aria-labelledby="finalized-result-heading">
    <h2 id="finalized-result-heading">Finalized capstone result</h2>
    <p className="success-note" role="status"><strong>{result.passed ? "Passed" : "Not yet passed"} · {result.finalScore.toFixed(2)} / 100</strong></p>
    <p>The passing standard is 85.00 / 100 after owner review and finalization.</p>
    <dl className="score-breakdown"><dt>Deterministic subtotal</dt><dd>{result.deterministicScore.toFixed(2)} / 95</dd>
      <dt>Written justification score</dt><dd>{result.writtenScore.toFixed(2)} / 5</dd><dt>Finalized total</dt><dd>{result.finalScore.toFixed(2)} / 100</dd></dl>
    <p>Finalized: <time dateTime={result.finalizedAt}>{reviewTimestamp(result.finalizedAt)}</time></p>
    {!result.passed && result.retakeAvailableAfter && <p>Retake policy: cooldown ends <time dateTime={result.retakeAvailableAfter}>{reviewTimestamp(result.retakeAvailableAfter)}</time>. The server checks practice coverage and fresh form capacity before a retake can start.</p>}
    {compact ? <Link href={`/capstone/${result.attemptId}`} className="inline-link">View finalized result and competency guidance</Link> : <>
      <p>{result.passed ? "You met the Generalist capstone standard. You can keep practicing any competency area." : "You can build on this attempt. Use the focused practice links below, then check the server-confirmed retake policy."}</p>
      <section className="learning-section" aria-labelledby="result-guidance-heading"><h3 id="result-guidance-heading">Competency practice guidance</h3>
        <p>G1–G6 are RaterReady’s internal Generalist competency identifiers. These practice suggestions are not item-level capstone answer explanations.</p>
        <ul className="curriculum-list">{Object.entries(generalistPracticeCompetencies).map(([code, title]) => <li key={code}>
          <h3>{code} · {title}</h3><p>{competencyResultGuidance[code as keyof typeof competencyResultGuidance]}</p>
          <Link href={`/practice?competency=${code}`} className="inline-link">Practice {code}: {title}</Link></li>)}</ul>
      </section>
      <Link href="/capstone" className="inline-link">Check retake eligibility and cooldown</Link>
      {result.credential && <CandidateCredentials records={[result.credential]} />}
    </>}
  </section>;
}
