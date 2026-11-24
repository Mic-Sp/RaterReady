import type { AuthIdentity } from "../../server/auth/accounts";
import { submitSignOut } from "../actions/session";
import { NavigationLinks } from "./navigation-links";

/** Header navigation receives a database-verified identity; pages/actions retain their own role guards. */
export function AuthenticatedNavigation({ user }: { user: AuthIdentity }) {
  return <div className="authenticated-navigation">
    <NavigationLinks role={user.role} />
    <div className="navigation-identity">
      <p>Signed in as <strong>{user.name}</strong></p>
      <span className="role-badge">{user.role === "ADMIN_REVIEWER" ? "Admin reviewer" : "Candidate"}</span>
      <span className="demo-badge">DEMO - SYNTHETIC</span>
      <form action={submitSignOut}><button type="submit" className="text-button">Sign out</button></form>
    </div>
  </div>;
}
