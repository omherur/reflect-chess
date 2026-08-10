import { describe, it, expect } from "vitest";
import {
  scoreToComparable,
  toWhitePerspective,
  toPerspective,
  negateScore,
  formatScore,
  classifyMove,
  moveLoss,
  compareReplay,
  terminalMateScore,
  winProbability,
  winProbLoss,
} from "./eval";

describe("scoreToComparable", () => {
  it("passes through centipawn scores", () => {
    expect(scoreToComparable({ cp: 150 })).toBe(150);
    expect(scoreToComparable({ cp: -80 })).toBe(-80);
  });

  it("ranks a faster mate above a slower mate for the same side", () => {
    const mateIn1 = scoreToComparable({ mate: 1 });
    const mateIn5 = scoreToComparable({ mate: 5 });
    expect(mateIn1).toBeGreaterThan(mateIn5);
  });

  it("ranks any winning mate above any centipawn advantage", () => {
    expect(scoreToComparable({ mate: 10 })).toBeGreaterThan(scoreToComparable({ cp: 900 }));
  });

  it("ranks being mated below any centipawn deficit", () => {
    expect(scoreToComparable({ mate: -10 })).toBeLessThan(scoreToComparable({ cp: -900 }));
  });
});

describe("perspective conversion", () => {
  it("negateScore flips cp and mate", () => {
    expect(negateScore({ cp: 50 })).toEqual({ cp: -50 });
    expect(negateScore({ mate: 3 })).toEqual({ mate: -3 });
  });

  it("toWhitePerspective is a no-op for white to move", () => {
    expect(toWhitePerspective({ cp: 40 }, "white")).toEqual({ cp: 40 });
  });

  it("toWhitePerspective negates for black to move", () => {
    expect(toWhitePerspective({ cp: 40 }, "black")).toEqual({ cp: -40 });
  });

  it("toPerspective round-trips through both colors", () => {
    const white = { cp: 60 };
    expect(toPerspective(white, "white")).toEqual({ cp: 60 });
    expect(toPerspective(white, "black")).toEqual({ cp: -60 });
  });
});

describe("formatScore", () => {
  it("formats centipawns with sign", () => {
    expect(formatScore({ cp: 140 })).toBe("+1.4");
    expect(formatScore({ cp: -30 })).toBe("-0.3");
    expect(formatScore({ cp: 0 })).toBe("0.0");
  });

  it("formats mate scores", () => {
    expect(formatScore({ mate: 3 })).toBe("M3");
    expect(formatScore({ mate: -2 })).toBe("-M2");
  });

  it("formats a terminal checkmate sentinel distinctly", () => {
    expect(formatScore(terminalMateScore("white"))).toContain("1-0");
    expect(formatScore(terminalMateScore("black"))).toContain("0-1");
  });
});

describe("classifyMove", () => {
  it("classifies a forced move regardless of eval swing", () => {
    const result = classifyMove({
      bestBefore: { cp: 500 },
      afterPlayed: { cp: -500 },
      playedIsBest: false,
      onlyLegalMove: true,
    });
    expect(result).toBe("FORCED");
  });

  it("classifies the engine's own move as BEST", () => {
    const result = classifyMove({
      bestBefore: { cp: 20 },
      afterPlayed: { cp: 20 },
      playedIsBest: true,
      onlyLegalMove: false,
    });
    expect(result).toBe("BEST");
  });

  it("classifies a small loss as GOOD", () => {
    const result = classifyMove({
      bestBefore: { cp: 50 },
      afterPlayed: { cp: 0 },
      playedIsBest: false,
      onlyLegalMove: false,
    });
    expect(result).toBe("GOOD");
  });

  it("classifies a large loss as BLUNDER", () => {
    const result = classifyMove({
      bestBefore: { cp: 50 },
      afterPlayed: { cp: -400 },
      playedIsBest: false,
      onlyLegalMove: false,
    });
    expect(result).toBe("BLUNDER");
  });

  it("classifies a squandered winning position as MISSED_OPPORTUNITY", () => {
    const result = classifyMove({
      bestBefore: { cp: 400 },
      afterPlayed: { cp: 20 },
      playedIsBest: false,
      onlyLegalMove: false,
    });
    expect(result).toBe("MISSED_OPPORTUNITY");
  });

  it("classifies a mate that slips away as MISSED_OPPORTUNITY", () => {
    const result = classifyMove({
      bestBefore: { mate: 3 },
      afterPlayed: { cp: 10 },
      playedIsBest: false,
      onlyLegalMove: false,
    });
    expect(result).toBe("MISSED_OPPORTUNITY");
  });
});

