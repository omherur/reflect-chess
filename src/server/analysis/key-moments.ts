import { scoreToComparable, toPerspective, winProbLoss } from "@/lib/chess/eval";
import type { Classification, Color, ImportanceTier, ParsedMove, Score } from "@/lib/types";

/**
 * Pure key-moment selection logic, separated from the engine pipeline so it
 * can be unit-tested with synthetic evals.
 *
 * Significance is measured in WIN-PROBABILITY percentage points (via
 * winProbLoss), not raw centipawns. A large cp swing between two already-
 * decisive positions (e.g. +6.4 to +6.2) barely moves the practical outcome
 * and should not qualify as a key moment; a much smaller cp swing near
 * equality (e.g. +0.3 to -0.3) can flip the practical outcome and should be
 * weighted as highly significant. All `loss`/`gain` values below are on a
 * 0-100 scale (percentage points of win probability), not pawns.
 */

export interface PlyEval {
  ply: number;
  /** Eval of the position BEFORE this ply's move, White's perspective. */
  before: Score;
  /** Eval of the position AFTER this ply's move, White's perspective. */
  after: Score;
}

export interface MomentCandidate {
  ply: number;
  /** Win-probability loss (percentage points, 0-100) from the mover's perspective (negative = a gain). */
  loss: number;
  reason: string;
  /** Mover-perspective evals, for downstream grouping decisions. */
  beforeForMover: Score;
  afterForMover: Score;
  /** "mistake" moments lost ground; "positive" moments are worth reinforcing. */
  kind: "mistake" | "positive";
}

export interface DetectionThresholds {
  /** Minimum loss (cp) for a move to be flagged in the quick scan. */
  flagLoss: number;
  /** Losses below this are never interesting, even when back-filling. */
  minLoss: number;
  /** Minimum cp gain for a move to count as a "well-played" positive moment. */
  minGain: number;
  minMoments: number;
  maxMoments: number;
}

// Tuned against the win-probability curve (see winProbLoss) so behavior near
// equality roughly matches the old cp-based thresholds (a 90cp swing at
// equality is ~8 win-probability points), while swings between two already-
// decisive positions naturally score far lower and stop qualifying.
export const DEFAULT_THRESHOLDS: DetectionThresholds = {
  flagLoss: 8,
  minLoss: 4,
  minGain: 13,
  minMoments: 5,
  maxMoments: 9,
};

/**
 * Find every user move whose evaluation loss crosses the flag threshold,
 * with a human-readable reason.
 */
export function detectCandidates(
  evals: PlyEval[],
  moves: ParsedMove[],
  userColor: Color,
  thresholds: DetectionThresholds = DEFAULT_THRESHOLDS
): MomentCandidate[] {
  const byPly = new Map(moves.map((m) => [m.ply, m]));
  const candidates: MomentCandidate[] = [];

  for (const e of evals) {
    const move = byPly.get(e.ply);
    if (!move || move.color !== userColor) continue;

    const before = toPerspective(e.before, userColor);
    const after = toPerspective(e.after, userColor);
    const loss = winProbLoss(before, after);
    if (loss < thresholds.flagLoss) continue;

    candidates.push({
      ply: e.ply,
      loss,
      reason: buildReason(before, after, loss),
      beforeForMover: before,
      afterForMover: after,
      kind: "mistake",
    });
  }
  return candidates;
}

/**
 * Find user moves that significantly IMPROVED their position — a proxy for
 * "well-played, worth reinforcing positively": either they found a strong
 * idea in a sharp position, or they punished an opponent's mistake. These
 * only get used to back-fill a game that's too clean to hit the minimum
 * moment count from mistakes alone.
 */
