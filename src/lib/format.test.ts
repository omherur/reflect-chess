import { describe, it, expect } from "vitest";
import { replayVerdictBadgeLabel, replayVerdictBadgeClass } from "./format";

describe("replayVerdictBadgeLabel", () => {
  it("gives each verdict a short, distinct, scannable label", () => {
    const verdicts = ["SAME_AS_BEST", "IMPROVEMENT", "SAME_AS_ORIGINAL", "SIMILAR", "WORSE"];
    const labels = verdicts.map(replayVerdictBadgeLabel);
    expect(new Set(labels).size).toBe(verdicts.length); // all distinct
    expect(replayVerdictBadgeLabel("SAME_AS_BEST")).toMatch(/best move/i);
    expect(replayVerdictBadgeLabel("IMPROVEMENT")).toMatch(/improvement/i);
  });
});

describe("replayVerdictBadgeClass", () => {
  it("gives SAME_AS_BEST and IMPROVEMENT a positive (severity-good/best family) tone", () => {
    expect(replayVerdictBadgeClass("SAME_AS_BEST")).toContain("severity-best");
    expect(replayVerdictBadgeClass("IMPROVEMENT")).toContain("severity-good");
  });

  it("gives WORSE the same destructive tone used for BLUNDER elsewhere", () => {
    expect(replayVerdictBadgeClass("WORSE")).toContain("destructive");
  });

  it("gives every verdict a distinct class string", () => {
    const verdicts = ["SAME_AS_BEST", "IMPROVEMENT", "SAME_AS_ORIGINAL", "SIMILAR", "WORSE"];
    const classes = verdicts.map(replayVerdictBadgeClass);
    expect(new Set(classes).size).toBe(verdicts.length);
  });
});
