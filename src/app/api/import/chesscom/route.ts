import { NextRequest, NextResponse } from "next/server";
import { chesscomAdapter } from "@/lib/import/chesscom";
import { ImportError } from "@/lib/import/types";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const username = typeof body?.username === "string" ? body.username : "";
  if (!username.trim()) {
    return NextResponse.json({ error: "Username is required." }, { status: 400 });
  }

  try {
    const games = await chesscomAdapter.fetchRecentGames(username, 20);
    return NextResponse.json({ games });
  } catch (err) {
    const status = err instanceof ImportError ? err.status ?? 502 : 500;
    const message = err instanceof Error ? err.message : "Unknown import error.";
    return NextResponse.json({ error: message }, { status });
  }
}
