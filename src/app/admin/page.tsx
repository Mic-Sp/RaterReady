import type { Metadata } from "next";
import { requirePageRole } from "../../server/auth/page-access";
import { LandingShell } from "../components/landing-shell";

export const metadata: Metadata = { title: "Admin reviewer console | RaterReady" };

/** Owner/admin-only Server Component; authorize independently of middleware before rendering. */
export default async function AdminConsolePage() {
  const user = await requirePageRole("ADMIN_REVIEWER");
  return <LandingShell user={user} />;
}
