import { describe, it, expect } from "vitest";
import {
  findConcepts,
  computeApproximate,
  findGroundingViolations,
  applyGrounding,
  filterRelevantConcepts,
  uciSquares,
  pvSquaresFromSan,
} from "./concepts";
import type { StructuredExplanation } from "@/lib/types";

describe("findConcepts — hanging piece", () => {
  it("detects a hanging piece and reports its square", () => {
    // Black bishop on f1, attacked by the adjacent white king, defended by nothing.
    const fen = "4k3/8/8/8/8/8/8/3QKb2 w - - 0 1";
    const highlights = findConcepts(fen, "b");
    const hanging = highlights.find((h) => h.concept === "hanging piece");
    expect(hanging).toBeDefined();
    expect(hanging?.squares).toContain("f1");
  });

  it("false-positive trap: does not flag a piece that is actually defended", () => {
    // Same as above, but a black rook on f8 defends the bishop along the f-file.
    const fen = "k4r2/8/8/8/8/8/8/3QKb2 w - - 0 1";
    const highlights = findConcepts(fen, "b");
    expect(highlights.find((h) => h.concept === "hanging piece")).toBeUndefined();
  });
});

describe("findConcepts — fork", () => {
  it("detects a knight forking two undefended rooks", () => {
    const fen = "k7/2r1r3/8/3N4/8/8/8/7K w - - 0 1";
    const highlights = findConcepts(fen, "b");
    const fork = highlights.find((h) => h.concept === "fork");
    expect(fork).toBeDefined();
    expect(fork?.squares).toEqual(expect.arrayContaining(["d5", "c7", "e7"]));
  });

  it("false-positive trap: a knight attacking one piece plus a pawn is not a fork (pawns excluded)", () => {
    const fen = "k7/2r1p3/8/3N4/8/8/8/7K w - - 0 1";
    const highlights = findConcepts(fen, "b");
    expect(highlights.find((h) => h.concept === "fork")).toBeUndefined();
  });
});

describe("findConcepts — pin", () => {
  it("detects a real pin: rook, a single enemy piece in the way, then the enemy king", () => {
    const fen = "4k3/8/8/4n3/8/8/8/4RK2 w - - 0 1";
    const highlights = findConcepts(fen, "b");
    const pin = highlights.find((h) => h.concept === "pin");
    expect(pin).toBeDefined();
    expect(pin?.squares).toEqual(expect.arrayContaining(["e1", "e8", "e5"]));
  });

  it("REGRESSION: does not flag a pin when the blocking piece is the attacker's own color (the c5/g1/d4 bug)", () => {
    // White bishop g1 is diagonally aligned with the black king on c5, but the
    // only piece in between (d4) is a WHITE pawn — the attacker's own piece
    // merely blocking its own line of sight. This is not a pin by any
    // definition: nothing belonging to the defender is immobilized. The
    // original (buggy) detector only checked "is the king currently
    // unreachable" and ignored the color of whatever was in the way.
    const fen = "8/8/8/2k5/3P4/8/8/6BK w - - 0 1";
    const highlights = findConcepts(fen, "b");
    expect(highlights.find((h) => h.concept === "pin")).toBeUndefined();
  });

  it("false-positive trap: does not flag a pin when two pieces block the line (attacker can't see through either)", () => {
    // White bishop g1, diagonal to black king c5, but BOTH d4 and e3 are
    // occupied — even though d4 is a black piece, the bishop's view is cut
    // off earlier by e3, so nothing is actually pinned.
    const fen = "8/8/8/2k5/3n4/4p3/8/6BK w - - 0 1";
    const highlights = findConcepts(fen, "b");
    expect(highlights.find((h) => h.concept === "pin")).toBeUndefined();
  });

  it("does not flag a pin when the sliding piece already attacks the king directly (that's check, not a pin)", () => {
    const fen = "4k3/8/8/8/8/8/8/4RK2 w - - 0 1";
    const highlights = findConcepts(fen, "b");
    expect(highlights.find((h) => h.concept === "pin")).toBeUndefined();
  });
});

