import { describe, it, expect } from "vitest";
import { explanationSummary, firstSentence } from "./explanation-summary";
import type { StructuredExplanation } from "@/lib/types";

function explanation(overrides: Partial<StructuredExplanation> = {}): StructuredExplanation {
  return {
    whatYourMoveDid: "Nd4 heads for a central outpost, eyeing b3 and f5.",
    whatItMissed: "The bishop on g7 covers d4 all the way down the diagonal. Bxd4 wins the knight.",
    whyBestIsBetter: "Nc2 reaches the same square by a safe route. The line runs Nc2 Rb8 Nd4.",
    remember: "Trace the diagonal through a square before parking a piece on it.",
    replayNote: "You played Nd4 again.",
    concepts: ["hanging piece"],
    approximate: false,
    ...overrides,
  };
}

describe("firstSentence", () => {
  it("returns the first sentence of a passage", () => {
    expect(firstSentence("One thing happened. Then another thing happened.")).toBe(
      "One thing happened."
    );
  });

  it("returns the whole text when there is only one sentence", () => {
    expect(firstSentence("Just the one sentence here.")).toBe("Just the one sentence here.");
  });

  it("does not split chess notation containing a period", () => {
    // A move number is a period followed by a lowercase move, not a
    // sentence break — splitting there would produce "The line runs 1."
    expect(firstSentence("The line runs 1. e4 e5 2. Nf3 and White is fine.")).toBe(
      "The line runs 1. e4 e5 2. Nf3 and White is fine."
    );
  });

  it("handles text with no terminal punctuation at all", () => {
    expect(firstSentence("  no punctuation  ")).toBe("no punctuation");
  });
});

describe("explanationSummary", () => {
  it("returns the generated summary when there is one", () => {
    const summary = explanationSummary(
      explanation({
        summary: {
          headline: "  The g7 bishop covers d4.  ",
          betterMove: "Nc2 gets there safely.",
          takeaway: "Trace the diagonal first.",
        },
      })
    );
    expect(summary).toEqual({
      headline: "The g7 bishop covers d4.",
      betterMove: "Nc2 gets there safely.",
      takeaway: "Trace the diagonal first.",
    });
  });

  it("derives a summary for an explanation stored before the layer existed", () => {
    const summary = explanationSummary(explanation());
    expect(summary.headline).toBe("The bishop on g7 covers d4 all the way down the diagonal.");
    expect(summary.betterMove).toBe("Nc2 reaches the same square by a safe route.");
    expect(summary.takeaway).toBe("Trace the diagonal through a square before parking a piece on it.");
  });

  it("derives from a partially filled summary rather than showing blank lines", () => {
    const summary = explanationSummary(
      explanation({
        summary: { headline: "Something", betterMove: "", takeaway: "  " },
      })
    );
    expect(summary.betterMove).toBe("Nc2 reaches the same square by a safe route.");
    expect(summary.takeaway).not.toBe("");
  });

  it("leads with what the move did when nothing was actually missed", () => {
    // "Nothing — this was the strongest move available" is a true answer and
    // a useless headline, so a best-move reveal has to lead elsewhere.
    const summary = explanationSummary(
      explanation({
        whatItMissed: "Nothing — this was the strongest move available.",
        whatYourMoveDid: "Kf8 steps the king off the back rank. Nothing is left to mate with.",
      })
    );
    expect(summary.headline).toBe("Kf8 steps the king off the back rank.");
  });
});
