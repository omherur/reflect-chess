import type { User } from "@prisma/client";
import { normalizeEmail } from "@/lib/email";

/**
 * Access control for the /admin area: an allowlist of email addresses.
 *
 * This only became a safe design once email/password auth landed. Under the
 * old password-less scheme an account was claimed by typing its name, so
 * checking who someone was proved nothing and admin had to be gated by a
 * shared secret instead. Now identity is backed by a password Supabase
 * verifies, so "is this person an admin" is a question worth asking.
 *
 * Fails closed: with ADMIN_EMAILS unset or empty, nobody is an admin —
 * a misconfigured deploy gets a locked admin area, not an open one.
 */

/** Comma-separated, e.g. ADMIN_EMAILS="me@example.com,you@example.com". */
export function adminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS ?? "";
  return raw
    .split(",")
    .map((e) => normalizeEmail(e))
    .filter(Boolean);
}

/** True when at least one admin email is configured. */
export function adminEnabled(): boolean {
  return adminEmails().length > 0;
}

/**
 * Whether this user may see the admin area.
 *
 * Compares against the email mirrored onto the local row at sign-in, which
 * comes from Supabase — not from anything the user can set themselves.
 */
export function isAdminUser(user: Pick<User, "email"> | null | undefined): boolean {
  if (!user?.email) return false;
  const allowed = adminEmails();
  if (allowed.length === 0) return false;
  return allowed.includes(normalizeEmail(user.email));
}
