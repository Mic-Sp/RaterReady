import type { ReactNode } from "react";
import { requirePageRole } from "../../server/auth/page-access";
import { ControlPanelNav } from "./control-panel-nav";

/** Shared navigation for authorized operators. Each page and action separately guards its data. */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requirePageRole("ADMIN_REVIEWER");
  return <><ControlPanelNav />{children}</>;
}
