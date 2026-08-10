import { describe, it, expect } from "vitest";
import { toClientView } from "./keymoments";
import type { KeyMoment, Reflection } from "@prisma/client";

/**
 * Regression coverage for the "additional suggestion" in the batch-analysis
 * bug report: the dashboard's per-game reactivity bug happened because the
 * client only merged a couple of fields (analysisProgress/analysisStatus)
 * on each poll instead of refetching full per-game data — so a finished
 * game's key-moment counts stayed stale. The single-game review page's
 * "Reflection progress" indicator and key-moments sidebar rely on the same
 * kind of full-object replace (see game-review.tsx's handleReviewed), fed
 * directly by whatever toClientView returns for a REVIEWED moment. These
 * tests lock in that toClientView always returns the COMPLETE verdict
 * (classification, explanation, full reflection) once reviewed — never a
 * partial object a caller could mistake for "still pending" or merge
 * incompletely.
 */

const BASE_KEY_MOMENT: KeyMoment = {
  id: "km1",
  gameId: "game1",
  moveId: "move1",
  sortIndex: 0,
  ply: 5,
  fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  originalSan: "Bxd1",
  originalUci: "g4d1",
  bestMoveSan: "dxe5",
  bestMoveUci: "d6e5",
  evalBeforeCp: -150,
  evalBeforeMate: null,
  evalAfterCp: null,
  evalAfterMate: -2,
  selectionReason: "Your practical winning chances dropped by a lot.",
  classification: "BLUNDER",
  principalVariation: JSON.stringify(["dxe5", "Qxg4"]),
  conceptHighlights: JSON.stringify([{ concept: "hanging piece", note: "undefended", squares: ["d1"] }]),
  importanceScore: 90,
  importanceTier: "CRITICAL",
  reviewStatus: "REVIEWED",
  createdAt: new Date(),
};

const BASE_REFLECTION: Reflection = {
  id: "r1",
  keyMomentId: "km1",
  thoughts: "I thought I was winning the queen for free.",
  replaySame: false,
  replayMoveSan: "dxe5",
  replayMoveUci: "d6e5",
  confidence: 4,
  tags: JSON.stringify(["I missed something obvious"]),
  followUpQuestion: null,
  followUpAnswer: null,
  replayEvalCp: -170,
  replayEvalMate: null,
  replayVerdict: "IMPROVEMENT",
  explanation: JSON.stringify({
    whatYourMoveDid: "a",
    whatItMissed: "b",
    whyBestIsBetter: "c",
    remember: "d",
    replayNote: "e",
    concepts: ["hanging piece"],
    approximate: false,
  }),
  createdAt: new Date(),
};

describe("toClientView — completeness for a REVIEWED key moment", () => {
  it("returns the full verdict, not just reviewStatus, once reflection exists", () => {
    const view = toClientView(BASE_KEY_MOMENT, BASE_REFLECTION);
    expect(view.reviewStatus).toBe("REVIEWED");
    // Every field a sidebar/progress-indicator client needs must be
    // present — a caller that only checked reviewStatus and assumed the
    // rest was still stale would be exactly the dashboard bug's pattern.
    expect("classification" in view).toBe(true);
    expect("explanation" in view).toBe(true);
    expect("reflection" in view).toBe(true);
    if ("classification" in view) {
      expect(view.classification).toBe("BLUNDER");
      expect(view.importanceTier).toBe("CRITICAL");
      expect(view.explanation.whyBestIsBetter).toBe("c");
      expect(view.reflection.confidence).toBe(4);
      expect(view.reflection.replayVerdict).toBe("IMPROVEMENT");
    }
  });

  it("returns only the narrow public view for a PENDING moment — no early engine leakage", () => {
    const pending: KeyMoment = { ...BASE_KEY_MOMENT, reviewStatus: "PENDING" };
    const view = toClientView(pending, null);
    expect(view.reviewStatus).toBe("PENDING");
    expect("classification" in view).toBe(false);
    expect("explanation" in view).toBe(false);
  });

  it("falls back to the public view if reviewStatus says REVIEWED but no reflection row exists yet", () => {
    // Defensive: a caller must never render classification/explanation
    // fields from a stale or malformed object — toClientView is the only
    // place this gate is allowed to be enforced.
    const view = toClientView(BASE_KEY_MOMENT, null);
    expect("classification" in view).toBe(false);
  });
});
