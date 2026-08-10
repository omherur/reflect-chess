import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { SESSION_COOKIE } from "@/server/auth";

// "/" is public too — the root route renders a marketing page for signed-out
// visitors and the dashboard for signed-in users (see src/app/page.tsx).
// The exact-match check below (no trailing "/"-prefix match) means this
// only exempts the literal root path, not every route under it.
//
// "/api/waitlist" and "/icon.svg" have to be public for the same reason the
// landing page does: the people they exist for are signed out by definition.
// Gating them would 401 every waitlist signup and redirect the favicon
// request to /login.
const PUBLIC_PREFIXES = ["/", "/login", "/api/auth", "/api/waitlist", "/icon.svg"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

/**
 * Gates every page and API route behind a valid session, redirecting (or
 * 401'ing, for API routes) unauthenticated requests to /login. Runs on the
 * Node.js runtime (Next.js 16 default for proxy), so a real DB-backed
 * session check is fine here, not just a cookie-presence check.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await prisma.session.findUnique({ where: { id: token } }) : null;

  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
