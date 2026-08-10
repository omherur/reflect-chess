/**
 * Email handling for the waitlist.
 *
 * Deliberately a permissive shape check rather than an attempt at RFC 5322 —
 * the only thing a landing-page form can usefully catch is an obvious typo
 * (missing @, no dot in the domain, stray spaces). Anything stricter starts
 * rejecting real addresses, and the real proof an address works is a
 * delivered email, not a regex.
 */

export const MAX_EMAIL_LENGTH = 254; // the practical limit on an address

// Local part: no spaces, no @. Domain: labels separated by dots, at least
// one dot, and a TLD of two or more letters.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[a-zA-Z]{2,}$/;

/**
 * Trim and lowercase, so the unique constraint on WaitlistSignup.email
 * actually dedupes. Domains are case-insensitive; local parts technically
 * are not, but no real provider treats them as distinct, and one signup per
 * human is what the waitlist is for.
 */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidEmail(raw: string): boolean {
  const email = normalizeEmail(raw);
  if (!email || email.length > MAX_EMAIL_LENGTH) return false;
  if (email.includes("..")) return false;
  return EMAIL_SHAPE.test(email);
}
