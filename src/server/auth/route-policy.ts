/**
 * Default-private route policy: only explicit auth pages, homepage, public credential
 * verification and Auth.js protocol are public. Nested/new learner routes inherit authentication.
 */
export function routeAccess(pathname: string): "public" | "authenticated" | "candidate" | "admin" {
  let path: string;
  try {
    // Decode before segment checks so encoded admin segments do not evade the role gate.
    const decoded = decodeURIComponent(pathname);
    if (!decoded.startsWith("/")) return "authenticated";
    // Keep the origin fixed: a leading encoded slash must not become a protocol-relative URL.
    path = new URL(`http://internal${decoded.replace(/\\/g, "/").replace(/\/{2,}/g, "/")}`).pathname;
  } catch {
    return "authenticated";
  }
  const inTree = (root: string) => path === root || path.startsWith(`${root}/`);
  if (inTree("/admin") || inTree("/api/admin")) return "admin";
  if (["/dashboard", "/onboarding", "/welcome", "/diagnostic", "/learn", "/practice", "/workflow-lab", "/technical-preview", "/capstone", "/opportunities", "/appeals"].some(inTree)) return "candidate";
  if (["/", "/login", "/register", "/verify-email", "/forgot-password", "/reset-password"].includes(path) || inTree("/verify") || inTree("/api/auth")) return "public";
  return "authenticated";
}