export function detectPositiveCandidates(
  evals: PlyEval[],
  moves: ParsedMove[],
  userColor: Color,
  thresholds: DetectionThresholds = DEFAULT_THRESHOLDS
): MomentCandidate[] {
  const byPly = new Map(moves.map((m) => [m.ply, m]));
  const candidates: MomentCandidate[] = [];

  for (const e of evals) {
    const move = byPly.get(e.ply);
    if (!move || move.color !== userColor) continue;

    const before = toPerspective(e.before, userColor);
    const after = toPerspective(e.after, userColor);
    const gain = winProbLoss(after, before);
    if (gain < thresholds.minGain) continue;

    const pawnGain = Math.abs(scoreToComparable(after) - scoreToComparable(before)) / 100;
    candidates.push({
      ply: e.ply,
      loss: -gain,
      reason: `A strong, precise move that improved your position by about ${pawnGain.toFixed(1)} pawns — your practical winning chances rose by about ${gain.toFixed(0)} percentage points.`,
      beforeForMover: before,
      afterForMover: after,
      kind: "positive",
    });
  }
  return candidates;
}

/** `winProbLossPoints` is percentage points of win probability (0-100), not pawns. */
function buildReason(before: Score, after: Score, winProbLossPoints: number): string {
  const hadMate = before.mate !== undefined && before.mate > 0;
  const allowsMate = after.mate !== undefined && after.mate < 0;
  const beforeCp = scoreToComparable(before);
  const afterCp = scoreToComparable(after);
  const pawnSwing = Math.abs(beforeCp - afterCp) / 100;

  if (hadMate && after.mate === undefined) {
    return `A forced mate in ${before.mate} was available but the move let it slip.`;
  }
  if (allowsMate) {
    return `The move allowed a forced mate in ${Math.abs(after.mate!)}.`;
  }
  if (beforeCp >= 250 && afterCp < 100) {
    return `A winning advantage slipped away (about ${pawnSwing.toFixed(1)} pawns) — your practical winning chances dropped by about ${winProbLossPoints.toFixed(0)} percentage points.`;
  }
  if (winProbLossPoints >= 30) {
    return `The evaluation swung heavily against you — your practical winning chances dropped by about ${winProbLossPoints.toFixed(0)} percentage points.`;
  }
  return `Your practical winning chances dropped by about ${winProbLossPoints.toFixed(0)} percentage points.`;
}

/**
 * Group flags that are downstream of the same original mistake, then pick
 * the 3-7 most meaningful moments in game order.
 *
 * Grouping rules:
 *  - Two flagged user moves within 2 plies of each other (i.e. consecutive
 *    user moves) are treated as one sequence — keep the larger loss.
 *  - A flag in an already-lost position (mover was down ≥ 300cp before the
 *    move) within 6 plies of a kept flag that created that lost position is
 *    treated as fallout from the original mistake and dropped.
 */
export function selectKeyMoments(
  candidates: MomentCandidate[],
  thresholds: DetectionThresholds = DEFAULT_THRESHOLDS
): MomentCandidate[] {
  const sorted = [...candidates].sort((a, b) => a.ply - b.ply);
  const kept: MomentCandidate[] = [];

  for (const cand of sorted) {
    const prev = kept[kept.length - 1];
    if (prev) {
      const gap = cand.ply - prev.ply;
      if (gap <= 2) {
        // Same sequence of consecutive user moves — keep the bigger swing.
        if (cand.loss > prev.loss) kept[kept.length - 1] = cand;
        continue;
      }
      const alreadyLost = scoreToComparable(cand.beforeForMover) <= -300;
      const prevCausedIt = scoreToComparable(prev.afterForMover) <= -300;
      if (gap <= 6 && alreadyLost && prevCausedIt) {
        // Fallout from a position the previous mistake already ruined.
        continue;
      }
    }
    kept.push(cand);
  }

  // Rank by severity and cap at the maximum.
  const top = [...kept]
    .sort((a, b) => Math.abs(b.loss) - Math.abs(a.loss))
    .slice(0, thresholds.maxMoments);

  return top.sort((a, b) => a.ply - b.ply);
}

/**
 * Below this win-probability-point threshold, a swing isn't worth surfacing
 * as a key moment even when a game is otherwise too clean to hit the
 * minimum guarantee. This is the floor pass 3 uses instead of zero — a game
 * that genuinely has nothing above this is one where showing fewer than
 * minMoments is the correct outcome, not a bug: padding with sub-noise
 * swings (the exact +6.4-to-+6.2 kind of "moment" that wastes review time)
 * would defeat the point of a minimum guarantee in the first place.
 */
const ABSOLUTE_MIN_SIGNIFICANCE = 1.5;

