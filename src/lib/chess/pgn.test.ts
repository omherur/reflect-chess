import { describe, it, expect } from "vitest";
import {
  parsePgn,
  splitPgns,
  colorForUsername,
  sideToMove,
  validateMove,
  PgnParseError,
} from "./pgn";

const SIMPLE_PGN = `[Event "Test"]
[White "Alice"]
[Black "Bob"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1-0`;

describe("parsePgn", () => {
  it("parses headers and expands the move list", () => {
    const parsed = parsePgn(SIMPLE_PGN);
    expect(parsed.headers.White).toBe("Alice");
    expect(parsed.headers.Black).toBe("Bob");
    expect(parsed.result).toBe("1-0");
    expect(parsed.moves).toHaveLength(6);
    expect(parsed.moves[0]).toMatchObject({
      ply: 1,
      moveNumber: 1,
      color: "white",
      san: "e4",
      uci: "e2e4",
    });
    expect(parsed.moves[1]).toMatchObject({ ply: 2, color: "black", san: "e5" });
  });

  it("produces correct FEN before/after for a White move", () => {
    const parsed = parsePgn(SIMPLE_PGN);
    const firstMove = parsed.moves[0];
    expect(firstMove.fenBefore).toBe(
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
    );
    expect(firstMove.fenAfter).toContain("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b");
  });

  it("produces correct FEN for a Black move (side-to-move flips)", () => {
    const parsed = parsePgn(SIMPLE_PGN);
    const secondMove = parsed.moves[1]; // ...e5
    expect(secondMove.color).toBe("black");
    expect(secondMove.fenBefore.split(" ")[1]).toBe("b");
    expect(secondMove.fenAfter.split(" ")[1]).toBe("w");
  });

  it("throws PgnParseError on malformed PGN", () => {
    expect(() => parsePgn("not a pgn at all")).toThrow(PgnParseError);
  });

  it("throws PgnParseError when there are no moves", () => {
    const noMoves = `[Event "Test"]\n[White "Alice"]\n[Black "Bob"]\n\n*`;
    expect(() => parsePgn(noMoves)).toThrow(PgnParseError);
  });

  it("has a null terminationReason and clockSeconds when neither is present", () => {
    const parsed = parsePgn(SIMPLE_PGN);
    expect(parsed.terminationReason).toBeNull();
    expect(parsed.moves.every((m) => m.clockSeconds == null)).toBe(true);
  });
});

describe("parsePgn — clock and termination", () => {
  const CLOCK_PGN = `[Event "Live Chess"]
[White "A"]
[Black "B"]
[Result "1-0"]
[Termination "A won on time"]

1. e4 {[%clk 0:09:58]} 1... e5 {[%clk 0:09:55]} 2. Nf3 {[%clk 0:09:50]} 1-0`;

  it("parses %clk annotations into seconds per move", () => {
    const parsed = parsePgn(CLOCK_PGN);
    expect(parsed.moves[0].clockSeconds).toBe(9 * 60 + 58);
    expect(parsed.moves[1].clockSeconds).toBe(9 * 60 + 55);
    expect(parsed.moves[2].clockSeconds).toBe(9 * 60 + 50);
  });

  it("classifies a timeout termination from the header", () => {
    expect(parsePgn(CLOCK_PGN).terminationReason).toBe("timeout");
  });

  it("classifies resignation, checkmate, and abandonment from the header", () => {
    const withTermination = (termination: string) =>
      parsePgn(`[Event "Test"]\n[White "A"]\n[Black "B"]\n[Result "1-0"]\n[Termination "${termination}"]\n\n1. e4 e5 1-0`);

    expect(withTermination("A won by resignation").terminationReason).toBe("resignation");
    expect(withTermination("A won by checkmate").terminationReason).toBe("checkmate");
    expect(withTermination("Game abandoned").terminationReason).toBe("abandoned");
    expect(withTermination("Game drawn by agreement").terminationReason).toBe("agreement");
  });

  it("falls back to detecting checkmate from the final SAN when there's no Termination header", () => {
    const checkmatePgn = `[Event "Test"]
[White "A"]
[Black "B"]
[Result "1-0"]

1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0`;
    expect(parsePgn(checkmatePgn).terminationReason).toBe("checkmate");
  });
});

describe("splitPgns", () => {
  it("splits multiple concatenated games", () => {
    const two = `${SIMPLE_PGN}\n\n[Event "Test2"]\n[White "Carol"]\n[Black "Dave"]\n\n1. d4 d5 *`;
    const games = splitPgns(two);
    expect(games).toHaveLength(2);
    expect(games[0]).toContain('[White "Alice"]');
    expect(games[1]).toContain('[White "Carol"]');
  });

  it("returns a single game unchanged", () => {
    expect(splitPgns(SIMPLE_PGN)).toHaveLength(1);
  });

  it("returns an empty array for blank input", () => {
    expect(splitPgns("   ")).toEqual([]);
  });
});

describe("colorForUsername", () => {
  it("matches White case-insensitively", () => {
    expect(colorForUsername({ White: "Alice", Black: "Bob" }, "alice")).toBe("white");
  });
  it("matches Black case-insensitively", () => {
    expect(colorForUsername({ White: "Alice", Black: "Bob" }, "BOB")).toBe("black");
  });
  it("returns null when no match", () => {
    expect(colorForUsername({ White: "Alice", Black: "Bob" }, "carol")).toBeNull();
  });
});

describe("sideToMove", () => {
  it("reads side to move from a FEN", () => {
    expect(sideToMove("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")).toBe("white");
    expect(sideToMove("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1")).toBe("black");
  });
});

describe("validateMove", () => {
  const startFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

  it("accepts a legal SAN move", () => {
    const result = validateMove(startFen, "e4");
    expect(result).not.toBeNull();
    expect(result?.san).toBe("e4");
    expect(result?.uci).toBe("e2e4");
  });

  it("accepts a legal UCI move", () => {
    const result = validateMove(startFen, "g1f3");
    expect(result?.san).toBe("Nf3");
  });

  it("rejects an illegal move", () => {
    expect(validateMove(startFen, "e5")).toBeNull();
    expect(validateMove(startFen, "e2e5")).toBeNull();
  });

  it("rejects nonsense input", () => {
    expect(validateMove(startFen, "not a move")).toBeNull();
  });

  it("handles promotion in UCI form", () => {
    const promoFen = "8/P7/8/8/8/8/8/k6K w - - 0 1";
    const result = validateMove(promoFen, "a7a8q");
    expect(result?.san).toContain("=Q");
  });
});
