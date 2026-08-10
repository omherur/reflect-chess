import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/server/auth";
import { analyzeGame } from "@/server/analysis/pipeline";

/** Kick off (or report status of) engine analysis for a game. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { id } = await params;
  const game = await prisma.game.findUnique({ where: { id } });
  if (!game || game.userId !== user.id) {
    return NextResponse.json({ error: "Game not found." }, { status: 404 });
  }

  if (game.analysisStatus === "ANALYZING") {
    return NextResponse.json({ status: "already_running" });
  }

  // Fire-and-forget: the engine runs in a child process, so this doesn't
  // block the Node event loop. The client polls GET for progress.
  analyzeGame(id, async (percent) => {
    await prisma.game.update({ where: { id }, data: { analysisProgress: percent } });
  }).catch((err) => {
    console.error(`Analysis failed for game ${id}:`, err);
  });

  return NextResponse.json({ status: "started" });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { id } = await params;
  const owned = await prisma.game.findUnique({ where: { id }, select: { userId: true } });
  if (!owned || owned.userId !== user.id) {
    return NextResponse.json({ error: "Game not found." }, { status: 404 });
  }
  const game = await prisma.game.findUniqueOrThrow({
    where: { id },
    select: { analysisStatus: true, analysisProgress: true, analysisError: true },
  });
  return NextResponse.json(game);
}
