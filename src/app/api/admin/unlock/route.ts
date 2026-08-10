import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { ADMIN_COOKIE, adminCookieToken, adminEnabled, verifyAdminKey } from "@/server/admin-auth";

/**
 * Exchanges the admin key for the admin cookie.
 *
 * A signed-in session is required as well — not because it proves anything
 * (names aren't credentials), but so admin activity is always attached to
 * some account rather than being fully anonymous.
 */

// Crude per-process throttle. The key is long enough that online guessing
// isn't realistic, but there's no reason to answer an unbounded stream of
// attempts either.
const MAX_ATTEMPTS = 10;
const LOCKOUT_MS = 5 * 60 * 1000;
let failedAttempts = 0;
let lockedUntil = 0;

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  if (!adminEnabled()) {
    return NextResponse.json(
      { error: "The admin area is not configured on this server." },
      { status: 503 }
    );
  }

  const now = Date.now();
  if (now < lockedUntil) {
    const seconds = Math.ceil((lockedUntil - now) / 1000);
    return NextResponse.json(
      { error: `Too many attempts. Try again in ${seconds}s.` },
      { status: 429 }
    );
  }

  const body = await req.json().catch(() => null);
  const key = typeof body?.key === "string" ? body.key : "";

  if (!verifyAdminKey(key)) {
    failedAttempts += 1;
    if (failedAttempts >= MAX_ATTEMPTS) {
      lockedUntil = now + LOCKOUT_MS;
      failedAttempts = 0;
      console.warn(`[admin] Too many failed unlock attempts — locked out for ${LOCKOUT_MS}ms.`);
    }
    return NextResponse.json({ error: "That key is not correct." }, { status: 403 });
  }

  failedAttempts = 0;
  const token = adminCookieToken();
  if (token === null) {
    return NextResponse.json({ error: "The admin area is not configured." }, { status: 503 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12, // half a day — short on purpose for an admin view
  });
  return res;
}

/** Lock again — clears the cookie. */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
