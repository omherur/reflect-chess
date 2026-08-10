import { cookies } from "next/headers";
import { prisma } from "@/lib/db";

/**
 * Lightweight, password-less auth: a user picks a unique name to log in
 * (creating the account on first use). The session cookie holds a random
 * session id, not the raw userId, so it isn't trivially forgeable — but
 * there's no password, which is an intentional simplification for a
 * local-first app with a handful of named testers, not a public product.
 */
export const SESSION_COOKIE = "session_token";

export async function getCurrentUser() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({ where: { id: token }, include: { user: true } });
  return session?.user ?? null;
}
