import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { SESSION_COOKIE } from "@/server/auth";
import { seedDemoGame } from "@/server/demo/seed-demo-game";

const MAX_NAME_LENGTH = 40;

/**
 * Password-less login: enter a name, get logged in — creating the account
 * on first use. Names are unique, so each tester gets their own isolated
 * set of games.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";

  if (!name) {
    return NextResponse.json({ error: "Enter a name to continue." }, { status: 400 });
  }
  if (name.length > MAX_NAME_LENGTH) {
    return NextResponse.json({ error: `Name must be ${MAX_NAME_LENGTH} characters or fewer.` }, { status: 400 });
  }

  // Not an upsert any more: seeding the demo game requires knowing whether
  // this call created the account or matched an existing one, and upsert
  // can't tell you.
  let user = await prisma.user.findUnique({ where: { name } });
  let isNewAccount = false;

  if (!user) {
    try {
      user = await prisma.user.create({ data: { name } });
      isNewAccount = true;
    } catch {
      // Unique-constraint race: a concurrent request created the same name
      // between the lookup and the insert. That request owns the seeding, so
      // this one continues as a returning login.
      user = await prisma.user.findUniqueOrThrow({ where: { name } });
    }
  }

  if (isNewAccount) {
    // Awaited, not fire-and-forget, so the game is already there when the
    // redirect lands on the dashboard. It's a fixture insert, not engine
    // work, so it costs milliseconds — and it can't throw (see seedDemoGame).
    await seedDemoGame(user.id);
  }

  const session = await prisma.session.create({ data: { userId: user.id } });

  const res = NextResponse.json({ user: { id: user.id, name: user.name } });
  res.cookies.set(SESSION_COOKIE, session.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return res;
}
