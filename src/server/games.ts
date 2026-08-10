import { prisma } from "@/lib/db";
import { parsePgn, splitPgns, PgnParseError } from "@/lib/chess/pgn";
import { pgnContentHash } from "@/server/pgn-hash";
import type { ImportCandidate } from "@/lib/import/types";
import type { Color } from "@/lib/types";

/** The single local user for this MVP (no auth). Created by the seed script. */
export async function getLocalUser() {
  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (user) return user;
  return prisma.user.create({ data: { name: "Local Player" } });
}

export interface CreateGameResult {
  gameId: string | null;
  duplicate: boolean;
}

/**
 * Create a game plus its expanded move list from an import candidate.
 * Returns duplicate=true (and skips creation) if this user already
 * imported the same game.
 */
export async function createGameFromCandidate(
  userId: string,
  candidate: ImportCandidate
): Promise<CreateGameResult> {
  const existing = await prisma.game.findUnique({
    where: {
      userId_platform_externalId: {
        userId,
        platform: candidate.platform,
        externalId: candidate.externalId,
      },
    },
    select: { id: true },
  });
  if (existing) return { gameId: null, duplicate: true };

  const parsed = parsePgn(candidate.pgn); // throws PgnParseError if malformed
  const eloHeader = candidate.userColor === "white" ? parsed.headers.WhiteElo : parsed.headers.BlackElo;
  const userRating = eloHeader && /^\d+$/.test(eloHeader) ? parseInt(eloHeader, 10) : null;

  const game = await prisma.game.create({
    data: {
      userId,
      platform: candidate.platform,
      externalId: candidate.externalId,
      pgn: candidate.pgn,
      whitePlayer: candidate.whitePlayer,
      blackPlayer: candidate.blackPlayer,
      userColor: candidate.userColor,
      result: candidate.result,
      playedAt: candidate.playedAt ? new Date(candidate.playedAt) : null,
      timeControl: candidate.timeControl,
      opening: candidate.opening,
      terminationReason: parsed.terminationReason,
      userRating,
      moves: {
        create: parsed.moves.map((m) => ({
          ply: m.ply,
          moveNumber: m.moveNumber,
          color: m.color,
          san: m.san,
          uci: m.uci,
          fenBefore: m.fenBefore,
          fenAfter: m.fenAfter,
          clockSeconds: m.clockSeconds ?? null,
        })),
      },
    },
  });
  return { gameId: game.id, duplicate: false };
}

/**
 * Turn manually pasted PGN text (possibly several games) into import
 * candidates for the given user color choice.
 */
export function candidatesFromPastedPgn(
  text: string,
  userColor: Color,
  username?: string
): ImportCandidate[] {
  const pgns = splitPgns(text);
  if (pgns.length === 0) {
    throw new PgnParseError("No PGN games found in the pasted text.");
  }
  return pgns.map((pgn) => {
    const { headers, result } = parsePgn(pgn);
    let color = userColor;
    if (username) {
      const u = username.toLowerCase();
      if ((headers.White ?? "").toLowerCase() === u) color = "white";
      else if ((headers.Black ?? "").toLowerCase() === u) color = "black";
    }
    return {
      platform: "manual",
      externalId: pgnContentHash(pgn),
      pgn,
      whitePlayer: headers.White ?? "White",
      blackPlayer: headers.Black ?? "Black",
      userColor: color,
      result: headers.Result ?? result ?? "*",
      playedAt: parsePgnDate(headers.Date ?? headers.UTCDate),
      timeControl: headers.TimeControl ?? null,
      opening: headers.Opening ?? headers.ECO ?? null,
    };
  });
}

function parsePgnDate(date?: string): string | null {
  if (!date || date.includes("?")) return null;
  const iso = date.replace(/\./g, "-");
  const parsed = new Date(iso);
  return isNaN(parsed.getTime()) ? null : parsed.toISOString();
}