describe("findConcepts — skewer", () => {
  it("detects a skewer: attacker sees through a must-move piece to a less valuable one behind it", () => {
    // White rook a1 attacks along rank 1: black queen e1 (must move, more
    // valuable than what's behind), black rook h1 behind it.
    const fen = "1k4K1/8/8/8/8/8/8/R3q2r w - - 0 1";
    const highlights = findConcepts(fen, "b");
    const skewer = highlights.find((h) => h.concept === "skewer");
    expect(skewer).toBeDefined();
    expect(skewer?.squares).toEqual(expect.arrayContaining(["a1", "e1", "h1"]));
  });

  it("false-positive trap: a less valuable front piece isn't forced to move, so this isn't a skewer", () => {
    // Same shape, but the front piece (knight, value 3) is worth less than
    // what's behind it (queen, value 9) — there's no incentive to move it,
    // so this is just an attacked knight with a queen coincidentally behind.
    const fen = "1k4K1/8/8/8/8/8/8/R3n2q w - - 0 1";
    const highlights = findConcepts(fen, "b");
    expect(highlights.find((h) => h.concept === "skewer")).toBeUndefined();
  });

  it("REGRESSION: a piece pinned to the king is reported as a pin only, never double-labeled a skewer", () => {
    // White bishop c4 attacks through the f7 pawn to the black king on g8 —
    // this is the single most common real-game pin shape, and it was
    // getting flagged as BOTH "pin" and "skewer" because the king's piece
    // value (0) satisfied the skewer's "front piece is worth at least as
    // much as what's behind it" check. A pin-to-the-king is never a skewer.
    const fen = "6k1/5p2/8/8/2B5/8/8/K7 w - - 0 1";
    const highlights = findConcepts(fen, "b");
    expect(highlights.find((h) => h.concept === "pin")).toBeDefined();
    expect(highlights.find((h) => h.concept === "skewer")).toBeUndefined();
  });
});

describe("findConcepts — back-rank weakness", () => {
  it("detects a back-rank weakness when every escape square is occupied", () => {
    const fen = "k7/8/8/8/8/8/3PPP2/4K3 w - - 0 1";
    const highlights = findConcepts(fen, "w");
    expect(highlights.find((h) => h.concept === "back-rank weakness")).toBeDefined();
  });

  it("correctness fix: an empty-but-attacked escape square does not count as real luft", () => {
    // d2 is occupied; e2 and f2 are empty but covered by a black queen (a6,
    // diagonal) and a black rook (f8, file) respectively — the king can't
    // actually flee to either, so this must still count as a weakness. The
    // old detector only checked occupancy and would have wrongly called
    // this "safe" because it saw two "empty" squares.
    const fen = "5r1k/8/q7/8/8/8/3P4/4K3 w - - 0 1";
    const highlights = findConcepts(fen, "w");
    expect(highlights.find((h) => h.concept === "back-rank weakness")).toBeDefined();
  });

  it("false-positive trap: does not flag a king with a genuine, safe escape square", () => {
    const fen = "4k3/8/8/8/8/8/3P4/4K3 w - - 0 1";
    const highlights = findConcepts(fen, "w");
    expect(highlights.find((h) => h.concept === "back-rank weakness")).toBeUndefined();
  });
});

describe("findConcepts — king exposure", () => {
  it("detects significant king exposure", () => {
    // Black king on e5 in the open; white rooks on d1 and f1 sweep the
    // d- and f-files, covering four of the eight squares around the king
    // (d4, d6, f4, f6) without directly checking it.
    const fen = "8/8/8/4k3/8/8/8/3R1R1K w - - 0 1";
    const highlights = findConcepts(fen, "b");
    expect(highlights.find((h) => h.concept === "king exposure")).toBeDefined();
  });

  it("false-positive trap: a king tucked away with no nearby attacks is not flagged", () => {
    const fen = "4k3/8/8/8/8/8/8/4K3 w - - 0 1";
    const highlights = findConcepts(fen, "w");
    expect(highlights.find((h) => h.concept === "king exposure")).toBeUndefined();
  });
});

describe("findConcepts — quiet position", () => {
  it("returns no concepts for a quiet, safe position", () => {
    const fen = "4k3/8/8/8/8/8/8/4K3 w - - 0 1";
    expect(findConcepts(fen, "w")).toEqual([]);
  });
});

describe("filterRelevantConcepts", () => {
  const BACK_RANK_FEN = "k7/8/8/8/8/8/3PPP2/4K3 w - - 0 1";

  it("REGRESSION: drops a true-but-disconnected back-rank weakness when the move's story has nothing to do with it", () => {
    // The king on e1 has no escape square — structurally true — but the
    // move being explained, the best move, and the PV are all queenside
    // pawn pushes that never touch e1/d2/e2/f2. This is exactly the
    // reported bug: a real fact surfacing as noise in an unrelated
    // explanation.
    const concepts = findConcepts(BACK_RANK_FEN, "w");
    expect(concepts.find((c) => c.concept === "back-rank weakness")).toBeDefined();

    const filtered = filterRelevantConcepts(concepts, {
      moveSquares: ["a2", "a4"],
      bestSquares: ["b2", "b4"],
      pvSquares: ["a4", "a5", "b4", "b5"],
    });
    expect(filtered.find((c) => c.concept === "back-rank weakness")).toBeUndefined();
  });

  it("keeps the back-rank weakness when the move actually being explained involves the king's square", () => {
    const concepts = findConcepts(BACK_RANK_FEN, "w");
    const filtered = filterRelevantConcepts(concepts, {
      moveSquares: ["e1", "e2"], // the move explained is the king itself moving
      bestSquares: ["b2", "b4"],
      pvSquares: [],
    });
    expect(filtered.find((c) => c.concept === "back-rank weakness")).toBeDefined();
  });

  it("keeps the weakness when the engine's best line runs through the king's escape square", () => {
    const concepts = findConcepts(BACK_RANK_FEN, "w");
    const filtered = filterRelevantConcepts(concepts, {
      moveSquares: ["a2", "a4"],
      bestSquares: ["b2", "b4"],
      pvSquares: ["e1", "f1"], // the recommended continuation walks the king to safety
    });
    expect(filtered.find((c) => c.concept === "back-rank weakness")).toBeDefined();
  });

  it("drops every concept when none of them share a square with the move's story", () => {
    const fen = "6k1/5p2/8/8/2B5/8/8/K7 w - - 0 1"; // bishop c4 pins f7 to king g8
    const concepts = findConcepts(fen, "b");
    expect(concepts.length).toBeGreaterThan(0);

    const filtered = filterRelevantConcepts(concepts, {
      moveSquares: ["a1", "a2"],
      bestSquares: ["a2", "a3"],
      pvSquares: [],
    });
    expect(filtered).toEqual([]);
  });
});

