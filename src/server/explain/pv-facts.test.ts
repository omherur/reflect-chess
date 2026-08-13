import { describe, it, expect } from "vitest";
import { describePrincipalVariation } from "./pv-facts";

// The position and line from a real review, where the model annotated the
// key move as "shores up the center, ignoring the queen for now" — when c6
// in fact attacks the White queen on d5, which is the point of the line.
const FEN = "r1bqkb1r/ppp2ppp/5n2/1N1pP3/8/8/PPP1PPPP/R2QKBNR b KQkq - 0 6";
const PV = ["Nd7", "Qxd5", "a6", "Nc3", "c6", "Qd3"];

describe("describePrincipalVariation", () => {
  it("names what each move attacks, so a deep line isn't guesswork", () => {
    const lines = describePrincipalVariation(FEN, PV);
    const c6 = lines.find((line) => line.includes("c6"));
    expect(c6).toContain("attacks the White queen on d5");
  });

  it("reports captures with the piece taken", () => {
    const lines = describePrincipalVariation(FEN, PV);
    expect(lines.find((line) => line.includes("Qxd5"))).toContain("captures the pawn on d5");
  });

  it("names the mover and the squares for every move", () => {
    const lines = describePrincipalVariation(FEN, PV);
    expect(lines[0]).toContain("Black knight f6-d7");
    expect(lines[1]).toContain("White queen d1-d5");
  });

  it("flags a check", () => {
    const lines = describePrincipalVariation(FEN, [...PV, "Nxe5", "Qxd8+"]);
    expect(lines[lines.length - 1]).toContain("gives check");
  });

  it("flags a piece that lands somewhere undefended", () => {
    // Qh5 walks the queen onto a square Black's g6 pawn attacks and nothing
    // covers — the commonest reason a natural-looking line move is bad.
    const lines = describePrincipalVariation(
      "rnbqkbnr/pppp1p1p/6p1/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 3",
      ["Qh5"]
    );
    expect(lines[0]).toContain("undefended");
  });

  it("stops cleanly at a move it cannot play", () => {
    const lines = describePrincipalVariation(FEN, ["Nd7", "not-a-move", "a6"]);
    expect(lines).toHaveLength(1);
  });

  it("returns nothing for an empty line", () => {
    expect(describePrincipalVariation(FEN, [])).toEqual([]);
  });
});
