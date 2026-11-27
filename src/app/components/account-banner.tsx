import type { AuthIdentity } from "../../server/auth/accounts";
import { VerificationRequestForm } from "./account-link-forms";

/** Give unverified learners the email action; routine account status lives in the header. */
export function AccountBanner({ user }: { user: AuthIdentity | null }) {
  if (!user || user.isSyntheticFixture || user.emailVerifiedAt) return null;
  return <aside className="account-notice" aria-label="Closed alpha account access">
    <p><strong>Email verification pending.</strong> You can learn and practice now. Verify your email before starting the timed Generalist Qualification Exam.</p>
    <VerificationRequestForm />
  </aside>;
}
