import type { Metadata } from "next";
import { prisma } from "../../../lib/prisma";
import { generalistPracticeCompetencies } from "../../../lib/generalist-competencies";
import { getSiteTelemetry } from "../../../server/admin/telemetry";
import { requirePageRole } from "../../../server/auth/page-access";
import { DemoBadge } from "../../components/demo-badge";

export const metadata: Metadata = { title: "Closed-Alpha Site Telemetry | RaterReady" };

type Cohort = Awaited<ReturnType<typeof getSiteTelemetry>>["live"];
const milestones = [
  ["Registered", "registered"], ["Email verified", "verified"], ["Started lessons", "lessonStarted"],
  ["Completed 6/6 practice", "practiceComplete"], ["Started exam", "examStarted"], ["Passed (85%+)", "passed"],
] as const;
const format = (value: number | null) => value === null ? "—" : `${value}%`;
const rate = (part: number, total: number) => total ? `${Math.round(part / total * 1000) / 10}% (${part}/${total})` : "No judge runs";

function CohortTelemetry({ data, demo }: { data: Cohort; demo: boolean }) {
  const id = demo ? "demo-telemetry" : "live-telemetry";
  return <section className="learning-section telemetry-cohort" aria-labelledby={id}>
    <h2 id={id}>{demo ? "Synthetic Demo learners" : "Live Closed Alpha learners"}</h2>
    {demo && <DemoBadge />}
    <h3>Account funnel</h3>
    <dl className="telemetry-milestones">{milestones.map(([label, field]) => <div key={field}><dt>{label}</dt><dd>{data[field]}</dd></div>)}</dl>
    <h3>Operational health</h3>
    <dl className="telemetry-milestones">
      <div><dt>Active learners, last 24 hours</dt><dd>{data.active24h}</dd></div>
      <div><dt>Active learners, last 7 days</dt><dd>{data.active7d}</dd></div>
      <div><dt>Exams finalized, last 7 days</dt><dd>{data.examCompletions}</dd></div>
      <div><dt>Backup judge rate, last 7 days</dt><dd>{rate(data.backupVotes, data.judgeReceipts)}</dd></div>
      <div><dt>Judge timeout rate, last 7 days</dt><dd>{rate(data.timeouts, data.judgeReceipts)}</dd></div>
    </dl>
    <table className="control-panel-table" role="table">
      <caption>Competency performance</caption>
      <thead role="rowgroup"><tr role="row">
        <th scope="col" role="columnheader">Skill area</th>
        <th scope="col" role="columnheader">Practice submissions</th>
        <th scope="col" role="columnheader">Average practice score</th>
        <th scope="col" role="columnheader">Average exam score</th>
      </tr></thead>
      <tbody role="rowgroup">{data.skills.map((skill) => <tr role="row" key={skill.code}>
        <th scope="row" role="rowheader">{skill.code} · {generalistPracticeCompetencies[skill.code]}</th>
        <td role="cell"><span className="mobile-cell-label" aria-hidden="true">Practice submissions</span>{skill.practiceSubmissions}</td>
        <td role="cell"><span className="mobile-cell-label" aria-hidden="true">Average practice score</span>{format(skill.practiceAverage)}{skill.practiceScored > 0 && <small> ({skill.practiceScored} scored)</small>}</td>
        <td role="cell"><span className="mobile-cell-label" aria-hidden="true">Average exam score</span>{format(skill.examAverage)}{skill.examScored > 0 && <small> ({skill.examScored} scored)</small>}</td>
      </tr>)}</tbody>
    </table>
  </section>;
}

/** Owner-only view of aggregated candidate engagement and finalized competency scores. */
export default async function TelemetryPage() {
  await requirePageRole("ADMIN_REVIEWER");
  const view = await getSiteTelemetry(prisma);
  return <article className="page-card learning-page reviewer-layout" aria-labelledby="site-telemetry-heading">
    <h1 id="site-telemetry-heading">Closed-Alpha Site Telemetry</h1>
    <p className="page-intro">Each funnel count shows learners who reached that milestone. Learners can practice before verifying email or reading lessons.</p>
    <div className="telemetry-cohorts">
      <CohortTelemetry data={view.live} demo={false} />
      <CohortTelemetry data={view.demo} demo />
    </div>
    <details className="reference-panel">
      <summary>How counts and scores are calculated</summary>
      <ul>
        <li>Cohorts use account type and include historical learner activity. Operator accounts are excluded. Demo email verification reflects seeded demo status.</li>
        <li>Activity means a signed-in visit or recorded lesson, practice, or exam work. Older lesson activity uses saved completion records.</li>
        <li>Practice coverage counts submitted Generalist exercises. Passing counts owner-finalized results, including resolved score adjustments.</li>
        <li>G1–G6 are RaterReady’s internal skill areas. Averages use structured scores converted to percentages. Written scores and overall appeal adjustments remain part of the exam result. A dash means no scored sample.</li>
        <li>Judge rates use terminal Generalist exam judge receipts from the last seven days. One exam can produce several judge receipts.</li>
      </ul>
    </details>
  </article>;
}