/**
 * Guarantees every game yields at least `minMoments` key moments (bounded
 * by how many moves the player actually made AND by there being enough
 * practically-meaningful swings at all), even a clean one, by running
 * increasingly lenient passes:
 *
 *  1. Lower the mistake-detection threshold (down to minLoss) and add the
 *     next-largest losses not already selected.
 *  2. If still short, add "positive" moments — moves that significantly
 *     improved the position — so a genuinely clean game still surfaces
 *     difficult moments the player handled well, not just mistakes.
 *  3. If STILL short (a very short or near-flawless game), drop to the
 *     absolute noise floor (not zero) and add whatever the largest
 *     remaining swings are, mistake or positive.
 *
 * If even pass 3 can't reach minMoments, the game simply didn't have that
 * many meaningful moments — returning fewer is correct, not a shortfall to
 * paper over.
 *
 * Unlike the primary pass, back-filled moments are only excluded when they
 * land on a ply already selected — the point here is to surface distinct
 * reviewable moments, not to dedupe a single tactical sequence (that
 * already happened in selectKeyMoments). The result is capped at
 * maxMoments.
 */
export function backfillCandidates(
  selected: MomentCandidate[],
  evals: PlyEval[],
  moves: ParsedMove[],
  userColor: Color,
  thresholds: DetectionThresholds = DEFAULT_THRESHOLDS
): MomentCandidate[] {
  if (selected.length >= thresholds.minMoments) return selected;
  let result = [...selected];

  // Pass 1: more mistakes, at a lower bar.
  result = appendNew(
    result,
    detectCandidates(evals, moves, userColor, { ...thresholds, flagLoss: thresholds.minLoss }),
    thresholds.minMoments
  );
  if (result.length >= thresholds.minMoments) return result.sort((a, b) => a.ply - b.ply);

  // Pass 2: well-played moments worth reinforcing positively.
  result = appendNew(
    result,
    detectPositiveCandidates(evals, moves, userColor, thresholds),
    thresholds.minMoments
  );
  if (result.length >= thresholds.minMoments) return result.sort((a, b) => a.ply - b.ply);

  // Pass 3: down to the absolute noise floor (not zero) — take whatever's
  // left, ranked by magnitude. If a game has nothing above this floor at
  // all, the loop below simply adds nothing, and the guarantee is allowed
  // to fall short.
  const noiseFloor: DetectionThresholds = { ...thresholds, flagLoss: ABSOLUTE_MIN_SIGNIFICANCE };
  const anyMistakes = detectCandidates(evals, moves, userColor, noiseFloor);
  const anyPositive = detectPositiveCandidates(evals, moves, userColor, {
    ...thresholds,
    minGain: ABSOLUTE_MIN_SIGNIFICANCE,
  });
  const everything = [...anyMistakes, ...anyPositive].sort(
    (a, b) => Math.abs(b.loss) - Math.abs(a.loss)
  );
  result = appendNew(result, everything, thresholds.minMoments);

  return result.sort((a, b) => a.ply - b.ply);
}

function appendNew(
  base: MomentCandidate[],
  extras: MomentCandidate[],
  minMoments: number
): MomentCandidate[] {
  const result = [...base];
  const taken = new Set(result.map((c) => c.ply));
  const sorted = [...extras].sort((a, b) => Math.abs(b.loss) - Math.abs(a.loss));
  for (const extra of sorted) {
    if (result.length >= minMoments) break;
    if (taken.has(extra.ply)) continue;
    result.push(extra);
    taken.add(extra.ply);
  }
  return result;
}

/** A clock reading at or below this many seconds counts as severe time trouble. */
export const LOW_CLOCK_SECONDS = 30;

export interface TimeTroubleAdjustment {
  candidates: MomentCandidate[];
  /** Ply to inject a TIME_TROUBLE moment at, or null if none is warranted. */
  timeTroublePly: number | null;
  clockSecondsAtTimeTrouble: number | null;
}

