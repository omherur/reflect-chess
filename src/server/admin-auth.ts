import { createHash, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

/**
 * Access control for the /admin area.
 *
 * Why a secret key rather than "is this user an admin": login is
 * password-less — you become an account by typing its name. So any check of
 * the form `user.name === "Om"` is bypassed by typing "Om". A name is an
 * identifier here, not a credential, and cannot gate anything.
 *
 * So admin access needs something the visitor has to *know*: ADMIN_KEY, set
 * in the environment and never in the database. Unlocking sets an httpOnly
 * cookie holding a derived token — not the key itself, so a leaked cookie
 * can't be replayed as the key anywhere else.
 *
 * Fails closed: with ADMIN_KEY unset or too short, nobody is an admin. A
 * deployment that forgets to configure it gets a locked admin area, not an
 * open one.
 */

export const ADMIN_COOKIE = "rc_admin";

/** Short keys are guessable; a missing key must not mean "open to all". */
const MIN_KEY_LENGTH = 16;

function sha256(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

function constantTimeEquals(a: string, b: string): boolean {
  // Hash first so the comparison is over equal-length buffers — timingSafeEqual
  // throws on a length mismatch, and the length itself would leak.
  return timingSafeEqual(sha256(a), sha256(b));
}

function configuredKey(): string | null {
  const key = process.env.ADMIN_KEY?.trim();
  if (!key) return null;
  if (key.length < MIN_KEY_LENGTH) {
    console.error(
      `[admin] ADMIN_KEY is shorter than ${MIN_KEY_LENGTH} characters — refusing to enable the admin area.`
    );
    return null;
  }
  return key;
}

/** True when an admin key is configured at all. */
export function adminEnabled(): boolean {
  return configuredKey() !== null;
}

/**
 * The value stored in the cookie. Derived from the key rather than being the
 * key, so reading the cookie doesn't hand over the credential itself.
 */
export function adminCookieToken(): string | null {
  const key = configuredKey();
  return key === null ? null : sha256(`reflectchess-admin-v1:${key}`).toString("hex");
}

export function verifyAdminKey(submitted: string): boolean {
  const key = configuredKey();
  if (key === null) return false;
  return constantTimeEquals(submitted, key);
}

/** Reads the request's cookies — for server components and route handlers. */
export async function isAdminUnlocked(): Promise<boolean> {
  const expected = adminCookieToken();
  if (expected === null) return false;
  const cookieStore = await cookies();
  const presented = cookieStore.get(ADMIN_COOKIE)?.value;
  if (!presented) return false;
  return constantTimeEquals(presented, expected);
}
