import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { auth } from "./lib/auth";
import { prisma } from "./lib/prisma";
import { AuthorizationError, authorizeSession } from "./server/auth/guards";
import { routeAccess } from "./server/auth/route-policy";
import type { NextAuthRequest } from "next-auth";

const checkAccess: (request: NextAuthRequest, event: NextFetchEvent) => Promise<NextResponse> = async (request) => {
  try {
    await authorizeSession(prisma, request.auth,
      routeAccess(request.nextUrl.pathname) === "admin" ? "ADMIN_REVIEWER" : undefined);
    return NextResponse.next();
  } catch (error) {
    const status = error instanceof AuthorizationError ? error.status : 401;
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
