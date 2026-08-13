import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// "/" is public too — the root route renders a marketing page for signed-out
// visitors and the dashboard for signed-in users (see src/app/page.tsx).
// The exact-match check below (no trailing "/"-prefix match) means this
// only exempts the literal root path, not every route under it.
//
// "/api/waitlist" and "/icon.svg" have to be public for the same reason the
// landing page does: the people they exist for are signed out by definition.
// Gating them would 401 every waitlist signup and redirect the favicon
// request to /login.
// "/auth/callback" is public because the visitor genuinely isn't signed in
// when they arrive there — they're carrying an OAuth code that hasn't been
// exchanged for a session yet. Gating it would bounce them to /login and
// throw the code away, failing the sign-in at the final step.
const PUBLIC_PREFIXES = [
  "/",
  "/login",
  "/signup",
  "/auth/callback",
  "/api/waitlist",
  "/icon.svg",
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

/**
 * Gates every page and API route behind a Supabase session, and — just as
 * importantly — refreshes that session on every request.
 *
 * The refresh is why this runs even for public paths: server components
 * can't write cookies, so this is the only place an expiring access token
 * can be renewed and handed back to the browser. Returning a different
 * response object than the one Supabase wrote cookies into would silently
 * drop the refreshed token and log people out mid-session, so the redirect
 * below copies them across.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    }
  );

  // getUser(), not getSession() — this revalidates the token rather than
  // trusting the cookie, and it's what triggers the refresh above.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  if (isPublicPath(pathname)) return response;

  if (!user) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    const redirect = NextResponse.redirect(url);
    // Carry over any refreshed auth cookies, or they're lost on redirect.
    for (const cookie of response.cookies.getAll()) {
      redirect.cookies.set(cookie);
    }
    return redirect;
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
