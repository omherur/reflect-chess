import { describe, it, expect } from "vitest";
import { TemplateGameSummaryProvider } from "./template-provider";
import type { GameSummaryInput, SummaryMistake } from "./types";

function mistake(overrides: Partial<SummaryMistake> = {}): SummaryMistake {
  return {
    ply: 10,
    moveNumber: 5,
    color: "white",
    san: "Nd4",
    classification: "MISTAKE",
    concepts: [],
    confidence: 3,
    tags: [],
    replayVerdict: null,
    thoughts: "I thought this was fine.",
    ...overrides,
  };
}

const BASE_INPUT: GameSummaryInput = {
  whitePlayer: "seedplayer",
  blackPlayer: "opponent99",
  userColor: "white",
  result: "0-1",
  terminationReason: "resignation",
  totalKeyMoments: 4,
  mistakes: [],
  goodMomentCount: 1,
  estimatedRating: 1450,
  tagFrequency: {},
  highConfidenceMistakeCount: 0,
};

describe("TemplateGameSummaryProvider", () => {
  const provider = new TemplateGameSummaryProvider();

  it("describes a clean game with no mistakes distinctly", async () => {
    const result = await provider.generateSummary(BASE_INPUT);
    expect(result.narrative).toMatch(/clean game/i);
    expect(result.recurringPattern).toBeNull();
    expect(result.confidenceObservation).toBeNull();
  });

  it("passes through the deterministic estimated rating unchanged, never inventing one", async () => {
    const result = await provider.generateSummary(BASE_INPUT);
    expect(result.estimatedRating).toBe(1450);
    const noRating = await provider.generateSummary({ ...BASE_INPUT, estimatedRating: null });
    expect(noRating.estimatedRating).toBeNull();
  });

  it("tallies mistakes by classification in the narrative", async () => {
    const input: GameSummaryInput = {
      ...BASE_INPUT,
      mistakes: [
        mistake({ san: "Nd4", classification: "BLUNDER" }),
        mistake({ san: "g6", classification: "MISTAKE" }),
        mistake({ san: "Bc5", classification: "MISSED_OPPORTUNITY" }),
      ],
    };
    const result = await provider.generateSummary(input);
    expect(result.narrative).toMatch(/1 blunder/i);
    expect(result.narrative).toMatch(/1 mistake/i);
    expect(result.narrative).toMatch(/1 missed opportunit/i);
    expect(result.narrative).toContain("opponent99"); // names the actual opponent, not a placeholder
  });

  it("identifies the costliest mistake as the blunder, not just the first one listed", async () => {
    const input: GameSummaryInput = {
      ...BASE_INPUT,
      mistakes: [mistake({ san: "g6", classification: "MISTAKE" }), mistake({ san: "Nd4", classification: "BLUNDER" })],
    };
    const result = await provider.generateSummary(input);
    expect(result.narrative).toContain("Nd4");
  });

  it("flags a recurring pattern from a shared tag across multiple mistakes, not a single occurrence", async () => {
    const input: GameSummaryInput = {
      ...BASE_INPUT,
      mistakes: [
        mistake({ san: "Nd4", tags: ["I was rushing"] }),
        mistake({ san: "g6", tags: ["I was rushing"] }),
        mistake({ san: "Bc5", tags: ["I felt confident"] }),
      ],
    };
    const result = await provider.generateSummary(input);
    expect(result.recurringPattern).toMatch(/I was rushing/);
    expect(result.recurringPattern).toMatch(/2 of your 3/);
  });

  it("does not claim a recurring pattern when each mistake has a different tag", async () => {
    const input: GameSummaryInput = {
      ...BASE_INPUT,
      mistakes: [
        mistake({ san: "Nd4", tags: ["I was rushing"] }),
        mistake({ san: "g6", tags: ["I felt confident"] }),
      ],
    };
    const result = await provider.generateSummary(input);
    expect(result.recurringPattern).toBeNull();
  });

  it("falls back to a shared detected concept when tags don't reveal a pattern", async () => {
    const input: GameSummaryInput = {
      ...BASE_INPUT,
      mistakes: [
        mistake({ san: "Nd4", concepts: ["hanging piece"] }),
        mistake({ san: "g6", concepts: ["hanging piece"] }),
      ],
    };
    const result = await provider.generateSummary(input);
    expect(result.recurringPattern).toMatch(/hanging piece/);
  });

  it("points focus advice at the recurring pattern when one exists", async () => {
    const input: GameSummaryInput = {
      ...BASE_INPUT,
      mistakes: [
        mistake({ san: "Nd4", tags: ["I didn't consider alternatives"] }),
        mistake({ san: "g6", tags: ["I didn't consider alternatives"] }),
      ],
    };
    const result = await provider.generateSummary(input);
    expect(result.focusAdvice).toMatch(/showed up more than once/i);
  });

  it("points focus advice at the single worst mistake when there's no shared pattern", async () => {
    const input: GameSummaryInput = {
      ...BASE_INPUT,
      mistakes: [mistake({ san: "Nd4", classification: "BLUNDER" }), mistake({ san: "g6", classification: "MISTAKE" })],
    };
    const result = await provider.generateSummary(input);
    expect(result.focusAdvice).toContain("Nd4");
  });

  it("reports a confidence observation when mistakes were played with high confidence", async () => {
    const input: GameSummaryInput = {
      ...BASE_INPUT,
      mistakes: [mistake({ confidence: 5 }), mistake({ confidence: 4 }), mistake({ confidence: 2 })],
      highConfidenceMistakeCount: 2,
    };
    const result = await provider.generateSummary(input);
    expect(result.confidenceObservation).toMatch(/highly confident.*2 of your 3/i);
  });

  it("reports the opposite observation when no mistakes were played with high confidence", async () => {
    const input: GameSummaryInput = {
      ...BASE_INPUT,
      mistakes: [mistake({ confidence: 2 })],
      highConfidenceMistakeCount: 0,
    };
    const result = await provider.generateSummary(input);
    expect(result.confidenceObservation).toMatch(/none of them were played with high confidence/i);
  });
});
