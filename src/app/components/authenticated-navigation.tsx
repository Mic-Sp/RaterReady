import { DemoBadge, SyntheticText } from "./demo-badge";
import type { AuthIdentity } from "../../server/auth/accounts";
import { submitSignOut } from "../actions/session";
import { NavigationLinks } from "./navigation-links";

/** Header navigation receives a database-verified identity; pages/actions retain their own role guards. */
export function AuthenticatedNavigation({ user }: { user: AuthIdentity }) {
  return <div className="authenticated-navigation">
    <NavigationLinks role={user.role} />
    <div className="navigation-identity">
      <p>Signed in as <strong><SyntheticText>{user.name}</SyntheticText></strong></p>
      <span className="role-badge"><SyntheticText>{user.role === "ADMIN_REVIEWER" ? "Admin reviewer" : "Candidate"}</SyntheticText></span>
      <DemoBadge />
      <form action={submitSignOut}><button type="submit" className="text-button">Sign out</button></form>
    </div>
  </div>;
}
