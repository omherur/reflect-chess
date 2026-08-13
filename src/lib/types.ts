// Shared types used across server and client.

/**
 * An engine score. Exactly one of cp/mate is set.
 * Perspective depends on context — see function docs. In the database,
 * all stored scores are from White's perspective.
 */
export type Score = {
  cp?: number;
  mate?: number;
};

export type Color = "white" | "black";

export type Classification =
  | "BEST"
  | "GOOD"
  | "INACCURACY"
  | "MISTAKE"
  | "BLUNDER"
  | "MISSED_OPPORTUNITY"
  | "FORCED"
  /** Injected (not from eval-based classifyMove) when the player was in
   *  severe time trouble in a game they lost on time — the insight is
   *  about clock management, not a tactical verdict on the move itself. */
  | "TIME_TROUBLE";

export type TerminationReason =
  | "checkmate"
  | "resignation"
  | "timeout"
  | "abandoned"
  | "agreement"
  | "other";

export type ReplayVerdict =
  | "SAME_AS_ORIGINAL"
  | "SAME_AS_BEST"
  | "IMPROVEMENT"
  | "SIMILAR"
  | "WORSE";

export type ImportanceTier = "CRITICAL" | "NOTABLE" | "MINOR";

export interface ParsedMove {
  ply: number; // 1-based half-move index
  moveNumber: number;
  color: Color;
  san: string;
  uci: string;
  fenBefore: string;
  fenAfter: string;
  /** Seconds remaining on the mover's clock after this move, if the PGN included %clk annotations. */
  clockSeconds?: number | null;
}

/**
 * The layer a player reads first: the whole verdict in three short lines,
 * scannable in a few seconds so a game can be reviewed at the pace of a
 * game rather than the pace of an essay.
 *
 * Short is not the same as shallow — each line still has to name the
 * concrete thing (a square, a piece, a principle), because a summary that
 * only says "this was inaccurate" leaves the player exactly where they
 * started. The deeper fields below stay one click away for when three lines
 * genuinely aren't enough.
 */
export interface ExplanationSummary {
  /** What actually happened, in one sentence. */
  headline: string;
  /** Why the engine's move is stronger, in one sentence. */
  betterMove: string;
  /** The lesson, in a short clause. */
  takeaway: string;
}

/**
 * One move of the engine's line with a short note on what it accomplishes.
 *
 * The engine's best line routinely opens with something that looks wrong —
 * conceding a pawn, allowing a capture — and raw notation gives a player no
 * way to tell a blunder from a deliberate concession. "Nd7 Qxd5 a6 Nc3 c6"
 * reads as "let the queen take my pawn for free" unless someone points out
 * that c6 then hits the queen and the knight at once.
 */
export interface LineStep {
  /** Verbatim from the principal variation, in order — never a move the engine didn't give. */
  move: string;
  /** A few words on what this move accomplishes. */
  note: string;
}

export interface StructuredExplanation {
  /**
   * Optional only for backwards compatibility: explanations generated
   * before the summary layer existed are stored as JSON on the reflection
   * and can't gain fields retroactively. Read it through
   * `explanationSummary()` in lib/explanation-summary.ts, which derives a
   * summary from the deep fields when this is absent, rather than testing
   * for it at each call site.
   */
  summary?: ExplanationSummary;
  /**
   * Optional: absent on explanations generated before it existed, on
   * template-generated ones (which have no way to say what a move
   * accomplishes), and whenever the model's steps didn't match the engine's
   * actual line. The UI falls back to plain notation.
   */
  lineWalkthrough?: LineStep[];
  whatYourMoveDid: string;
  whatItMissed: string;
  whyBestIsBetter: string;
  remember: string;
  /** A short note on whether the replay move fixed the issue. */
  replayNote: string;
  concepts: string[];
  approximate: boolean;
}

/** A detected board concept plus the squares to highlight for it. */
export interface ConceptHighlight {
  concept: string;
  note: string;
  squares: string[];
}

/** Key moment as sent to the client BEFORE the reflection is submitted. */
export interface KeyMomentPublic {
  id: string;
  sortIndex: number;
  ply: number;
  fen: string;
  originalSan: string;
  originalUci: string;
  reviewStatus: "PENDING" | "REVIEWED";
}

/** Full verdict, only ever sent AFTER a reflection has been submitted. */
export interface KeyMomentVerdict extends KeyMomentPublic {
  bestMoveSan: string;
  bestMoveUci: string;
  evalBefore: Score; // White's perspective
  evalAfter: Score; // White's perspective
  selectionReason: string;
  classification: Classification;
  principalVariation: string[];
  conceptHighlights: ConceptHighlight[];
  importanceScore: number;
  importanceTier: ImportanceTier;
  /** Generated once the reflection exists — personalized to this reasoning + replay move. */
  explanation: StructuredExplanation;
  reflection: {
    thoughts: string;
    replaySame: boolean;
    replayMoveSan: string;
    replayMoveUci: string;
    confidence: number;
    tags: string[];
    followUpQuestion: string | null;
    followUpAnswer: string | null;
    replayEval: Score | null;
    replayVerdict: ReplayVerdict | null;
    createdAt: string;
  };
}
