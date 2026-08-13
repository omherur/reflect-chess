import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Where Google (via Supabase) sends the browser back after consent.
 *
 * OAuth here is the PKCE flow: the redirect carries a short-lived `code`
 * which has to be exchanged for a session server-side. That exchange is why
 * this is a route handler rather than a page — route handlers can write
 * cookies, so the session lands in the response.
 *
 * This path MUST be in PUBLIC_PREFIXES in src/proxy.ts. The visitor is not
 * signed in yet when they arrive, so gating it would bounce them to /login
 * and discard the code — the sign-in would fail at the last step, which
 * looks like Google rejecting them rather than a routing mistake.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  // Only ever a same-origin path, never an absolute URL — an attacker-supplied
  // `next` would otherwise turn this into an open redirect.
  const requested = searchParams.get("next") ?? "/";
  const next = requested.startsWith("/") && !requested.startsWith("//") ? requested : "/";

  const fail = (message: string) =>
    NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(message)}`);

  // Google reports a refusal (a cancelled consent screen, say) as an error on
  // the query string rather than as a missing code. Its descriptions are not
  // written for end users, so only the one case worth naming is named.
  const errorCode = searchParams.get("error");
  if (errorCode) {
    console.warn(
      "[auth] Google returned an error:",
      errorCode,
      searchParams.get("error_description") ?? ""
    );
    return fail(
      errorCode === "access_denied"
        ? "Google sign-in was cancelled."
        : "Google sign-in failed. Try again."
    );
  }

  if (!code) return fail("Sign-in did not complete. Try again.");

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    // Deliberately not surfaced verbatim: the usual failure here is a stale,
    // reused or cross-browser link, and Supabase's message for it is a
    // paragraph about PKCE storage and SSR frameworks — true, but useless to
    // the person looking at it. The detail goes to the logs instead.
    console.error("[auth] Failed to exchange OAuth code for a session:", error.message);
    return fail("That sign-in link has expired or was already used. Try signing in again.");
  }

  return NextResponse.redirect(`${origin}${next}`);
}
