import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/server/auth";

/** Link (or update) the current user's Chess.com username, once, so future visits can auto-sync. */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  if (!username) {
    return NextResponse.json({ error: "Enter a Chess.com username." }, { status: 400 });
  }

  const account = await prisma.chessAccount.upsert({
    where: { platform_username_userId: { platform: "chesscom", username, userId: user.id } },
    create: { platform: "chesscom", username, userId: user.id },
    update: {},
  });

  return NextResponse.json({ account: { id: account.id, username: account.username } });
}
