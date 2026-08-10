import { describe, it, expect } from "vitest";
import {
  detectCandidates,
  detectPositiveCandidates,
  selectKeyMoments,
  backfillCandidates,
  computeImportance,
  applyTimeTroubleAdjustment,
  DEFAULT_THRESHOLDS,
  type PlyEval,
  type MomentCandidate,
} from "./key-moments";
import type { ParsedMove } from "@/lib/types";

// All tests use userColor "white" so White-perspective cp == mover-perspective cp,
// keeping the fixtures easy to read. All "loss"/"gain" expectations are now in
// win-probability percentage points (0-100), not raw centipawns — see
// winProbLoss in lib/chess/eval.ts. Exact values below were computed from the
// same sigmoid the implementation uses.
const USER_COLOR = "white";

function move(ply: number): ParsedMove {
  const color = ply % 2 === 1 ? "white" : "black";
  return {
    ply,
    moveNumber: Math.ceil(ply / 2),
    color,
    san: `move${ply}`,
    uci: "e2e4",
    fenBefore: "startpos",
    fenAfter: "startpos",
  };
}

function evalFor(ply: number, beforeCp: number, afterCp: number): PlyEval {
  return { ply, before: { cp: beforeCp }, after: { cp: afterCp } };
}

describe("detectCandidates — win-probability based significance", () => {
  it("only flags the user's own moves", () => {
    const moves = [move(1), move(2)];
    const evals = [evalFor(1, 0, -200), evalFor(2, -200, 400)];
    const candidates = detectCandidates(evals, moves, "white");
    expect(candidates).toHaveLength(1);
    expect(candidates[0].ply).toBe(1);
  });

  it("does not flag losses below the win-probability threshold", () => {
    const moves = [move(1)];
    const evals = [evalFor(1, 0, -40)]; // ~3.7 win-probability points, below flagLoss (8)
    expect(detectCandidates(evals, moves, USER_COLOR)).toHaveLength(0);
  });

  it("flags losses at or above the win-probability threshold", () => {
    const moves = [move(1)];
    const evals = [evalFor(1, 0, -100)]; // ~9.1 win-probability points, above flagLoss (8)
    expect(detectCandidates(evals, moves, USER_COLOR)).toHaveLength(1);
  });

  it("REGRESSION: a large centipawn swing between two already-decisive positions is NOT flagged", () => {
    // The exact reported bug: +6.4 to +6.2 pawns — both completely winning,
    // nothing practically changed. Using a clean 100cp swing at a decisive
    // level (700cp -> 600cp, ~2.8 win-probability points) to demonstrate.
    const moves = [move(1)];
    const evals = [evalFor(1, 700, 600)];
    expect(detectCandidates(evals, moves, USER_COLOR)).toHaveLength(0);
  });

  it("a much smaller centipawn swing near equality IS flagged, because it changes the practical outcome", () => {
    // The same 100cp raw swing as above, but starting near equality
    // (50cp -> -50cp, ~9.2 win-probability points) — this actually flips
    // who's practically better, so it must be flagged even though the raw
    // centipawn delta is identical to the decisive-position case above.
    const moves = [move(1)];
    const evals = [evalFor(1, 50, -50)];
    expect(detectCandidates(evals, moves, USER_COLOR)).toHaveLength(1);
  });
});

