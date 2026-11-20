import type { AuthIdentity } from "../../server/auth/accounts";
import { submitSignOut } from "../actions/session";

/** Present only a page-guarded identity; this component never chooses or grants authorization. */
export function LandingShell({ user }: { user: AuthIdentity }) {
  const admin = user.role === "ADMIN_REVIEWER";
  return (
    <section className="page-card" aria-labelledby="landing-heading">
      <p className="eyebrow">{admin ? "Owner review access" : "Learner access"}</p>
      <h1 id="landing-heading">{admin ? "Admin reviewer console" : "Your candidate dashboard"}</h1>
      <p className="page-intro">Welcome, {user.name}.</p>
      <div className="identity-card">
        <p className="identity-label">Signed in as</p>
        <p className="identity-name">{user.name}</p>
        <div className="badge-row">
          <span className="role-badge">{admin ? "Admin reviewer" : "Candidate"}</span>
          <span className="demo-badge">DEMO - SYNTHETIC</span>
        </div>
      </div>
      <p className="shell-description">{admin
        ? "You have owner review access. Assessment review tools are not available in this demonstration yet."
        : "You’re signed in to your synthetic demonstration account. Learning activities are not available in this demonstration yet."}</p>
      <form action={submitSignOut}>
        <button type="submit" className="secondary-button">Sign out</button>
      </form>
    </section>
  );
}
