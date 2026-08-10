import type {
  Classification,
  Color,
  ConceptHighlight,
  ReplayVerdict,
  Score,
  StructuredExplanation,
} from "@/lib/types";

/**
 * Everything needed to generate a personalized explanation for one key
 * moment. This is only ever assembled AFTER a reflection exists — it
 * includes the user's own reasoning and replay move, so it can't be
 * computed any earlier than that (see reflect route).
 */
export interface ExplainInput {
  fenBefore: string;
  originalSan: string;
  originalUci: string;
  bestSan: string;
  bestUci: string;
  classification: Classification;
  moverColor: Color;
  /** Scores from the mover's perspective. */
  evalBeforeMover: Score;
  evalAfterMover: Score;
  principalVariationSan: string[];
  /** Concrete concepts (with squares) detected on the position after the original move. */
  conceptHighlights: ConceptHighlight[];

  /** The user's own words, captured before any of this was revealed. */
  userThoughts: string;
  replaySan: string;
  replayUci: string;
  replaySame: boolean;
  /** Eval after the replay move, mover's perspective. */
  evalAfterReplayMover: Score;
  replayVerdict: ReplayVerdict;
  /** Concrete concepts detected on the position AFTER the replay move — grounds why a worse replay is worse. */
  replayConceptHighlights: ConceptHighlight[];

  /**
   * Seconds left on the player's clock when they played the original move,
   * if the PGN had clock data. When low, the explanation should distinguish
   * "you were in time trouble" from "you miscalculated" rather than judging
   * both the same way.
   */
  clockSecondsAtMove: number | null;
}

/** Optional identifiers threaded through purely for monitoring/logging — never affects generated content. */
export interface ExplainContext {
  gameId?: string;
  keyMomentId?: string;
}

/**
 * Explanation provider interface. The default implementation calls the
 * Claude API for a warm, specific, personalized explanation; a
 * deterministic template-based implementation is used as a fallback (and
 * can also be used directly, e.g. when no API key is configured).
 */
export interface ExplanationProvider {
  explainMove(input: ExplainInput, context?: ExplainContext): Promise<StructuredExplanation>;
}
