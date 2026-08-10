import { prisma } from "@/lib/db";
import { moveLoss, toPerspective } from "@/lib/chess/eval";
import { scoreFrom, ratingFromMoveLosses } from "@/server/rating";
import type { Classification, Color, ReplayVerdict } from "@/lib/types";
import type { GameSummaryInput, SummaryMistake } from "./types";

const MOVE_LOSS_CAP_CP = 400;
const MISTAKE_TIER: ReadonlySet<string> = new Set(["MISTAKE", "BLUNDER", "MISSED_OPPORTUNITY"]);
const GOOD_TIER: ReadonlySet<string> = new Set(["BEST", "GOOD"]);
const HIGH_CONFIDENCE_THRESHOLD = 4;

/**
 * Gathers everything needed to generate a whole-game summary. Returns null
 * if the game doesn't exist, isn't owned by this user, has no key moments,
 * or — critically — isn't actually fully reviewed yet. The summary is only
 * meaningful once every key moment has a reflection; the caller (the
 * summary API route) uses a null return to mean "not ready."
 */
export async function buildGameSummaryInput(gameId: string, userId: string): Promise<GameSummaryInput | null> {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    include: {
      keyMoments: {
        orderBy: { sortIndex: "asc" },
        include: { reflection: true, move: { select: { color: true, moveNumber: true } } },
      },
    },
  });
  if (!game || game.userId !== userId) return null;
  if (game.keyMoments.length === 0) return null;
  const allReviewed = game.keyMoments.every((km) => km.reviewStatus === "REVIEWED" && km.reflection);
  if (!allReviewed) return null;

  const userColor = game.userColor as Color;

  const mistakes: SummaryMistake[] = [];
  let goodMomentCount = 0;
  const losses: number[] = [];
  const tagFrequency: Record<string, number> = {};
  let highConfidenceMistakeCount = 0;

  for (const km of game.keyMoments) {
    const reflection = km.reflection!;
    const tags = JSON.parse(reflection.tags) as string[];
    for (const tag of tags) tagFrequency[tag] = (tagFrequency[tag] ?? 0) + 1;

    if (km.classification !== "FORCED" && km.classification !== "TIME_TROUBLE") {
      const mover = km.move.color as Color;
      const bestBefore = toPerspective(scoreFrom(km.evalBeforeCp, km.evalBeforeMate), mover);
      const afterPlayed = toPerspective(scoreFrom(km.evalAfterCp, km.evalAfterMate), mover);
      losses.push(Math.min(MOVE_LOSS_CAP_CP, Math.max(0, moveLoss(bestBefore, afterPlayed))));
    }

    if (GOOD_TIER.has(km.classification)) goodMomentCount++;

    if (MISTAKE_TIER.has(km.classification)) {
      if (reflection.confidence >= HIGH_CONFIDENCE_THRESHOLD) highConfidenceMistakeCount++;
      const concepts = (JSON.parse(km.conceptHighlights) as { concept: string }[]).map((c) => c.concept);
      mistakes.push({
        ply: km.ply,
        moveNumber: km.move.moveNumber,
        color: km.move.color as "white" | "black",
        san: km.originalSan,
        classification: km.classification as Classification,
        concepts,
        confidence: reflection.confidence,
        tags,
        replayVerdict: reflection.replayVerdict as ReplayVerdict | null,
        thoughts: reflection.thoughts,
      });
    }
  }

  return {
    whitePlayer: game.whitePlayer,
    blackPlayer: game.blackPlayer,
    userColor,
    result: game.result,
    terminationReason: game.terminationReason,
    totalKeyMoments: game.keyMoments.length,
    mistakes,
    goodMomentCount,
    estimatedRating: ratingFromMoveLosses(losses),
    tagFrequency,
    highConfidenceMistakeCount,
  };
}
