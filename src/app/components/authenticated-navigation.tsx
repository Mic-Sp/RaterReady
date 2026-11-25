import { DemoBadge, SyntheticText } from "./demo-badge";
import type { AuthIdentity } from "../../server/auth/accounts";
import { submitSignOut } from "../actions/session";
import { NavigationLinks } from "./navigation-links";

/** Header navigation receives a database-verified identity; pages/actions retain their own role guards. */
export function AuthenticatedNavigation({ user }: { user: AuthIdentity }) {
  return <div className="authenticated-navigation">
    <div className="navigation-identity">
      <p><span className="account-label">Signed in as </span><strong><SyntheticText>{user.name}</SyntheticText></strong></p>
      <div className="account-controls">
      <span className="role-badge"><SyntheticText>{user.role === "ADMIN_REVIEWER" ? "Admin reviewer" : "Candidate"}</SyntheticText></span>
      {user.isSyntheticFixture ? <DemoBadge /> : <span className="role-badge">Closed Alpha</span>}
      <form action={submitSignOut}><button type="submit" className="text-button sign-out-button">Sign out</button></form>
      </div>
    </div>
    <NavigationLinks role={user.role} />
  </div>;
}