/**
 * When the game was lost on time, two things should happen:
 *  1. Don't flag the player's low-clock moves as tactical blunders if the
 *     position was still fine beforehand — a rushed move under time
 *     pressure in an otherwise-okay position isn't the same failure as a
 *     genuine miscalculation, and flagging it that way teaches the wrong
 *     lesson.
 *  2. Surface ONE dedicated time-management moment at the player's most
 *     severe low-clock point, so the real story (they ran out of time) gets
 *     reflected on directly instead of being silently absorbed into
 *     misleading tactical verdicts.
 *
 * A no-op when the game wasn't lost on time or no clock data is available.
 */
export function applyTimeTroubleAdjustment(
  candidates: MomentCandidate[],
  moves: ParsedMove[],
  userColor: Color,
  clockByPly: Map<number, number>,
  isTimeLoss: boolean
): TimeTroubleAdjustment {
  if (!isTimeLoss) {
    return { candidates, timeTroublePly: null, clockSecondsAtTimeTrouble: null };
  }

  const lowClockPlies = moves
    .filter((m) => m.color === userColor && (clockByPly.get(m.ply) ?? Infinity) <= LOW_CLOCK_SECONDS)
    .map((m) => m.ply);

  if (lowClockPlies.length === 0) {
    return { candidates, timeTroublePly: null, clockSecondsAtTimeTrouble: null };
  }

  const lowSet = new Set(lowClockPlies);
  const filtered = candidates.filter((c) => {
    if (!lowSet.has(c.ply)) return true;
    // Keep it anyway if the position was already clearly lost beforehand —
    // that's a real mistake regardless of the clock.
    return scoreToComparable(c.beforeForMover) <= -300;
  });

  let worstPly = lowClockPlies[0];
  let worstClock = clockByPly.get(worstPly)!;
  for (const ply of lowClockPlies) {
    const clk = clockByPly.get(ply)!;
    if (clk < worstClock) {
      worstClock = clk;
      worstPly = ply;
    }
  }

  // Already covered by a kept candidate at that exact ply — no need to inject.
  const alreadyCovered = filtered.some((c) => c.ply === worstPly);

  return {
    candidates: filtered,
    timeTroublePly: alreadyCovered ? null : worstPly,
    clockSecondsAtTimeTrouble: worstClock,
  };
}

export interface ImportanceInput {
  /** Win-probability loss (percentage points, 0-100) from the mover's perspective (negative = a gain). */
  loss: number;
  classification: Classification;
  /** True if the mover had a forced mate available before the move. */
  hadMateBefore: boolean;
  /** True if the move allowed the opponent a forced mate. */
  allowsMateAfter: boolean;
  /**
   * Gap (cp-equivalent) between the engine's best line and its second-best
   * line at the position before the move — a small gap means several
   * roughly-equal tries existed, i.e. a genuinely complex decision.
   */
  secondBestGap: number | null;
}

export interface ImportanceResult {
  score: number; // 0-100
  tier: ImportanceTier;
}

/**
 * Rank how important a key moment is to review: eval swing magnitude,
 * missed forced wins/losses, tactical complexity, and how decisive the
 * classification itself already is.
 */
export function computeImportance(input: ImportanceInput): ImportanceResult {
  // loss is now win-probability percentage points (max 100), not cp — a
  // full 0-to-100 swing (e.g. hanging mate from a won position) maxes this
  // out; moderate swings near equality still earn a meaningful bonus.
  const magnitude = Math.min(Math.abs(input.loss) * 0.5, 50);

  let classificationBonus = 0;
  switch (input.classification) {
    case "BLUNDER":
      classificationBonus = 30;
      break;
    case "MISSED_OPPORTUNITY":
      classificationBonus = 25;
      break;
    case "MISTAKE":
      classificationBonus = 15;
      break;
    case "INACCURACY":
      classificationBonus = 5;
      break;
    default:
      classificationBonus = 0;
  }

  const mateBonus = input.hadMateBefore || input.allowsMateAfter ? 20 : 0;

  let complexityBonus = 0;
  if (input.secondBestGap !== null) {
    if (input.secondBestGap < 40) complexityBonus = 15;
    else if (input.secondBestGap < 100) complexityBonus = 8;
  }

  const score = Math.round(
    Math.min(100, magnitude + classificationBonus + mateBonus + complexityBonus)
  );

  const tier: ImportanceTier = score >= 65 ? "CRITICAL" : score >= 35 ? "NOTABLE" : "MINOR";

  return { score, tier };
}
