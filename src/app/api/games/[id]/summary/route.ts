import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { getOrGenerateGameSummary } from "@/server/summary/service";

/**
 * The post-game summary, generated once (lazily, on first request after
 * every key moment is reviewed) and cached on Game.summary — same
 * reasoning as Reflection.explanation being generated once per key moment
 * rather than re-run on every page visit.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { id: gameId } = await params;
  const result = await getOrGenerateGameSummary(gameId, user.id);

  if (result.status === "not_found") {
    return NextResponse.json({ error: "Game not found." }, { status: 404 });
  }
  if (result.status === "not_ready") {
    return NextResponse.json(
      {
        error:
          "This game isn't fully reviewed yet — the summary is only available once every key moment has been reflected on.",
      },
      { status: 409 }
    );
  }
  return NextResponse.json({ summary: result.summary });
}
