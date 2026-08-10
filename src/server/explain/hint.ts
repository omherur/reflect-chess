import type { ConceptHighlight } from "@/lib/types";
import { hashCode } from "./hash";

/**
 * A soft, partial nudge shown BEFORE the user submits their reflection —
 * never names a move, never mentions an evaluation, never says whether the
 * original move was good or bad. It's a hint toward what to look for, not
 * a verdict, so it doesn't count as revealing the engine's answer.
 */
const CONCEPT_HINTS: Record<string, string> = {
  "hanging piece": "Take a closer look at whether every piece on the board is actually protected right now.",
  fork: "Watch for a move that lets a single piece threaten two things at once.",
  pin: "Check whether any piece is pinned before counting on it to do a job.",
  "back-rank weakness": "There's something about back-rank safety worth thinking through in this position.",
  "king exposure": "There's a way to improve king safety here — for one side or the other.",
};

const GENERIC_HINTS = [
  "Look for a move that does more than develop naturally — something that directly addresses what's happening on the board.",
  "Before deciding, scan the whole board once more for anything either side is threatening.",
  "Consider what your opponent's most dangerous idea is, and whether this position lets you deal with it directly.",
];

export function generateHint(conceptHighlights: ConceptHighlight[], seed: string): string {
  for (const h of conceptHighlights) {
    const hint = CONCEPT_HINTS[h.concept];
    if (hint) return hint;
  }
  // Deterministic-but-varied fallback so repeated hint-less positions don't
  // all read identically — keyed off something stable per key moment.
  const index = Math.abs(hashCode(seed)) % GENERIC_HINTS.length;
  return GENERIC_HINTS[index];
}