describe("selectKeyMoments — grouping downstream fallout", () => {
  it("merges two immediately consecutive user blunders, keeping the larger loss", () => {
    const moves = [move(1), move(2), move(3), move(4), move(5)];
    const evals = [
      evalFor(1, 0, 0),
      evalFor(2, 0, 0),
      evalFor(3, 0, -120), // user blunder #1 (~10.9 pts)
      evalFor(4, -120, -120),
      evalFor(5, -120, -470), // user blunder #2 (~24.1 pts), immediately next user move
    ];
    const candidates = detectCandidates(evals, moves, USER_COLOR);
    expect(candidates.map((c) => c.ply)).toEqual([3, 5]);

    const selected = selectKeyMoments(candidates);
    // Consecutive user moves (gap of 2 plies) collapse into a single moment —
    // the larger of the two losses.
    expect(selected).toHaveLength(1);
    expect(selected[0].ply).toBe(5);
  });

  it("keeps two separate blunders that are not consecutive", () => {
    const moves = [move(1), move(2), move(3), move(4), move(5), move(6), move(7)];
    const evals = [
      evalFor(1, 0, 0),
      evalFor(2, 0, 0),
      evalFor(3, 0, -120), // blunder #1 (~10.9 pts)
      evalFor(4, -120, -120),
      evalFor(5, -120, -120), // clean move in between (no loss)
      evalFor(6, -120, -120),
      evalFor(7, -120, -320), // blunder #2 (~15.6 pts), separated by a stable user move
    ];
    const candidates = detectCandidates(evals, moves, USER_COLOR);
    expect(candidates.map((c) => c.ply)).toEqual([3, 7]);

    const selected = selectKeyMoments(candidates);
    expect(selected.map((c) => c.ply)).toEqual([3, 7]);
  });

  it("drops fallout from an already-lost position a few moves after the original mistake", () => {
    const moves = [move(1), move(2), move(3), move(4), move(5), move(6), move(7), move(8), move(9)];
    const evals = [
      evalFor(1, 0, 0),
      evalFor(2, 0, 0),
      evalFor(3, 0, 0),
      evalFor(4, 0, 0),
      evalFor(5, 0, -400), // original mistake: position goes from fine to lost (~31.4 pts)
      evalFor(6, -400, -400),
      evalFor(7, -400, -420), // small (~1.1 pts) — below flagLoss, not even a candidate
      evalFor(8, -420, -420),
      evalFor(9, -420, -700), // fallout: already lost, downstream of ply 5's mistake (~10.5 pts)
    ];
    const candidates = detectCandidates(evals, moves, USER_COLOR);
    expect(candidates.map((c) => c.ply)).toEqual([5, 9]);

    const selected = selectKeyMoments(candidates);
    expect(selected.map((c) => c.ply)).toEqual([5]);
  });
});

