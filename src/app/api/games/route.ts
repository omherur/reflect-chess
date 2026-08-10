import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/server/auth";

/**
 * Permanently delete every imported game (and, via cascade, their moves,
 * key moments, and reflections) for the current user. Does not touch the
 * User or ChessAccount records.
 */
export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { count } = await prisma.game.deleteMany({ where: { userId: user.id } });
  return NextResponse.json({ deleted: count });
}
