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

export interface StructuredExplanation {
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