describe("moveLoss", () => {
  it("computes centipawn-equivalent loss", () => {
    expect(moveLoss({ cp: 100 }, { cp: 40 })).toBe(60);
  });
});

describe("compareReplay", () => {
  const base = {
    replayUci: "e2e4",
    originalUci: "d2d4",
    bestUci: "e2e4",
    afterReplay: { cp: 80 },
    afterOriginal: { cp: -10 },
    bestBefore: { cp: 90 },
  };

  it("detects the replay matching the engine's best move", () => {
    expect(compareReplay(base)).toBe("SAME_AS_BEST");
  });

  it("detects the replay matching the original move", () => {
    expect(
      compareReplay({ ...base, replayUci: "d2d4", bestUci: "e2e4" })
    ).toBe("SAME_AS_ORIGINAL");
  });

  it("detects an improvement over the original", () => {
    expect(
      compareReplay({ ...base, replayUci: "g1f3", bestUci: "e2e4", afterReplay: { cp: 60 } })
    ).toBe("IMPROVEMENT");
  });

  it("detects a replay that's worse than the original", () => {
    expect(
      compareReplay({
        ...base,
        replayUci: "g1f3",
        bestUci: "e2e4",
        afterOriginal: { cp: 50 },
        afterReplay: { cp: -60 },
      })
    ).toBe("WORSE");
  });

  it("detects a similar replay", () => {
    expect(
      compareReplay({
        ...base,
        replayUci: "g1f3",
        bestUci: "e2e4",
        afterOriginal: { cp: 10 },
        afterReplay: { cp: 15 },
      })
    ).toBe("SIMILAR");
  });
});

describe("winProbability", () => {
  it("is 0.5 at equality", () => {
    expect(winProbability({ cp: 0 })).toBeCloseTo(0.5, 5);
  });

  it("increases monotonically with cp", () => {
    expect(winProbability({ cp: 200 })).toBeGreaterThan(winProbability({ cp: 100 }));
    expect(winProbability({ cp: -200 })).toBeLessThan(winProbability({ cp: -100 }));
  });

  it("saturates near 1 for a won mate and near 0 for a lost mate, regardless of distance", () => {
    expect(winProbability({ mate: 1 })).toBeCloseTo(1, 5);
    expect(winProbability({ mate: 20 })).toBeCloseTo(1, 5);
    expect(winProbability({ mate: -1 })).toBeCloseTo(0, 5);
    expect(winProbability({ mate: -20 })).toBeCloseTo(0, 5);
  });
});

describe("winProbLoss", () => {
  it("REGRESSION: a large centipawn swing between two already-decisive positions barely registers", () => {
    // The exact reported bug: +6.4 to +6.2 pawns (a 20cp swing) — both
    // completely winning, nothing practically changed.
    const loss = winProbLoss({ cp: 640 }, { cp: 620 });
    expect(loss).toBeLessThan(1);
  });

  it("a much smaller centipawn swing near equality is weighted as far more significant", () => {
    // Same 100cp raw swing in both cases — but near equality it actually
    // changes who's practically better, so it must score much higher than
    // the identical swing between two decisive positions.
    const nearEquality = winProbLoss({ cp: 50 }, { cp: -50 });
    const atExtreme = winProbLoss({ cp: 700 }, { cp: 600 });
    expect(nearEquality).toBeGreaterThan(atExtreme * 3);
  });

  it("is positive when the position got worse and negative when it improved", () => {
    expect(winProbLoss({ cp: 100 }, { cp: -100 })).toBeGreaterThan(0);
    expect(winProbLoss({ cp: -100 }, { cp: 100 })).toBeLessThan(0);
  });

  it("treats hanging a mate from a winning position as maximally significant", () => {
    const loss = winProbLoss({ cp: 500 }, { mate: -3 });
    expect(loss).toBeGreaterThan(80);
  });
});
