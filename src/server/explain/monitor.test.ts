import { describe, it, expect, vi, beforeEach } from "vitest";
import { textSimilarity, recordExplanation, getRecentExplanations, _resetForTests } from "./monitor";

beforeEach(() => {
  _resetForTests();
});

describe("textSimilarity", () => {
  it("scores genuinely distinct chess explanations as low similarity", () => {
    const a =
      "d5 strikes at White's e4 pawn immediately, before White gets to play d4 first, opening the diagonal for your bishop.";
    const b =
      "Nd4 aims for the same outpost but through a square the bishop on g7 doesn't control, so there's no piece to lose this time.";
    expect(textSimilarity(a, b)).toBeLessThan(0.3);
  });

  it("scores the reported bug's generic template wrapper as high similarity across different positions", () => {
    // The exact reported symptom: same wrapper structure, only the move/eval
    // tokens differ.
    const a = "d5 would have kept the position at a point where the position is roughly equal, rather than where Bc5 actually left it";
    const b = "Nd4 would have kept the position at a point where you are slightly better, rather than where a5 actually left it";
    expect(textSimilarity(a, b)).toBeGreaterThanOrEqual(0.55);
  });
});

describe("recordExplanation — template-fallback regression detection", () => {
  it("flags when two AI-sourced explanations for different moments are near-identical", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    recordExplanation({
      source: "ai",
      classification: "INACCURACY",
      originalSan: "Bc5",
      bestSan: "d5",
      whyBestIsBetter:
        "d5 would have kept the position at a point where the position is roughly equal, rather than where Bc5 actually left it",
    });
    recordExplanation({
      source: "ai",
      classification: "MISTAKE",
      originalSan: "Bd3",
      bestSan: "Nd4",
      whyBestIsBetter:
        "Nd4 would have kept the position at a point where you are slightly better, rather than where Bd3 actually left it",
    });
    const regressionLogs = errorSpy.mock.calls.filter((args) =>
      String(args[0]).includes("POSSIBLE TEMPLATE-FALLBACK REGRESSION")
    );
    expect(regressionLogs.length).toBe(1);
    errorSpy.mockRestore();
  });

  it("does not flag two genuinely distinct AI explanations", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    recordExplanation({
      source: "ai",
      classification: "INACCURACY",
      originalSan: "Bc5",
      bestSan: "d5",
      whyBestIsBetter:
        "d5 strikes at White's e4 pawn immediately, opening the diagonal for your light-squared bishop before White gets to play d4 first.",
    });
    recordExplanation({
      source: "ai",
      classification: "MISTAKE",
      originalSan: "Bd3",
      bestSan: "Nd4",
      whyBestIsBetter:
        "Nd4 aims for the same b3/c2/f5 outpost but reaches it through a square the enemy bishop on g7 does not control, so nothing is hanging this time.",
    });
    const regressionLogs = errorSpy.mock.calls.filter((args) =>
      String(args[0]).includes("POSSIBLE TEMPLATE-FALLBACK REGRESSION")
    );
    expect(regressionLogs.length).toBe(0);
    errorSpy.mockRestore();
  });

  it("does not flag template-sourced explanations against each other (expected to share structure)", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    recordExplanation({
      source: "template",
      classification: "INACCURACY",
      originalSan: "Bc5",
      bestSan: "d5",
      whyBestIsBetter: "d5 would have kept the position at a point where the position is roughly equal.",
    });
    recordExplanation({
      source: "template",
      classification: "MISTAKE",
      originalSan: "Bd3",
      bestSan: "Nd4",
      whyBestIsBetter: "Nd4 would have kept the position at a point where you are slightly better.",
    });
    const regressionLogs = errorSpy.mock.calls.filter((args) =>
      String(args[0]).includes("POSSIBLE TEMPLATE-FALLBACK REGRESSION")
    );
    expect(regressionLogs.length).toBe(0);
    errorSpy.mockRestore();
  });

  it("does not flag repeated calls for the same move/classification (that's just consistency, not a bug)", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    recordExplanation({
      source: "ai",
      classification: "INACCURACY",
      originalSan: "Bc5",
      bestSan: "d5",
      whyBestIsBetter: "d5 strikes at White's e4 pawn immediately, opening the diagonal for your bishop.",
    });
    recordExplanation({
      source: "ai",
      classification: "INACCURACY",
      originalSan: "Bc5",
      bestSan: "d5",
      whyBestIsBetter: "d5 strikes at White's e4 pawn immediately, opening the diagonal for your bishop.",
    });
    const regressionLogs = errorSpy.mock.calls.filter((args) =>
      String(args[0]).includes("POSSIBLE TEMPLATE-FALLBACK REGRESSION")
    );
    expect(regressionLogs.length).toBe(0);
    errorSpy.mockRestore();
  });
});

describe("getRecentExplanations", () => {
  it("returns entries newest-first, capped at the requested limit", () => {
    for (let i = 0; i < 5; i++) {
      recordExplanation({
        source: i % 2 === 0 ? "ai" : "template",
        classification: "MISTAKE",
        originalSan: `Move${i}`,
        bestSan: "Best",
        whyBestIsBetter: `explanation number ${i} with enough unique words to avoid tripping the similarity check itself`,
      });
    }
    const recent = getRecentExplanations(3);
    expect(recent.length).toBe(3);
    expect(recent[0].originalSan).toBe("Move4");
    expect(recent[2].originalSan).toBe("Move2");
  });
});
