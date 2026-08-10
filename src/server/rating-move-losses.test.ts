import { describe, it, expect } from "vitest";
import { ratingFromMoveLosses } from "./rating";

describe("ratingFromMoveLosses", () => {
  it("returns null for an empty sample (no scoreable moments in the game)", () => {
    expect(ratingFromMoveLosses([])).toBeNull();
  });

  it("returns a higher rating for lower average centipawn loss", () => {
    const clean = ratingFromMoveLosses([5, 10, 0, 8]);
    const sloppy = ratingFromMoveLosses([150, 200, 180, 220]);
    expect(clean).not.toBeNull();
    expect(sloppy).not.toBeNull();
    expect(clean!).toBeGreaterThan(sloppy!);
  });

  it("caps a single catastrophic loss so it doesn't dominate the whole game's estimate", () => {
    // One move at "mate-scale" loss (huge number) shouldn't crater the
    // rating to the floor if the rest of the game was otherwise clean.
    const withHugeOutlier = ratingFromMoveLosses([5, 10, 100000, 8]);
    const withCappedEquivalent = ratingFromMoveLosses([5, 10, 400, 8]);
    expect(withHugeOutlier).toBe(withCappedEquivalent);
  });

  it("stays within the documented rating bounds", () => {
    const veryClean = ratingFromMoveLosses([0, 0, 0]);
    const veryBad = ratingFromMoveLosses([1000, 1000, 1000]);
    expect(veryClean!).toBeLessThanOrEqual(2900);
    expect(veryBad!).toBeGreaterThanOrEqual(400);
  });
});
