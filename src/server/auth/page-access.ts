import "server-only";
import type { Role } from "@prisma/client";
import { notFound, redirect } from "next/navigation";
import { requireAdmin, requireCandidate, requireSession } from "../../lib/auth";
import { AuthorizationError } from "./guards";

/** Return the fresh server identity, or null for unauthenticated/disabled/revoked accounts. */
export async function optionalPageIdentity() {
  try {
    return await requireSession();
  } catch (error) {
    if (error instanceof AuthorizationError && error.status === 401) return null;
    throw error;
  }
}

/**
 * Independent page boundary: require the exact role before returning any identity/UI.
 * Middleware sends 403 for wrong roles; if bypassed, this boundary still withholds the page.
 */
export async function requirePageRole(role: Role) {
  try {
    return await (role === "ADMIN_REVIEWER" ? requireAdmin() : requireCandidate());
  } catch (error) {
    if (error instanceof AuthorizationError) {
      if (error.status === 401) redirect("/login");
      notFound();
    }
    throw error;
  }
}
