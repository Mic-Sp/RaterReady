import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "../../../lib/prisma";
import { reviewTimestamp } from "../../../lib/review-presentation";
import { auditActions, listControlPanelAudit } from "../../../server/admin/audit";
import { requirePageRole } from "../../../server/auth/page-access";
import { ControlPanelPagination } from "../control-panel-pagination";

export const metadata: Metadata = { title: "Audit Log | RaterReady" };

/** Owner-only view of immutable events. Only the safe server projection reaches the table. */
export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePageRole("ADMIN_REVIEWER");
  const view = await listControlPanelAudit(prisma, await searchParams);
  return <article className="page-card learning-page reviewer-layout" aria-labelledby="audit-heading">
    <h1 id="audit-heading">Audit Log</h1>
    <p className="page-intro">Recent account, assessment, and operator events from the append-only audit log.</p>
    <form className="control-panel-filters" action="/admin/audit" aria-label="Filter audit events">
      <div className="form-field"><label htmlFor="audit-action">Action type</label>
        <select name="action" id="audit-action" defaultValue={view.action}>
          <option value="">All actions</option>
          {Object.entries(auditActions).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
        </select></div>
      <button className="primary-button" type="submit">Filter events</button>
      {view.action && <Link href="/admin/audit" className="inline-link">Clear filter</Link>}
    </form>
    <p className="control-panel-result">{view.total} {view.total === 1 ? "event" : "events"} found</p>
    {!view.rows.length ? <p>No audit events match this filter.</p> : <table className="control-panel-table" role="table">
      <caption>Audit events, newest first</caption>
      <thead role="rowgroup"><tr role="row">
        <th scope="col" role="columnheader">Timestamp (UTC)</th><th scope="col" role="columnheader">Actor</th><th scope="col" role="columnheader">Action</th>
        <th scope="col" role="columnheader">Target</th><th scope="col" role="columnheader">Summary</th>
      </tr></thead>
      <tbody role="rowgroup">{view.rows.map((event) => <tr key={event.id} role="row">
        <td role="cell"><span className="mobile-cell-label" aria-hidden="true">Timestamp (UTC)</span><time dateTime={event.at}>{reviewTimestamp(event.at)}</time></td>
        <td role="cell"><span className="mobile-cell-label" aria-hidden="true">Actor</span>{event.actor}</td>
        <td role="cell"><span className="mobile-cell-label" aria-hidden="true">Action</span>{event.action}</td>
        <td role="cell"><span className="mobile-cell-label" aria-hidden="true">Target</span>{event.entity}{event.target && <span className="audit-target"> {event.target}</span>}</td>
        <td role="cell"><span className="mobile-cell-label" aria-hidden="true">Summary</span>{event.summary}</td>
      </tr>)}</tbody>
    </table>}
    <ControlPanelPagination path="/admin/audit" params={{ action: view.action }} page={view.page} pages={view.pages} />
  </article>;
}
