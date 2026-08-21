import { describe, it, expect } from "vitest";
import {
  REVEAL_STAGES,
  TYPICAL_TOTAL_SECONDS,
  revealProgress,
  stageInfo,
  type RevealStage,
} from "./reveal-progress";

const WORKING_STAGES: RevealStage[] = ["checking", "explaining", "saving"];

describe("REVEAL_STAGES", () => {
  it("covers 0 to 100 with no gaps or overlaps between stages", () => {
    let previousEnd = 0;
    for (const stage of REVEAL_STAGES) {
      expect(stage.start).toBeGreaterThanOrEqual(previousEnd - 0.001);
      expect(stage.end).toBeGreaterThanOrEqual(stage.start);
      previousEnd = stage.end;
    }
    expect(REVEAL_STAGES[REVEAL_STAGES.length - 1].end).toBe(100);
  });

  it("gives the explanation step the largest share, since it is the longest wait", () => {
    const explaining = stageInfo("explaining");
    const widest = REVEAL_STAGES.reduce((a, b) => (b.end - b.start > a.end - a.start ? b : a));
    expect(widest.stage).toBe(explaining.stage);
  });

  it("quotes a total that matches the stages it is made of", () => {
    const summed = REVEAL_STAGES.reduce((total, s) => total + s.typicalMs, 0) / 1000;
    expect(TYPICAL_TOTAL_SECONDS).toBe(Math.round(summed));
  });
});

describe("revealProgress", () => {
  it("starts each stage at that stage's floor", () => {
    for (const stage of WORKING_STAGES) {
      expect(revealProgress(stage, 0)).toBeCloseTo(stageInfo(stage).start, 5);
    }
  });

  it("never claims to be finished while work is still in flight", () => {
    // The guarantee that matters: a bar sitting at 100% while the server is
    // still working reads as a hung page. Every working stage's ceiling is
    // short of 100 for exactly this reason, so the bar can only complete
    // when the verdict actually arrives.
    for (const stage of WORKING_STAGES) {
      const ceiling = stageInfo(stage).end;
      expect(ceiling).toBeLessThan(100);
      for (const elapsed of [1_000, 10_000, 60_000, 10 * 60_000]) {
        expect(revealProgress(stage, elapsed)).toBeLessThanOrEqual(ceiling);
      }
    }
  });

  it("moves forward the whole time it is waiting", () => {
    let previous = -1;
    for (const elapsed of [0, 250, 1_000, 4_000, 12_000, 45_000]) {
      const value = revealProgress("explaining", elapsed);
      expect(value).toBeGreaterThan(previous);
      previous = value;
    }
  });

  it("is well past the halfway point of its stage by the typical duration", () => {
    const info = stageInfo("explaining");
    const atTypical = revealProgress("explaining", info.typicalMs);
    expect(atTypical).toBeGreaterThan(info.start + (info.end - info.start) * 0.5);
  });

  it("treats a negative elapsed time as zero rather than going backwards", () => {
    expect(revealProgress("checking", -5_000)).toBe(stageInfo("checking").start);
  });

  it("reports a completed reveal as 100", () => {
    expect(revealProgress("done", 0)).toBe(100);
  });
});
