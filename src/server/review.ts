import { prisma } from "@/lib/db";
import { toClientView } from "@/server/keymoments";
import type { KeyMomentPublic, KeyMomentVerdict } from "@/lib/types";

export interface GameReviewMove {
  ply: number;
  moveNumber: number;
  color: string;
  san: string;
  uci: string;
  fenBefore: string;
  fenAfter: string;
}

export interface GameReviewData {
  game: {
    id: string;
    platform: string;
    whitePlayer: string;
    blackPlayer: string;
    userColor: string;
    result: string;
    playedAt: string | null;
    timeControl: string | null;
    opening: string | null;
    analysisStatus: string;
    analysisProgress: number;
    analysisError: string | null;
  };
  moves: GameReviewMove[];
  /**
   * Key moments in chronological order (by ply, as they occurred in the
   * game) — sortIndex is assigned in ply order at analysis time, so the
   * natural DB order already is chronological. Severity is conveyed via
   * color-coded classification badges once reflected, not by reordering.
   */
  keyMoments: (KeyMomentPublic | KeyMomentVerdict)[];
}

/**
 * Shared by the RSC review page (initial load) and the client-side refetch
 * API route. The ownership check lives here, not just in the API route —
 * the RSC page previously called this with no check at all, so the
 * server-rendered initial page load leaked another user's full game
 * (moves, key moments, and pre-reveal reflection text) to anyone who
 * knew/guessed the gameId, even though the client-side refetch route was
 * already correctly gated. Centralizing the check here means both callers
 * are correct by construction.
 */
export async function getGameReviewData(gameId: string, userId: string): Promise<GameReviewData | null> {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    include: {
      moves: { orderBy: { ply: "asc" } },
      keyMoments: { orderBy: { sortIndex: "asc" }, include: { reflection: true } },
    },
  });
  if (!game || game.userId !== userId) return null;

  return {
    game: {
      id: game.id,
      platform: game.platform,
      whitePlayer: game.whitePlayer,
      blackPlayer: game.blackPlayer,
      userColor: game.userColor,
      result: game.result,
      playedAt: game.playedAt ? game.playedAt.toISOString() : null,
      timeControl: game.timeControl,
      opening: game.opening,
      analysisStatus: game.analysisStatus,
      analysisProgress: game.analysisProgress,
      analysisError: game.analysisError,
    },
    moves: game.moves.map((m) => ({
      ply: m.ply,
      moveNumber: m.moveNumber,
      color: m.color,
      san: m.san,
      uci: m.uci,
      fenBefore: m.fenBefore,
      fenAfter: m.fenAfter,
    })),
    keyMoments: game.keyMoments.map((km) => toClientView(km, km.reflection)),
  };
}
