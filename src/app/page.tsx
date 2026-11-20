import { redirect } from "next/navigation";
import { roleLandingPath } from "../lib/role-routing";
import { optionalPageIdentity } from "../server/auth/page-access";

/** Fixed post-login entry point: a fresh request reads the cookie and database role before routing. */
export default async function HomePage() {
  const user = await optionalPageIdentity();
  redirect(user ? roleLandingPath(user.role) : "/login");
}
