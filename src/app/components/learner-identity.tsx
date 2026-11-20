import type { AuthIdentity } from "../../server/auth/accounts";
import { submitSignOut } from "../actions/session";

/** Render only the already-guarded current identity; authorization stays in each page and action. */
export function LearnerIdentity({ user }: { user: AuthIdentity }) {
  return <div className="learner-identity"><p>Signed in as <strong>{user.name}</strong></p>
    <p><span className="role-badge">Candidate</span> <span className="demo-badge">DEMO - SYNTHETIC</span></p>
    <form action={submitSignOut}><button type="submit" className="text-button">Sign out</button></form>
  </div>;
}
