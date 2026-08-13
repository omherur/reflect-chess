import { describe, it, expect } from "vitest";
import { Chess } from "chess.js";
import {
  findConcepts,
  computeApproximate,
  findGroundingViolations,
  applyGrounding,
  filterRelevantConcepts,
  uciSquares,
  pvSquaresFromSan,
  verifiedConceptVocabulary,
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

  it("does not report a fork whose targets are all defended by an equal piece — it wins nothing", () => {
    // White knight d5 hits the black knights on c7 and e7, and each is
    // defended by the bishop on d8. Nxc7 Bxc7 is knight for knight: real
    // geometry, no material, nothing the player needs told.
    const fen = "k2b4/2n1n3/8/3N4/8/8/8/7K w - - 0 1";
    const highlights = findConcepts(fen, "b");
    expect(highlights.find((h) => h.concept === "fork")).toBeUndefined();
  });

  it("still reports a fork on defended targets when the trade wins material", () => {
    // Same shape with rooks instead of knights: Nxc7 Bxc7 wins a rook for a
    // knight, so being defended doesn't make this one negligible. The point
    // of the gate is material, not "is anything covering it".
    const fen = "k2b4/2r1r3/8/3N4/8/8/8/7K w - - 0 1";
    const highlights = findConcepts(fen, "b");
    expect(highlights.find((h) => h.concept === "fork")).toBeDefined();
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

  it("false-positive trap: never claims a piece is pinned to the KING when two pieces block that line", () => {
    // White bishop g1, diagonal to black king c5, but BOTH d4 and e3 are
    // occupied — the bishop's view of the king is cut off at e3, so nothing
    // is pinned against the king.
    //
    // The e3 pawn IS pinned against the knight on d4 behind it, which is a
    // relative pin and correctly reported as one. What must never appear is
    // the king in that sentence: a piece pinned to the king cannot legally
    // move at all, and saying so of a piece that can would be false.
    const fen = "8/8/8/2k5/3n4/4p3/8/6BK w - - 0 1";
    const pin = findConcepts(fen, "b").find((h) => h.concept === "pin");
    expect(pin?.note ?? "").not.toMatch(/king/i);
    expect(pin?.squares ?? []).not.toContain("c5");
  });

  it("detects a relative pin — a piece shielding something more valuable than itself", () => {
    // The single most common pin in chess, and one no detector could
    // confirm until now: Bg5 pinning the f6 knight against the queen on d8.
    const chess = new Chess("r1bqk2r/pppp1ppp/1bn2n2/4p3/2BPP3/2P2N2/PP3PPP/RNBQK2R w KQkq - 1 6");
    chess.move("Bg5");
    // Examined with White still to move, because the detectors read the
    // side to move's threats and this pin is White's own. In the real game
    // it's Black's turn here, which is why verifiedConceptVocabulary has to
    // look from both sides — covered separately below.
    const fields = chess.fen().split(" ");
    fields[1] = "w";
    fields[3] = "-";
    const pin = findConcepts(fields.join(" "), "b", { requireMaterial: false }).find(
      (h) => h.concept === "pin"
    );
    expect(pin).toBeDefined();
    expect(pin?.squares).toEqual(expect.arrayContaining(["g5", "f6", "d8"]));
    // It can move — it just costs the queen. Only an absolute pin immobilizes.
    expect(pin?.note).toContain("losing");
    expect(pin?.note).not.toMatch(/king/i);
  });

  it("does not flag a pin when the sliding piece already attacks the king directly (that's check, not a pin)", () => {
    const fen = "4k3/8/8/8/8/8/8/4RK2 w - - 0 1";
    const highlights = findConcepts(fen, "b");
    expect(highlights.find((h) => h.concept === "pin")).toBeUndefined();
  });

  it("does not report a pin on a piece defended more times than it is attacked", () => {
    // The knight on e5 really is pinned to the king on e8 by the rook on e1,
    // but the d6 and f6 pawns both cover it against a single attacker. It
    // can't move, and it also can't be won — so it costs nothing, and
    // reporting it as a finding is exactly the kind of true-but-useless
    // fact that crowds out the one thing that mattered.
    const fen = "4k3/8/3p1p2/4n3/8/8/8/4RK2 w - - 0 1";
    const highlights = findConcepts(fen, "b");
    expect(highlights.find((h) => h.concept === "pin")).toBeUndefined();
  });

  it("still reports a pin when the attackers at least match the defenders", () => {
    // One defender instead of two. A pinned piece can never run, so the
    // attacker only has to match the defence to win it by piling on — which
    // makes this pin genuinely load-bearing.
    const fen = "4k3/8/3p4/4n3/8/8/8/4RK2 w - - 0 1";
    const highlights = findConcepts(fen, "b");
    expect(highlights.find((h) => h.concept === "pin")).toBeDefined();
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

  it("does not report a skewer when the piece behind is defended and no more valuable than the attacker", () => {
    // Rook a1, black queen e1 in front, black rook h1 behind — the same
    // shape as the positive case above, except the bishop on g2 now covers
    // h1. Rxh1 Bxh1 is rook for rook, so the skewer wins nothing.
    const fen = "1k4K1/8/8/8/8/8/6b1/R3q2r w - - 0 1";
    const highlights = findConcepts(fen, "b");
    expect(highlights.find((h) => h.concept === "skewer")).toBeUndefined();
  });
});

describe("findConcepts — negligible tactics found in real games", () => {
  // These four positions are lifted from the development database, where
  // every one of them was being reported to a player as a "skewer". They
  // are the concrete reason the materiality gates exist: all four are
  // geometrically real and none of them wins anything.
  const cases: { name: string; fen: string; move: string }[] = [
    {
      name: "a queen 'skewering' two pawns down the d-file",
      fen: "rnbqkbnr/pppp1ppp/8/8/3pP3/5N2/PPP2PPP/RNBQKB1R b KQkq - 1 3",
      move: "d5",
    },
    {
      name: "a queen 'forcing' a defended pawn to move and expose another pawn",
      fen: "r2r2k1/pbq1bp2/5n2/2pp2pQ/8/2N1P3/PPB2PPP/3RR1K1 b - - 1 18",
      move: "Kg7",
    },
    {
      name: "a bishop 'skewering' a defended knight onto a defended bishop",
      fen: "r2q1rk1/pb1nbpp1/1p2pn1p/2pp4/2PP3B/2NBPN2/PP2QPPP/3R1RK1 b - - 1 11",
      move: "Qc7",
    },
    {
      name: "a queen 'skewering' a defended knight onto a defended bishop",
      fen: "r2r4/pbq1bpk1/5n2/2pp2Q1/8/2N1P3/PPB2PPP/3RR1K1 b - - 0 19",
      move: "Kh8",
    },
  ];

  for (const { name, fen, move } of cases) {
    it(`no longer reports ${name}`, () => {
      const chess = new Chess(fen);
      const played = chess.move(move);
      const highlights = findConcepts(chess.fen(), played.color);
      expect(highlights.find((h) => h.concept === "skewer")).toBeUndefined();
    });
  }
});

describe("findConcepts — legality of the threat", () => {
  it("does not report a hanging piece when the only attacker is pinned and cannot legally take it", () => {
    // The white rook on a4 geometrically attacks the undefended black knight
    // on e4, but it is pinned to its own king on a1 by the rook on a8, so
    // Rxe4 is not a legal move and the knight was never in danger. An
    // attacker count says "free piece"; enumerating legal captures doesn't.
    const fen = "r6k/8/8/8/R3n3/8/8/K7 w - - 0 1";
    const highlights = findConcepts(fen, "b");
    const hanging = highlights.find((h) => h.concept === "hanging piece");
    // The rook on a8 IS hanging — Rxa8 stays on the pin line, so it's legal
    // and free. The knight on e4 is the piece this is about: it must not be
    // named, because the only move that could take it doesn't exist.
    expect(hanging?.squares ?? []).not.toContain("e4");
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

  it("checks the summary layer too — it is the part most players actually read", () => {
    const bad = explanation({
      summary: {
        headline: "You walked into a fork on e5.",
        betterMove: "Nc2 keeps everything covered.",
        takeaway: "Check for undefended pieces.",
      },
    });
    expect(findGroundingViolations(bad, [], [])).toEqual([
      { field: "summary.headline", concept: "fork" },
    ]);
    expect(findGroundingViolations(bad, ["fork"], [])).toEqual([]);
  });

  it("does not fail on an explanation stored before the summary layer existed", () => {
    expect(findGroundingViolations(explanation({ summary: undefined }), [], [])).toEqual([]);
  });
});

describe("verifiedConceptVocabulary", () => {
  // The position from a real reveal where three of the four explanation
  // fields were replaced with template text. A hanging piece IS present
  // after Bg5 — the relevance filter dropped it, the stored concept list
  // came out empty, and every tactical word the model wrote then counted
  // as unverified.
  const FEN = "r1bqk2r/pppp1ppp/1bn2n2/4p3/2BPP3/2P2N2/PP3PPP/RNBQK2R w KQkq - 1 6";
  const PV = ["Nxe5", "Nxe5", "dxe5", "Nxe4", "Bxf7+", "Kxf7"];

  it("includes a concept the relevance filter dropped from the display list", () => {
    const vocabulary = verifiedConceptVocabulary(FEN, "c1g5", PV);
    expect(vocabulary).toContain("hanging piece");
  });

  it("lets that explanation keep its own prose instead of falling to the template", () => {
    const written = explanation({
      whatItMissed: "The pawn on e5 was hanging — Nxe5 simply takes it.",
    });
    // What the check used to be handed: the stored (empty) display list.
    expect(findGroundingViolations(written, [], [])).toEqual([
      { field: "whatItMissed", concept: "hanging piece" },
    ]);
    // What it is handed now.
    expect(findGroundingViolations(written, verifiedConceptVocabulary(FEN, "c1g5", PV), [])).toEqual(
      []
    );
  });

  it("still rejects a tactic that is nowhere on the board or in the line", () => {
    // No fork exists in this position or anywhere in its principal
    // variation, so the guarantee that matters is intact: widening the
    // vocabulary to what the board supports does not let the model invent
    // a tactic the board doesn't support.
    const invented = explanation({ whatItMissed: "You missed a fork on e5." });
    const vocabulary = verifiedConceptVocabulary(FEN, "c1g5", PV);
    expect(vocabulary).not.toContain("fork");
    expect(findGroundingViolations(invented, vocabulary, [])).toEqual([
      { field: "whatItMissed", concept: "fork" },
    ]);
  });

  it("includes the relative pin the player themselves described", () => {
    // The reflection on this exact moment read "pinning the knight to the
    // queen". The model wrote the same thing and had it overwritten,
    // because no detector could confirm a pin against anything but a king.
    expect(verifiedConceptVocabulary(FEN, "c1g5", PV)).toContain("pin");
  });

  it("survives a move or line it cannot replay", () => {
    expect(() => verifiedConceptVocabulary(FEN, "a1a8", ["totally-not-a-move"])).not.toThrow();
    expect(verifiedConceptVocabulary(FEN, "a1a8", ["totally-not-a-move"])).toEqual([]);
  });
});

describe("findGroundingViolations — verb forms", () => {
  it("catches an unverified pin however it is phrased", () => {
    // "pins" was missing from the pattern, so the same claim was caught or
    // waved through depending on the verb form the model happened to use.
    for (const text of [
      "Bg5 pins the knight to the queen.",
      "Bg5 pinned the knight.",
      "Bg5 is pinning the knight.",
      "That is a pin on the knight.",
    ]) {
      expect(findGroundingViolations(explanation({ whatItMissed: text }), [], [])).toEqual([
        { field: "whatItMissed", concept: "pin" },
      ]);
    }
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

  it("patches a summary line from the model's own surviving prose, not the generic template", () => {
    // The headline named an unverified tactic, but whatItMissed — which
    // says the same thing at length — passed the check. Its first sentence
    // is verified by exactly the same test and is far more concrete than
    // the template's stock line, so it wins.
    const primary = explanation({
      whatItMissed: "The knight on e5 has nothing covering it. Bxe5 takes it for free.",
      summary: {
        headline: "You walked into a fork on e5.",
        betterMove: "Nc2 keeps everything covered.",
        takeaway: "Check for undefended pieces.",
      },
    });
    const fallback = explanation({
      summary: {
        headline: "Nd4 gave up a small amount of your advantage.",
        betterMove: "Fallback better move.",
        takeaway: "Fallback takeaway.",
      },
    });
    const patched = applyGrounding(primary, fallback, findGroundingViolations(primary, [], []));
    expect(patched.summary?.headline).toBe("The knight on e5 has nothing covering it.");
  });

  it("falls back to the template summary when the deep field is ungrounded too", () => {
    // Both the headline and the field it would borrow from name the same
    // unverified tactic, so there is no verified prose left to promote.
    const primary = explanation({
      whatItMissed: "You missed the fork on e5.",
      summary: {
        headline: "You walked into a fork on e5.",
        betterMove: "Nc2 keeps everything covered.",
        takeaway: "Check for undefended pieces.",
      },
    });
    const fallback = explanation({
      summary: {
        headline: "Fallback headline.",
        betterMove: "Fallback better move.",
        takeaway: "Fallback takeaway.",
      },
    });
    const patched = applyGrounding(primary, fallback, findGroundingViolations(primary, [], []));
    expect(patched.summary?.headline).toBe("Fallback headline.");
  });

  it("patches one summary line without disturbing the other two", () => {
    const primary = explanation({
      summary: {
        headline: "You walked into a fork on e5.",
        betterMove: "Nc2 keeps everything covered.",
        takeaway: "Check for undefended pieces.",
      },
    });
    const fallback = explanation({
      summary: {
        headline: "Fallback headline with no tactic named.",
        betterMove: "Fallback better move.",
        takeaway: "Fallback takeaway.",
      },
    });
    const patched = applyGrounding(primary, fallback, findGroundingViolations(primary, [], []));

    // Only the headline named an unverified tactic, so only the headline
    // moves — here to the clean whatItMissed, per the preference above.
    expect(patched.summary?.headline).toBe("A stronger continuation was available.");
    expect(patched.summary?.betterMove).toBe("Nc2 keeps everything covered.");
    expect(patched.summary?.takeaway).toBe("Check for undefended pieces.");
  });

  it("is a no-op when there are no violations", () => {
    const primary = explanation();
    const fallback = explanation({ whatYourMoveDid: "different text" });
    expect(applyGrounding(primary, fallback, [])).toEqual(primary);
  });
});

describe("findConcepts — a pin must cost more than a trade", () => {
  // Reported from a real reveal: "Black pawn on d5 is pinned by the White
  // queen on d1 — it can't move without losing the Black queen on d8". The
  // black queen is defended by its own king, and the pinner is also a
  // queen, so Qxd8+ Kxd8 is queens coming off, not a loss. Calling that a
  // pin teaches a player to fear an even exchange.
  const TRADE_ONLY = "r1bqkb1r/ppp2ppp/2n5/1N1pP3/8/8/PPP2PPP/R1BQKB1R w KQkq - 0 1";

  it("does not report a pin when exposing the shielded piece is only a trade", () => {
    const pin = findConcepts(TRADE_ONLY, "b").find((h) => h.concept === "pin");
    expect(pin).toBeUndefined();
  });

  it("still reports it when the shielded piece would actually be won", () => {
    // Same shape with a ROOK doing the pinning instead of a queen: the
    // shielded queen is worth more than the piece that would take it, so
    // exposing it is a real loss rather than an exchange.
    const fen = "3q1rk1/8/8/3p4/8/8/8/3RK3 w - - 0 1";
    const pin = findConcepts(fen, "b").find((h) => h.concept === "pin");
    expect(pin).toBeDefined();
  });

  it("does not claim a file-pinned pawn cannot move — it can still push", () => {
    const fen = "3q1rk1/8/8/3p4/8/8/8/3RK3 w - - 0 1";
    const pin = findConcepts(fen, "b").find((h) => h.concept === "pin");
    expect(pin?.note).toContain("can't capture away from the file");
  });
});
