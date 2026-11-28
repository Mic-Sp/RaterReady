import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "../../../lib/prisma";
import { reviewTimestamp } from "../../../lib/review-presentation";
import { accountFilters, listControlPanelAccounts } from "../../../server/admin/accounts";
import { requirePageRole } from "../../../server/auth/page-access";
import { DemoBadge, SyntheticText } from "../../components/demo-badge";
import { StatusBadge } from "../../components/status-badge";
import { AccountControls } from "./account-controls";
import { ControlPanelPagination } from "../control-panel-pagination";

export const metadata: Metadata = { title: "Users & Access | RaterReady" };

/** Owner-only account directory. Each account mutation rechecks authority and current status. */
export default async function UsersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePageRole("ADMIN_REVIEWER");
  const view = await listControlPanelAccounts(prisma, await searchParams);
  return <article className="page-card learning-page reviewer-layout" aria-labelledby="users-heading">
    <h1 id="users-heading">Users &amp; Access</h1>
    <p className="page-intro">Find learner accounts and help with sign-in. Account changes keep learning and exam history intact.</p>
    <form action="/admin/users" method="get" className="control-panel-filters user-directory-filters" aria-label="Search and filter accounts">
      <div className="form-field"><label htmlFor="user-search">Search name, handle or email</label>
        <input id="user-search" name="q" type="search" defaultValue={view.search} maxLength={100} /></div>
      <div className="form-field"><label htmlFor="user-filter">Account filter</label>
        <select id="user-filter" name="filter" defaultValue={view.filter}>{Object.entries(accountFilters).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      <button className="primary-button" type="submit">Search accounts</button>
      {(view.search || view.filter !== "all") && <Link className="inline-link" href="/admin/users">Clear filters</Link>}
    </form>
    <p className="control-panel-result">{view.range
      ? `Showing ${view.range.start}–${view.range.end} of ${view.total} ${view.total === 1 ? "account" : "accounts"}`
      : "Showing 0 accounts"}</p>
    {!view.accounts.length ? <p>No accounts match these filters.</p> : <ul className="account-directory" role="list">
      {view.accounts.map((account) => <li key={account.id}>
        <section className="directory-card" aria-labelledby={`account-${account.id}`}>
          <header>
            <h2 id={`account-${account.id}`}><SyntheticText>{account.name}</SyntheticText></h2>
            <p><SyntheticText>{account.accountCode}</SyntheticText> {account.isSyntheticFixture ? <DemoBadge /> : <StatusBadge>Live</StatusBadge>}</p>
          </header>
          <dl className="directory-details">
            <div><dt>Email</dt><dd><SyntheticText>{account.email ?? "No email on file"}</SyntheticText></dd></div>
            <div><dt>Role</dt><dd>{account.role === "ADMIN_REVIEWER" ? "Operator" : "Learner"}</dd></div>
            <div><dt>Access</dt><dd>{account.accountStatus === "ACTIVE" ? "Active" : account.accountStatus === "DISABLED" ? "Deactivated" : "Revoked"}</dd></div>
            <div><dt>Email verification</dt><dd>{account.isSyntheticFixture ? "Demo account" : account.emailVerifiedAt ? "Verified" : "Unverified"}</dd></div>
            <div><dt>Practice progress</dt><dd>{account.role === "CANDIDATE" ? `${account.practiced}/6` : "—"}</dd></div>
            <div><dt>Exam status</dt><dd>{account.examStatus}</dd></div>
            <div><dt>Joined</dt><dd><time dateTime={account.createdAt}>{reviewTimestamp(account.createdAt)}</time></dd></div>
          </dl>
          {account.manageable ? <AccountControls target={account.id} label={account.name} active={account.accountStatus === "ACTIVE"}
            recovery={account.recoveryAvailable} verified={Boolean(account.emailVerifiedAt)} />
            : <p className="field-hint">{account.role === "ADMIN_REVIEWER" ? "Operator account protected." : "This revoked account is locked."}</p>}
        </section>
      </li>)}
    </ul>}
    <ControlPanelPagination path="/admin/users" params={{ q: view.search, filter: view.filter }} page={view.page} pages={view.pages} />
  </article>;
}
