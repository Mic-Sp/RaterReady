import type { Role } from "@prisma/client";

/** Map a server-verified role to a fixed local destination; never accept a client callback URL. */
export function roleLandingPath(role: Role): "/dashboard" | "/admin" {
  return role === "ADMIN_REVIEWER" ? "/admin" : "/dashboard";
}
