import { NextRequest, NextResponse } from "next/server";
import { candidatesFromPastedPgn } from "@/server/games";
import { PgnParseError } from "@/lib/chess/pgn";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const pgn = typeof body?.pgn === "string" ? body.pgn : "";
  const userColor = body?.userColor === "black" ? "black" : "white";
  const username = typeof body?.username === "string" ? body.username : undefined;

  if (!pgn.trim()) {
    return NextResponse.json({ error: "Paste a PGN to continue." }, { status: 400 });
  }

  try {
    const games = candidatesFromPastedPgn(pgn, userColor, username);
    return NextResponse.json({ games });
  } catch (err) {
    const message =
      err instanceof PgnParseError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Could not parse the pasted PGN.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
