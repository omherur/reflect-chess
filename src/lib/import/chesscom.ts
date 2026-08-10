import { parsePgn, colorForUsername } from "@/lib/chess/pgn";
import { ImportError, type ImportCandidate, type PlatformAdapter } from "./types";

const API_BASE = "https://api.chess.com/pub";
const USER_AGENT = "ReflectChess-MVP (local development app)";

interface ChesscomGame {
  url: string;
  pgn?: string;
  end_time: number;
  time_control: string;
  time_class?: string;
  white: { username: string; result: string };
  black: { username: string; result: string };
}

async function fetchJson<T>(url: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  } catch {
    throw new ImportError("Could not reach Chess.com. Check your connection.");
  }
  if (res.status === 404) {
    throw new ImportError("Chess.com user not found.", 404);
  }
  if (!res.ok) {
    throw new ImportError(`Chess.com API error (HTTP ${res.status}).`, res.status);
  }
  return res.json() as Promise<T>;
}

function resultString(white: { result: string }, black: { result: string }): string {
  if (white.result === "win") return "1-0";
  if (black.result === "win") return "0-1";
  return "1/2-1/2";
}

/** Extract the game id from a chess.com game URL like .../game/live/123456. */
function externalIdFromUrl(url: string): string {
  const match = /\/game\/(?:live|daily)\/(\d+)/.exec(url);
  return match ? match[1] : url;
}

/** Human-readable opening name from the ECOUrl header chess.com embeds in PGNs. */
function openingFromHeaders(headers: Record<string, string>): string | null {
  if (headers.Opening) return headers.Opening;
  const ecoUrl = headers.ECOUrl;
  if (ecoUrl) {
    const slug = ecoUrl.split("/").pop() ?? "";
    const name = slug.replace(/-/g, " ").replace(/\s+\d.*$/, "").trim();
    if (name) return name;
  }
  return headers.ECO ?? null;
}

/**
 * Chess.com adapter using the public Published-Data API (no auth).
 * Pulls the most recent monthly archives and flattens them, newest first.
 */
export const chesscomAdapter: PlatformAdapter = {
  platform: "chesscom",

  async fetchRecentGames(username: string, limit = 20): Promise<ImportCandidate[]> {
    const user = username.trim().toLowerCase();
    if (!user) throw new ImportError("Username is required.");

    const { archives } = await fetchJson<{ archives: string[] }>(
      `${API_BASE}/player/${encodeURIComponent(user)}/games/archives`
    );
    if (!archives || archives.length === 0) return [];

    const candidates: ImportCandidate[] = [];
    // Walk archives newest-first until we have enough games.
    for (const archiveUrl of [...archives].reverse().slice(0, 3)) {
      const { games } = await fetchJson<{ games: ChesscomGame[] }>(archiveUrl);
      for (const g of [...games].reverse()) {
        if (candidates.length >= limit) break;
        if (!g.pgn) continue; // variants and unfinished games may lack PGN
        let headers: Record<string, string>;
        try {
          headers = parsePgn(g.pgn).headers;
        } catch {
          continue; // skip malformed or variant PGNs (e.g. Chess960 quirks)
        }
        const userColor = colorForUsername(
          { White: g.white.username, Black: g.black.username },
          user
        );
        if (!userColor) continue;
        candidates.push({
          platform: "chesscom",
          externalId: externalIdFromUrl(g.url),
          pgn: g.pgn,
          whitePlayer: g.white.username,
          blackPlayer: g.black.username,
          userColor,
          result: resultString(g.white, g.black),
          playedAt: new Date(g.end_time * 1000).toISOString(),
          timeControl: g.time_class ?? g.time_control ?? null,
          opening: openingFromHeaders(headers),
        });
      }
      if (candidates.length >= limit) break;
    }
    return candidates;
  },
};

/** Registry of platform adapters. Add a Lichess adapter here later. */
export const adapters: Record<string, PlatformAdapter> = {
  chesscom: chesscomAdapter,
};
