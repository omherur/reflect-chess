import type { User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { seedDemoGame } from "@/server/demo/seed-demo-game";

/**
 * Identity lives in Supabase Auth (email + password); the application's own
 * data still lives in the local database. This module is the join between
 * them: it turns "who is signed in, according to Supabase" into "which User
 * row owns the games".
 *
 * getCurrentUser() keeps the same shape it had under the old password-less
 * scheme — the local User row, or null — so every route and page that guards
 * on it is unaffected by the change of auth provider.
 */

/**
 * A display name to start people off with, derived from the email's local
 * part ("jamie.smith@example.com" → "Jamie Smith"). Purely cosmetic; the
 * name isn't an identifier any more.
 */
function displayNameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "Player";
  const words = local
    .replace(/[._-]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "Player";
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

/**
 * Finds the local row for an authenticated Supabase user, creating it the
 * first time we see them.
 *
 * Created lazily on read rather than at sign-up because sign-up isn't the
 * only way a session can first arrive here (a confirmation link or a session
 * restored on another device would both bypass it), and a missing local row
 * would mean a signed-in user with no account.
 */
async function ensureLocalUser(supabaseUserId: string, email: string | undefined): Promise<User> {
  const existing = await prisma.user.findUnique({ where: { supabaseUserId } });
  if (existing) {
    // Keep the mirrored email in step if it changed in Supabase.
    if (email && existing.email !== email) {
      return prisma.user.update({ where: { id: existing.id }, data: { email } });
    }
    return existing;
  }

  const created = await prisma.user.create({
    data: {
      supabaseUserId,
      email: email ?? null,
      name: email ? displayNameFromEmail(email) : "Player",
    },
  });

  // Same promise the landing page makes: a first sign-in lands on an
  // analyzed game, not an empty dashboard. Never throws (see seedDemoGame).
  await seedDemoGame(created.id);

  return created;
}

/**
 * The signed-in user's local row, or null.
 *
 * Uses getUser() rather than getSession(): getSession reads the cookie and
 * trusts it, while getUser revalidates the token with Supabase. On the
 * server, where the cookie is attacker-supplied input, that difference is
 * the whole point.
 */
export async function getCurrentUser(): Promise<User | null> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;

  return ensureLocalUser(user.id, user.email);
}