describe("backfillCandidates", () => {
  it("adds lower-severity candidates when too few crossed the flag threshold", () => {
    const moves = [move(1), move(3), move(5), move(7), move(9), move(11), move(13)];
    const evals = [
      evalFor(1, 0, -100), // crosses flagLoss (~9.1 pts) — the only "real" candidate
      evalFor(3, -100, -100), // no loss
      evalFor(5, -100, -150), // ~4.4 pts — below flagLoss but above minLoss (4)
      evalFor(7, -150, -150), // no loss
      evalFor(9, -150, -210), // ~5.0 pts — also above minLoss
      evalFor(11, -210, -270), // ~4.6 pts — also above minLoss
      evalFor(13, -270, -340), // ~4.8 pts — also above minLoss
    ];
    const primary = selectKeyMoments(detectCandidates(evals, moves, USER_COLOR));
    expect(primary).toHaveLength(1);

    const filled = backfillCandidates(primary, evals, moves, USER_COLOR);
    expect(filled.length).toBeGreaterThanOrEqual(DEFAULT_THRESHOLDS.minMoments);
    expect(filled.map((c) => c.ply)).toContain(1);
  });

  it("does not backfill when enough candidates were already found", () => {
    // Well-separated (gap > 6) so none merge or get dropped as fallout.
    const moves = [move(1), move(7), move(13)];
    const evals = [evalFor(1, 0, -150), evalFor(7, 0, -150), evalFor(13, 0, -150)];
    const primary = selectKeyMoments(detectCandidates(evals, moves, USER_COLOR));
    expect(primary).toHaveLength(3);

    const filled = backfillCandidates(primary, evals, moves, USER_COLOR, {
      ...DEFAULT_THRESHOLDS,
      minMoments: 2,
    });
    expect(filled).toBe(primary);
  });

  it("no longer excludes back-filled candidates purely for being ply-adjacent to an existing pick", () => {
    // Qc7 (ply 3) sits right next to the already-selected Rfd8 (ply 5) — in
    // the real strategic-mistake demo game this exact shape caused the
    // minimum guarantee to silently fail before the fix.
    const moves = [move(1), move(3), move(5), move(7), move(9)];
    const evals = [
      evalFor(1, 0, 0),
      evalFor(3, 0, -70), // ~6.4 pts — crosses minLoss, adjacent to the ply-5 pick
      evalFor(5, 0, -110), // ~10.0 pts — the "primary" pick (crosses flagLoss)
      evalFor(7, -110, -110),
      evalFor(9, 0, -75), // ~6.9 pts — also crosses minLoss
    ];
    const primary = selectKeyMoments(detectCandidates(evals, moves, USER_COLOR));
    expect(primary.map((c) => c.ply)).toEqual([5]);

    const filled = backfillCandidates(primary, evals, moves, USER_COLOR, {
      ...DEFAULT_THRESHOLDS,
      minMoments: 3,
    });
    expect(filled.map((c) => c.ply)).toEqual([3, 5, 9]);
  });

  it("falls back to positive (well-played) moments when a game is too clean for more mistakes", () => {
    const moves = [move(1), move(3), move(5)];
    const evals = [
      evalFor(1, 0, 5), // trivial, not even a candidate
      evalFor(3, 5, 200), // a big improvement (~17 pts) — punished an opponent error
      evalFor(5, 200, 205), // trivial
    ];
    const primary = selectKeyMoments(detectCandidates(evals, moves, USER_COLOR));
    expect(primary).toHaveLength(0);

    const filled = backfillCandidates(primary, evals, moves, USER_COLOR, {
      ...DEFAULT_THRESHOLDS,
      minMoments: 1,
    });
    expect(filled).toHaveLength(1);
    expect(filled[0].ply).toBe(3);
    expect(filled[0].kind).toBe("positive");
  });

  it("REGRESSION: does not pad with practically meaningless swings just to hit the minimum — showing fewer is correct", () => {
    // Every swing here is under a single win-probability point — genuinely
    // nothing meaningful happened in this game. The old behavior (a hard
    // floor of 0) would have padded all the way to minMoments regardless;
    // the fix allows falling short instead of wasting the player's time.
    const moves = [move(1), move(3), move(5)];
    const evals = [evalFor(1, 0, -5), evalFor(3, -5, -8), evalFor(5, -8, -12)];
    const primary = selectKeyMoments(detectCandidates(evals, moves, USER_COLOR));
    expect(primary).toHaveLength(0);

    const filled = backfillCandidates(primary, evals, moves, USER_COLOR, {
      ...DEFAULT_THRESHOLDS,
      minMoments: 3,
    });
    expect(filled).toHaveLength(0);
  });

  it("still guarantees the minimum via the noise-floor pass when swings are small but above the noise floor", () => {
    const moves = [move(1), move(3), move(5)];
    // Each swing is ~1.8 win-probability points — below minLoss (4), so
    // pass 1 won't catch them, but above the absolute noise floor (1.5),
    // so pass 3 should still pick them up rather than giving up entirely.
    const evals = [evalFor(1, 0, -20), evalFor(3, -20, -40), evalFor(5, -40, -60)];
    const primary = selectKeyMoments(detectCandidates(evals, moves, USER_COLOR));
    expect(primary).toHaveLength(0);

    const filled = backfillCandidates(primary, evals, moves, USER_COLOR, {
      ...DEFAULT_THRESHOLDS,
      minMoments: 3,
    });
    expect(filled).toHaveLength(3);
  });
});

describe("detectPositiveCandidates", () => {
  it("flags moves that significantly improved the position", () => {
    const moves = [move(1)];
    const evals = [evalFor(1, 0, 200)]; // ~17.6 win-probability points, above default minGain (13)
    const candidates = detectPositiveCandidates(evals, moves, USER_COLOR);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].kind).toBe("positive");
    expect(candidates[0].loss).toBeLessThan(0);
    expect(Math.abs(candidates[0].loss)).toBeGreaterThanOrEqual(DEFAULT_THRESHOLDS.minGain);
  });

  it("ignores small gains below the threshold", () => {
    const moves = [move(1)];
    const evals = [evalFor(1, 0, 50)]; // ~4.6 points, below minGain (13)
    expect(detectPositiveCandidates(evals, moves, USER_COLOR)).toHaveLength(0);
  });

  it("only considers the user's own moves", () => {
    const moves = [move(1), move(2)];
    const evals = [evalFor(1, 0, 0), evalFor(2, 0, 300)];
    expect(detectPositiveCandidates(evals, moves, "white")).toHaveLength(0);
  });
});