describe("uciSquares", () => {
  it("splits a UCI move into from/to squares", () => {
    expect(uciSquares("e2e4")).toEqual(["e2", "e4"]);
  });

  it("ignores a trailing promotion piece", () => {
    expect(uciSquares("e7e8q")).toEqual(["e7", "e8"]);
  });
});

describe("pvSquaresFromSan", () => {
  it("replays a SAN sequence from a FEN to recover the squares involved", () => {
    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const squares = pvSquaresFromSan(fen, ["e4", "e5", "Nf3"]);
    expect(squares).toEqual(["e2", "e4", "e7", "e5", "g1", "f3"]);
  });

  it("stops cleanly at the first illegal or malformed move", () => {
    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const squares = pvSquaresFromSan(fen, ["e4", "not-a-move", "Nf3"]);
    expect(squares).toEqual(["e2", "e4"]);
  });
});

describe("computeApproximate", () => {
  it("is approximate for a mistake with no detected concepts", () => {
    expect(computeApproximate("MISTAKE", [])).toBe(true);
  });

  it("is not approximate when a concept was found", () => {
    expect(computeApproximate("MISTAKE", ["hanging piece"])).toBe(false);
  });

  it("is never approximate for a clean classification", () => {
    expect(computeApproximate("BEST", [])).toBe(false);
    expect(computeApproximate("GOOD", [])).toBe(false);
  });
});

function explanation(overrides: Partial<StructuredExplanation> = {}): StructuredExplanation {
  return {
    whatYourMoveDid: "You developed a piece.",
    whatItMissed: "A stronger continuation was available.",
    whyBestIsBetter: "It creates a concrete threat against the king.",
    remember: "Look for undefended pieces before committing.",
    replayNote: "Your replay move is similar to the original.",
    concepts: [],
    approximate: false,
    ...overrides,
  };
}

describe("findGroundingViolations", () => {
  it("flags a tactical term the model used that isn't in the verified concept list", () => {
    const bad = explanation({ whatItMissed: "You missed a pin along the e-file." });
    const violations = findGroundingViolations(bad, [], []);
    expect(violations).toEqual([{ field: "whatItMissed", concept: "pin" }]);
  });

  it("allows a tactical term that IS in the verified concept list for that field", () => {
    const ok = explanation({ whatItMissed: "You missed a pin along the e-file." });
    const violations = findGroundingViolations(ok, ["pin"], []);
    expect(violations).toEqual([]);
  });

  it("checks replayNote against the union of original and replay concepts", () => {
    const ok = explanation({ replayNote: "This still leaves a fork available." });
    expect(findGroundingViolations(ok, [], ["fork"])).toEqual([]);
    expect(findGroundingViolations(ok, [], [])).toEqual([{ field: "replayNote", concept: "fork" }]);
  });

  it("returns no violations for concept-free prose", () => {
    const clean = explanation();
    expect(findGroundingViolations(clean, [], [])).toEqual([]);
  });
});

describe("applyGrounding", () => {
  it("replaces only the violating fields with the fallback's text", () => {
    const primary = explanation({
      whatItMissed: "You missed a pin along the e-file.",
      remember: "This is a clean, concept-free sentence.",
    });
    const fallback = explanation({
      whatItMissed: "Fallback: it missed a stronger continuation.",
      remember: "Fallback remember text.",
    });
    const violations = findGroundingViolations(primary, [], []);
    const patched = applyGrounding(primary, fallback, violations);

    expect(patched.whatItMissed).toBe("Fallback: it missed a stronger continuation.");
    expect(patched.remember).toBe("This is a clean, concept-free sentence.");
    expect(patched.whatYourMoveDid).toBe(primary.whatYourMoveDid);
  });

  it("is a no-op when there are no violations", () => {
    const primary = explanation();
    const fallback = explanation({ whatYourMoveDid: "different text" });
    expect(applyGrounding(primary, fallback, [])).toEqual(primary);
  });
});
