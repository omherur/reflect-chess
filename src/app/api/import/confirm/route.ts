import { NextRequest, NextResponse } from "next/server";
import { createGameFromCandidate } from "@/server/games";
import { getCurrentUser } from "@/server/auth";
import { PgnParseError } from "@/lib/chess/pgn";
import type { ImportCandidate } from "@/lib/import/types";

/** Persist a selection of import candidates, skipping duplicates. */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const games = Array.isArray(body?.games) ? (body.games as ImportCandidate[]) : [];
  if (games.length === 0) {
    return NextResponse.json({ error: "No games selected." }, { status: 400 });
  }
  const results: { externalId: string; status: "created" | "duplicate" | "error"; error?: string; gameId?: string }[] = [];

  for (const candidate of games) {
    try {
      const { gameId, duplicate } = await createGameFromCandidate(user.id, candidate);
      results.push({
        externalId: candidate.externalId,
        status: duplicate ? "duplicate" : "created",
        gameId: gameId ?? undefined,
      });
    } catch (err) {
      const message =
        err instanceof PgnParseError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Import failed.";
      results.push({ externalId: candidate.externalId, status: "error", error: message });
    }
  }

  return NextResponse.json({ results });
}
