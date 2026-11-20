"use server";

import { requireSession, signOut } from "../../lib/auth";

/** Authenticated, same-origin Server Action clears the current Auth.js session and returns to sign-in. */
export async function submitSignOut(): Promise<void> {
  await requireSession();
  await signOut({ redirectTo: "/login" });
}
