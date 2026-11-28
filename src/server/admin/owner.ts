import "server-only";
import type { Prisma } from "@prisma/client";
import { requireAdmin } from "../../lib/auth";
import { AuthorizationError } from "../auth/guards";
import type { AuthIdentity } from "../auth/accounts";

/** The sole active alpha owner may read the control panel or change learner access. */
export async function requireControlPanelOwner() {
  const owner = await requireAdmin();
  if (owner.role !== "ADMIN_REVIEWER" || owner.accountCode !== "admin-michael") throw new AuthorizationError(403);
  return owner;
}

/** Keep the operator's authorization stable while an account mutation and its audit receipt commit. */
export async function lockControlPanelOwner(tx: Prisma.TransactionClient, owner: AuthIdentity) {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "User" WHERE "id" = ${owner.id}
      AND "role" = 'ADMIN_REVIEWER' AND "accountCode" = 'admin-michael'
      AND "isSyntheticFixture" AND "accountStatus" = 'ACTIVE'
      AND "sessionVersion" = ${owner.sessionVersion} FOR SHARE`;
  if (!rows.length) throw new AuthorizationError(403);
}
