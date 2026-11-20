import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { auth } from "./lib/auth";
import { prisma } from "./lib/prisma";
import { AuthorizationError, authorizeSession } from "./server/auth/guards";
import { routeAccess } from "./server/auth/route-policy";
import type { NextAuthRequest } from "next-auth";

const checkAccess: (request: NextAuthRequest, event: NextFetchEvent) => Promise<NextResponse> = async (request) => {
  try {
    const access = routeAccess(request.nextUrl.pathname);
    await authorizeSession(prisma, request.auth,
      access === "admin" ? "ADMIN_REVIEWER" : access === "candidate" ? "CANDIDATE" : undefined);
    return NextResponse.next();
  } catch (error) {
    const status = error instanceof AuthorizationError ? error.status : 401;
    // Browser page navigation goes to sign-in. APIs, RSC and mutation requests retain
    // an explicit denial; never redirect/replay an unauthorized POST or Server Action.
    if (status === 401 && ["GET", "HEAD"].includes(request.method)
      && request.headers.get("accept")?.includes("text/html") && !request.nextUrl.pathname.startsWith("/api/")) {
      const response = NextResponse.redirect(new URL("/login", request.url));
      response.headers.set("Cache-Control", "no-store");
      return response;
    }
    return NextResponse.json({ error: status === 403 ? "Forbidden." : "Authentication required." },
      { status, headers: { "Cache-Control": "no-store" } });
  }
};
const protect = auth(checkAccess);

/**
 * Next.js 16 request middleware (proxy convention). Public routes bypass auth; all other
 * requests require a fresh active session. Admin pages/APIs additionally require the DB role.
 * Independent guards remain mandatory inside future protected handlers and Server Actions.
 */
export async function proxy(request: NextRequest, event: NextFetchEvent) {
  if (routeAccess(request.nextUrl.pathname) === "public") return NextResponse.next();
  return protect(request, event);
}

export const config = {
  matcher: ["/((?!_next/static(?:/|$)|_next/image(?:/|$)|favicon\\.ico$|robots\\.txt$|sitemap\\.xml$).*)"],
};
