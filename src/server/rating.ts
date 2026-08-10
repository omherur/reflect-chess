import { prisma } from "@/lib/db";
import { moveLoss, toPerspective } from "@/lib/chess/eval";
import type { Color, Score } from "@/lib/types";

const RATING_MIN = 400;
const RATING_MAX = 2900;

// Key moments are a curated, blunder-biased sample (selection guarantees a
// minimum count by backfilling with a mix of notable and clean moves) —
// not a random sample of every move in the game. A single mate-ending
// blunder can also make moveLoss's mate-scale comparable value spike to
// roughly ±100,000. Both effects would otherwise swamp the average, so
// each move's contribution is capped well before it reaches "blunder" is
// enough to know — this keeps one moment from dominating the whole game.
const MOVE_LOSS_CAP_CP = 400;

export function scoreFrom(cp: number | null, mate: number | null): Score {
  return mate !== null ? { mate } : { cp: cp ?? 0 };
}

/**
 * Deliberately simple, smooth mapping from average centipawn loss to a
 * rating estimate. This is a gamification curve, not a validated model —
 * the point is a scannable "roughly how strong are your decisions"
 * number, not a precise rating prediction.
 */
function ratingFromAcpl(acpl: number): number {
  const raw = 2400 - 5 * acpl;
  return Math.round(Math.min(RATING_MAX, Math.max(RATING_MIN, raw)));
}

/**
 * Same ACPL-based curve as the aggregate performance stats, exposed for
 * scoping to a single game (see src/server/summary) — one game's sample
 * size is much smaller, so this is explicitly a rough, gamified estimate,
 * not a precise per-game rating prediction.
 */
export function ratingFromMoveLosses(losses: number[]): number | null {
  if (losses.length === 0) return null;
  const capped = losses.map((l) => Math.min(MOVE_LOSS_CAP_CP, Math.max(0, l)));
  const acpl = capped.reduce((a, b) => a + b, 0) / capped.length;
  return ratingFromAcpl(acpl);
}

/** Same rating scale, driven entirely by reflection-answer quality (0-100). */
function ratingFromReflectionQuality(qualityScore: number): number {
  const raw = RATING_MIN + (qualityScore / 100) * (RATING_MAX - RATING_MIN);
  return Math.round(raw);
}

export interface MilestoneProgress {
  rating: number;
  previousMilestone: number;
  nextMilestone: number;
  progressPercent: number; // 0-100 within the current 100-point band
}

function milestoneFor(rating: number): MilestoneProgress {
  const previousMilestone = Math.floor(rating / 100) * 100;
  const nextMilestone = previousMilestone + 100;
  const progressPercent = Math.round(((rating - previousMilestone) / 100) * 100);
  return { rating, previousMilestone, nextMilestone, progressPercent };
}

/**
 * Scores one reflection's quality on a 0-100 scale. SAME_AS_ORIGINAL is the
 * ambiguous case — it means the user chose to replay their own original
 * move, which is a great sign if that move was already good, and a poor
 * sign if they failed to recognize their own mistake even after reflecting.
 */
function reflectionScore(replayVerdict: string | null, originalClassification: string): number {
  if (replayVerdict === "SAME_AS_BEST") return 100;
  if (replayVerdict === "IMPROVEMENT") return 80;
  if (replayVerdict === "SIMILAR") return 50;
  if (replayVerdict === "WORSE") return 10;
  const originalWasGood = originalClassification === "BEST" || originalClassification === "GOOD";
  return originalWasGood ? 90 : 20;
}

export interface PerformanceData {
  actualRating: number | null;
  moveQuality: {
    predictedRating: number;
    milestone: MilestoneProgress;
    sampleSize: number;
  } | null;
  reflectionQuality: {
    predictedRating: number;
    milestone: MilestoneProgress;
    averageQualityScore: number;
    sampleSize: number;
  } | null;
}

export async function getPerformanceData(userId: string): Promise<PerformanceData> {
  const latestRated = await prisma.game.findFirst({
    where: { userId, userRating: { not: null } },
    orderBy: [{ playedAt: "desc" }, { createdAt: "desc" }],
    select: { userRating: true },
  });

  const keyMoments = await prisma.keyMoment.findMany({
    where: {
      game: { userId, analysisStatus: "ANALYZED" },
      classification: { notIn: ["FORCED", "TIME_TROUBLE"] },
    },
    select: {
      evalBeforeCp: true,
      evalBeforeMate: true,
      evalAfterCp: true,
      evalAfterMate: true,
      move: { select: { color: true } },
    },
  });

  let moveQuality: PerformanceData["moveQuality"] = null;
  if (keyMoments.length > 0) {
    const losses = keyMoments.map((km) => {
      const mover = km.move.color as Color;
      const bestBefore = toPerspective(scoreFrom(km.evalBeforeCp, km.evalBeforeMate), mover);
      const afterPlayed = toPerspective(scoreFrom(km.evalAfterCp, km.evalAfterMate), mover);
      return Math.min(MOVE_LOSS_CAP_CP, Math.max(0, moveLoss(bestBefore, afterPlayed)));
    });
    const acpl = losses.reduce((a, b) => a + b, 0) / losses.length;
    const predictedRating = ratingFromAcpl(acpl);
    moveQuality = {
      predictedRating,
      milestone: milestoneFor(predictedRating),
      sampleSize: losses.length,
    };
  }

  const reflections = await prisma.reflection.findMany({
    where: { keyMoment: { game: { userId } } },
    select: { replayVerdict: true, keyMoment: { select: { classification: true } } },
  });

  let reflectionQuality: PerformanceData["reflectionQuality"] = null;
  if (reflections.length > 0) {
    const scores = reflections.map((r) => reflectionScore(r.replayVerdict, r.keyMoment.classification));
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    const predictedRating = ratingFromReflectionQuality(avg);
    reflectionQuality = {
      predictedRating,
      milestone: milestoneFor(predictedRating),
      averageQualityScore: Math.round(avg),
      sampleSize: scores.length,
    };
  }

  return {
    actualRating: latestRated?.userRating ?? null,
    moveQuality,
    reflectionQuality,
  };
}
