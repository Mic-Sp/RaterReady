import type { AuthIdentity } from "../../server/auth/accounts";
import { DemoBadge } from "./demo-badge";
import { VerificationRequestForm } from "./account-link-forms";

/** Account status is server-verified; synthetic scenario/credential disclosures stay on their own content. */
export function AccountBanner({ user }: { user: AuthIdentity | null }) {
  if (user && !user.isSyntheticFixture) {
    return <aside className="account-notice" aria-label="Closed alpha account access">
      <p className="notice-label"><span className="role-badge">Closed Alpha</span></p>
      <p>You are signed in with a live closed-alpha account. Training and exam scenarios carry their own synthetic-content labels.</p>
      {!user.emailVerifiedAt && <div className="verification-pending"><p>Email verification pending. Learning and untimed practice remain available. Verify before starting a timed Generalist Qualification Exam.</p><VerificationRequestForm /></div>}
    </aside>;
  }
  if (user) return <aside className="demo-notice" aria-label="Synthetic demonstration access">
    <p className="notice-label"><DemoBadge /></p>
    <p>You are signed in with a synthetic demonstration account. Shared pilot credentials may be verified publicly.</p>
  </aside>;
  return <aside className="account-notice" aria-label="RaterReady access modes">
    <p className="notice-label"><span className="role-badge">Closed Alpha</span></p>
    <p>Live learner accounts are available. <DemoBadge /> identifies demonstration accounts and fictional content.</p>
  </aside>;
}
