import type { AuthIdentity } from "../../server/auth/accounts";
import { DemoBadge } from "./demo-badge";

/** Account status is server-verified; synthetic scenario/credential disclosures stay on their own content. */
export function AccountBanner({ user }: { user: AuthIdentity | null }) {
  if (user && !user.isSyntheticFixture) {
    return <aside className="account-notice" aria-label="Closed alpha account access">
      <p className="notice-label"><span className="role-badge">Closed Alpha</span></p>
      <p>You are signed in with a live closed-alpha account. Training and exam scenarios carry their own synthetic-content labels.</p>
    </aside>;
  }
  return <aside className="demo-notice" aria-label="Synthetic demonstration access">
    <p className="notice-label"><DemoBadge /></p>
    <p>{user ? "You are signed in with a synthetic demonstration account. Shared pilot credentials may be verified publicly."
      : "Synthetic demonstration accounts remain available. Live closed-alpha access is by invitation only. Shared pilot credentials may be verified publicly."}</p>
  </aside>;
}
