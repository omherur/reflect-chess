import type { Classification, Color, ReplayVerdict, Score } from "@/lib/types";

/** Large sentinel so mate scores dominate any centipawn score in comparisons. */
export const MATE_CP = 100_000;

/**
 * A position where the game has already ended in checkmate is stored as
 * cp = ±MATE_CP (there is no side to move left to attach a mate distance to).
 * This sorts correctly: being mated (-MATE_CP) is worse than any mate-in-N.
 */
export function terminalMateScore(winner: Color): Score {
  return { cp: winner === "white" ? MATE_CP : -MATE_CP };
}

/**
 * Convert a score to a single comparable centipawn-equivalent number.
 * Mate in N maps just under ±MATE_CP so that faster mates compare higher.
 */
export function scoreToComparable(score: Score): number {
  if (score.mate !== undefined) {
    return score.mate > 0 ? MATE_CP - score.mate : -MATE_CP - score.mate;
  }
  return score.cp ?? 0;
}

/**
 * Lichess's empirically-fit logistic curve mapping a centipawn score to a
 * [0, 1] win probability, from the same perspective as the input score.
 * Mate scores saturate to ~1 or ~0 automatically via scoreToComparable's
 * MATE_CP sentinel — no special-casing needed.
 */
const WIN_PROB_K = 0.00368208;

export function winProbability(score: Score): number {
  return 1 / (1 + Math.exp(-WIN_PROB_K * scoreToComparable(score)));
}

/**
 * How much a move cost in PRACTICAL winning chances, not raw centipawns —
 * the difference in win probability before and after, expressed as
 * percentage points (0-100). This is what makes a large centipawn swing
 * between two already-decisive positions (e.g. +6.4 to +6.2) score as
 * near-zero, while a much smaller swing near equality (e.g. +0.3 to -0.3)
 * scores as highly significant — because that's the actual practical
 * impact on the outcome. Both scores must be from the same perspective
 * (e.g. both already converted via toPerspective for the mover).
 */
export function winProbLoss(before: Score, after: Score): number {
  return (winProbability(before) - winProbability(after)) * 100;
}

/** Engine UCI scores are from the side to move. Normalize to White's perspective. */
export function toWhitePerspective(score: Score, sideToMove: Color): Score {
  if (sideToMove === "white") return score;
  return negateScore(score);
}

/** Convert a White-perspective score to the given player's perspective. */
export function toPerspective(whiteScore: Score, color: Color): Score {
  if (color === "white") return whiteScore;
  return negateScore(whiteScore);
}

export function negateScore(score: Score): Score {
  if (score.mate !== undefined) return { mate: -score.mate };
  return { cp: -(score.cp ?? 0) };
}

/** Format a score for display, e.g. "+1.4", "-0.3", "M3", "-M2", "#" (mated). */
export function formatScore(score: Score): string {
  if (score.mate !== undefined) {
    return score.mate > 0 ? `M${score.mate}` : `-M${Math.abs(score.mate)}`;
  }
  const cp = score.cp ?? 0;
  if (Math.abs(cp) >= MATE_CP) return cp > 0 ? "1-0 (mate)" : "0-1 (mate)";
  const pawns = cp / 100;
  const sign = pawns > 0 ? "+" : "";
  return `${sign}${pawns.toFixed(1)}`;
}

/** Practical description of a score from the given player's perspective. */
export function describeScore(scoreForPlayer: Score): string {
  if (scoreForPlayer.mate !== undefined) {
    return scoreForPlayer.mate > 0
      ? `you have a forced mate in ${scoreForPlayer.mate}`
      : `your opponent has a forced mate in ${Math.abs(scoreForPlayer.mate)}`;
  }
  const cp = scoreForPlayer.cp ?? 0;
  if (cp >= 500) return "you are completely winning";
  if (cp >= 200) return "you are clearly winning";
  if (cp >= 90) return "you are clearly better";
  if (cp >= 40) return "you are slightly better";
  if (cp > -40) return "the position is roughly equal";
  if (cp > -90) return "you are slightly worse";
  if (cp > -200) return "you are clearly worse";
  if (cp > -500) return "you are losing";
  return "you are completely lost";
}

export interface ClassifyInput {
  /** Best available eval before the move, from the mover's perspective. */
  bestBefore: Score;
  /** Eval after the played move, from the mover's perspective. */
  afterPlayed: Score;
  /** The played move matches the engine's best move. */
  playedIsBest: boolean;
  /** The mover had exactly one legal move. */
  onlyLegalMove: boolean;
}

/**
 * Classify a move by how much evaluation it gave up relative to the best move.
 * All thresholds are centipawns from the mover's perspective.
 */
export function classifyMove(input: ClassifyInput): Classification {
  if (input.onlyLegalMove) return "FORCED";
  const best = scoreToComparable(input.bestBefore);
  const played = scoreToComparable(input.afterPlayed);
  const loss = best - played;

  if (input.playedIsBest || loss < 20) return "BEST";

  // Missed opportunity: a clear win (or mate) was available but the move let
  // it slip to a roughly balanced or worse position.
  const hadMate = input.bestBefore.mate !== undefined && input.bestBefore.mate > 0;
  const hadBigEdge = best >= 250;
  const slippedAway = played < 100;
  if ((hadMate || hadBigEdge) && slippedAway && loss >= 150) {
    return "MISSED_OPPORTUNITY";
  }

  if (loss < 70) return "GOOD";
  if (loss < 150) return "INACCURACY";
  if (loss < 300) return "MISTAKE";
  return "BLUNDER";
}

/** Centipawn-equivalent loss of the played move versus the best move. */
export function moveLoss(bestBefore: Score, afterPlayed: Score): number {
  return scoreToComparable(bestBefore) - scoreToComparable(afterPlayed);
}

export interface ReplayCompareInput {
  replayUci: string;
  originalUci: string;
  bestUci: string;
  /** Mover-perspective evals after each move. */
  afterReplay: Score;
  afterOriginal: Score;
  bestBefore: Score;
}

/** Compare the user's replay move against the original move and engine best. */
export function compareReplay(input: ReplayCompareInput): ReplayVerdict {
  if (input.replayUci === input.bestUci) return "SAME_AS_BEST";
  if (input.replayUci === input.originalUci) return "SAME_AS_ORIGINAL";
  const replay = scoreToComparable(input.afterReplay);
  const original = scoreToComparable(input.afterOriginal);
  const best = scoreToComparable(input.bestBefore);
  // Within 30cp of the best move's eval counts as an improvement too.
  if (best - replay < 30) return "IMPROVEMENT";
  if (replay - original >= 70) return "IMPROVEMENT";
  if (original - replay >= 70) return "WORSE";
  return "SIMILAR";
}
