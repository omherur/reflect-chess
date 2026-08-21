import { describe, it, expect } from "vitest";
import { Chess } from "chess.js";
import { staticExchangeEval, winsMaterial } from "./exchange";

function see(fen: string, square: string): number {
  return staticExchangeEval(new Chess(fen), square as never);
}

describe("staticExchangeEval", () => {
  it("returns the full value of a piece nothing defends", () => {
    // Black knight on e5, no black piece covering it, white rook on e1.
    expect(see("4k3/8/8/4n3/8/8/8/4R2K w - - 0 1", "e5")).toBe(3);
  });

  it("returns 0 for an even trade — a defended knight taken by a knight", () => {
    // Black knight e5 defended by the d6 pawn; white knight on c4 can take it.
    expect(see("4k3/8/3p4/4n3/2N5/8/8/7K w - - 0 1", "e5")).toBe(0);
  });

  it("returns 0 when the capture loses material outright", () => {
    // A queen can take the defended d6 pawn, and be recaptured by the c7 pawn.
    expect(see("4k3/2p5/3p4/8/8/8/8/3Q3K w - - 0 1", "d6")).toBe(0);
  });

  it("still finds the profit in an uneven trade the defender wins back", () => {
    // Black rook e5 defended by the d6 pawn, attacked by a white knight:
    // Nxe5 dxe5 nets a rook for a knight.
    expect(see("4k3/8/3p4/4r3/2N5/8/8/7K w - - 0 1", "e5")).toBe(2);
  });

  it("takes with the cheapest attacker, not the most valuable one", () => {
    // Black knight e5 defended by the d6 pawn, attacked by a white pawn on
    // d4 AND a white queen on d1. Taking with the queen would be met by
    // dxe5 and lose a queen for a knight, which scores 0 once declined;
    // dxe5 dxe5 instead wins a knight for a pawn. Getting 2 here is what
    // proves the pawn was chosen — a "take with whatever is found first"
    // walk would have reported nothing.
    expect(see("4k3/8/3p4/4n3/3P4/8/8/3Q3K w - - 0 1", "e5")).toBe(2);
  });

  it("plays the exchange out to the end, not just one capture and one reply", () => {
    // Same shape, but the white queen sits on e1 where it also bears on e5.
    // dxe5 dxe5 Qxe5 leaves White a clean knight up: the third capture is
    // only found by recursing past the first recapture.
    expect(see("4k3/8/3p4/4n3/3P4/8/8/4Q2K w - - 0 1", "e5")).toBe(3);
  });

  it("ignores an attacker that is pinned to its own king — the capture is not legal", () => {
    // White rook a4 attacks e4 along the fourth rank, but it is pinned to
    // the white king on a1 by the black rook on a8, so Rxe4 cannot be
    // played. Counting geometric attackers would score this a free knight;
    // enumerating legal moves scores it correctly at nothing.
    expect(see("r6k/8/8/8/R3n3/8/8/K7 w - - 0 1", "e4")).toBe(0);
  });

  it("scores an empty square as nothing", () => {
    expect(see("4k3/8/8/8/8/8/8/4R2K w - - 0 1", "e5")).toBe(0);
  });
});

describe("winsMaterial", () => {
  it("is true for a free piece and false for an even trade", () => {
    const free = new Chess("4k3/8/8/4n3/8/8/8/4R2K w - - 0 1");
    expect(winsMaterial(free, "e5")).toBe(true);
    const even = new Chess("4k3/8/3p4/4n3/2N5/8/8/7K w - - 0 1");
    expect(winsMaterial(even, "e5")).toBe(false);
  });

  it("does not mutate the board it is given", () => {
    const fen = "4k3/8/8/4n3/8/8/8/4R2K w - - 0 1";
    const chess = new Chess(fen);
    winsMaterial(chess, "e5");
    expect(chess.fen()).toBe(fen);
  });
});
