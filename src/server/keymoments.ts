import type { KeyMoment, Reflection } from "@prisma/client";
import { compareReplay, toPerspective } from "@/lib/chess/eval";
import type {
  ConceptHighlight,
  ImportanceTier,
  KeyMomentPublic,
  KeyMomentVerdict,
  ReplayVerdict,
  Score,
  StructuredExplanation,
} from "@/lib/types";

function scoreFromFields(cp: number | null, mate: number | null): Score {
  if (mate !== null) return { mate };
  return { cp: cp ?? 0 };
}

/**
 * The single gate that decides what a client is allowed to see about a key
 * moment. PENDING moments (no reflection yet) get ONLY historical fact —
 * the position and the move actually played. Nothing engine-derived: no
 * classification, no importance tier/score, no concepts, no explanation.
 * This is the one place that rule is enforced server-side, so every caller
 * that serializes a KeyMoment for the client must go through it.
 *
 * Eval fields are returned in White's perspective (same as storage) —
 * callers convert to the player's perspective for display, since every
 * KeyMoment is one of the user's own moves.
 */
export function toClientView(
  km: KeyMoment,
  reflection: Reflection | null
): KeyMomentPublic | KeyMomentVerdict {
  const publicView: KeyMomentPublic = {
    id: km.id,
    sortIndex: km.sortIndex,
    ply: km.ply,
    fen: km.fen,
    originalSan: km.originalSan,
    originalUci: km.originalUci,
    reviewStatus: km.reviewStatus as "PENDING" | "REVIEWED",
  };

  if (!reflection || km.reviewStatus !== "REVIEWED") {
    return publicView;
  }

  const evalBeforeWhite = scoreFromFields(km.evalBeforeCp, km.evalBeforeMate);
  const evalAfterWhite = scoreFromFields(km.evalAfterCp, km.evalAfterMate);
  const replayEvalWhite =
    reflection.replayEvalCp !== null || reflection.replayEvalMate !== null
      ? scoreFromFields(reflection.replayEvalCp, reflection.replayEvalMate)
      : null;

  return {
    ...publicView,
    bestMoveSan: km.bestMoveSan,
    bestMoveUci: km.bestMoveUci,
    evalBefore: evalBeforeWhite,
    evalAfter: evalAfterWhite,
    selectionReason: km.selectionReason,
    classification: km.classification as KeyMomentVerdict["classification"],
    principalVariation: JSON.parse(km.principalVariation) as string[],
    conceptHighlights: JSON.parse(km.conceptHighlights) as ConceptHighlight[],
    importanceScore: km.importanceScore,
    importanceTier: km.importanceTier as ImportanceTier,
    explanation: JSON.parse(reflection.explanation) as StructuredExplanation,
    reflection: {
      thoughts: reflection.thoughts,
      replaySame: reflection.replaySame,
      replayMoveSan: reflection.replayMoveSan,
      replayMoveUci: reflection.replayMoveUci,
      confidence: reflection.confidence,
      tags: JSON.parse(reflection.tags) as string[],
      followUpQuestion: reflection.followUpQuestion,
      followUpAnswer: reflection.followUpAnswer,
      replayEval: replayEvalWhite,
      replayVerdict: (reflection.replayVerdict as ReplayVerdict | null) ?? null,
      createdAt: reflection.createdAt.toISOString(),
    },
  };
}

export { compareReplay, toPerspective };