describe("computeImportance", () => {
  it("ranks a large blunder with a mate as CRITICAL", () => {
    const result = computeImportance({
      loss: 60, // large win-probability swing
      classification: "BLUNDER",
      hadMateBefore: false,
      allowsMateAfter: true,
      secondBestGap: null,
    });
    expect(result.tier).toBe("CRITICAL");
    expect(result.score).toBeGreaterThanOrEqual(65);
  });

  it("ranks a tiny inaccuracy as MINOR", () => {
    const result = computeImportance({
      loss: 6,
      classification: "INACCURACY",
      hadMateBefore: false,
      allowsMateAfter: false,
      secondBestGap: 200,
    });
    expect(result.tier).toBe("MINOR");
  });

  it("gives a complexity bonus when the top two engine lines are close", () => {
    const complex = computeImportance({
      loss: 20,
      classification: "MISTAKE",
      hadMateBefore: false,
      allowsMateAfter: false,
      secondBestGap: 10,
    });
    const simple = computeImportance({
      loss: 20,
      classification: "MISTAKE",
      hadMateBefore: false,
      allowsMateAfter: false,
      secondBestGap: 300,
    });
    expect(complex.score).toBeGreaterThan(simple.score);
  });

  it("never exceeds a score of 100", () => {
    const result = computeImportance({
      loss: 10_000,
      classification: "BLUNDER",
      hadMateBefore: true,
      allowsMateAfter: true,
      secondBestGap: 0,
    });
    expect(result.score).toBeLessThanOrEqual(100);
  });
});

function candidate(overrides: Partial<MomentCandidate> & { ply: number }): MomentCandidate {
  return {
    loss: 10,
    reason: "test",
    beforeForMover: { cp: 0 },
    afterForMover: { cp: -100 },
    kind: "mistake",
    ...overrides,
  };
}

describe("applyTimeTroubleAdjustment", () => {
  it("is a no-op when the game wasn't lost on time", () => {
    const candidates = [candidate({ ply: 5 })];
    const result = applyTimeTroubleAdjustment(
      candidates,
      [move(5)],
      USER_COLOR,
      new Map([[5, 10]]),
      false
    );
    expect(result).toEqual({ candidates, timeTroublePly: null, clockSecondsAtTimeTrouble: null });
  });

  it("is a no-op when there's no low-clock data for the user's moves", () => {
    const candidates = [candidate({ ply: 5 })];
    const result = applyTimeTroubleAdjustment(
      candidates,
      [move(5)],
      USER_COLOR,
      new Map([[5, 120]]), // plenty of time
      true
    );
    expect(result.timeTroublePly).toBeNull();
    expect(result.candidates).toEqual(candidates);
  });

  it("suppresses a low-clock candidate when the position was still fine beforehand", () => {
    const candidates = [
      candidate({ ply: 5, beforeForMover: { cp: 20 }, afterForMover: { cp: -80 } }),
    ];
    const result = applyTimeTroubleAdjustment(
      candidates,
      [move(5)],
      USER_COLOR,
      new Map([[5, 8]]), // 8 seconds left — severe time trouble
      true
    );
    expect(result.candidates).toHaveLength(0);
    expect(result.timeTroublePly).toBe(5);
    expect(result.clockSecondsAtTimeTrouble).toBe(8);
  });

  it("keeps a low-clock candidate when the position was already clearly lost", () => {
    const candidates = [
      candidate({ ply: 5, beforeForMover: { cp: -400 }, afterForMover: { cp: -700 } }),
    ];
    const result = applyTimeTroubleAdjustment(
      candidates,
      [move(5)],
      USER_COLOR,
      new Map([[5, 8]]),
      true
    );
    expect(result.candidates).toHaveLength(1);
    // Already covered at that ply, so no separate injection needed.
    expect(result.timeTroublePly).toBeNull();
  });

  it("picks the single most severe (lowest-clock) ply to inject when several are low", () => {
    const candidates: MomentCandidate[] = [];
    const result = applyTimeTroubleAdjustment(
      candidates,
      [move(5), move(7), move(9)],
      USER_COLOR,
      new Map([
        [5, 25],
        [7, 12],
        [9, 20],
      ]),
      true
    );
    expect(result.timeTroublePly).toBe(7);
    expect(result.clockSecondsAtTimeTrouble).toBe(12);
  });

  it("only considers the user's own moves for time trouble", () => {
    const candidates: MomentCandidate[] = [];
    const result = applyTimeTroubleAdjustment(
      candidates,
      [move(6)], // black move; USER_COLOR is white
      USER_COLOR,
      new Map([[6, 2]]),
      true
    );
    expect(result.timeTroublePly).toBeNull();
  });
});
