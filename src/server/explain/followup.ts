import type { ConceptHighlight } from "@/lib/types";
import { hashCode } from "./hash";

/**
 * Detects a reflection answer too thin to actually learn anything from —
 * triggers a single adaptive follow-up question, never a repeating loop
 * (the caller only asks once per key moment). Purely about the shape of
 * the player's own words; never looks at engine data, so this check itself
 * can't leak anything ahead of the reveal.
 */
const MIN_SUBSTANTIVE_WORDS = 8;

const FILLER_ONLY_PATTERNS = [
  /^i\s*don'?t\s*know\.?$/i,
  /^not\s*sure\.?$/i,
  /^just\s*felt\s*right\.?$/i,
  /^(it\s*)?seemed\s*(ok|okay|good|fine|right)\.?$/i,
  /^no\s*(real\s*)?reason\.?$/i,
  /^(just\s*)?instinct\.?$/i,
];

export function isThinReflection(thoughts: string): boolean {
  const trimmed = thoughts.trim();
  if (trimmed.length === 0) return true;
  if (FILLER_ONLY_PATTERNS.some((p) => p.test(trimmed))) return true;
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  return wordCount < MIN_SUBSTANTIVE_WORDS;
}

/**
 * One targeted, non-revealing follow-up question in the coach persona —
 * never names a move, never mentions an evaluation. Same non-revealing
 * standard as generateHint, and deliberately reuses the position's
 * detected concepts only to pick a more specific angle, not to hint at
 * the verdict.
 */
const CONCEPT_FOLLOWUPS: Record<string, string> = {
  "hanging piece": "Did you check that everything was actually defended before settling on this?",
  fork: "Was there a particular square you were watching a piece jump to?",
  pin: "Did you consider whether any of your pieces were tied down before relying on them?",
  skewer: "Did you look at what was lined up behind your pieces on that file or diagonal?",
  "back-rank weakness": "Did you think about your king's escape squares at all here?",
  "king exposure": "Were you thinking about king safety, or mainly about something else?",
};

const SETTLED_ON_MOVE_QUESTION = "What made you settle on this move over other options you considered?";

const GENERIC_FOLLOWUPS = [
  "Did you look for anything else before playing this?",
  SETTLED_ON_MOVE_QUESTION,
  "Was there a specific threat or plan behind it, even a rough one?",
];

/**
 * `replaySame` is whether the player's replay pick matched their original
 * move. SETTLED_ON_MOVE_QUESTION presupposes they chose something over
 * other options — nothing to explain there if they replayed the exact same
 * move, so it's excluded from the pool in that case.
 */
export function generateFollowUpQuestion(
  conceptHighlights: ConceptHighlight[],
  seed: string,
  replaySame = false
): string {
  for (const h of conceptHighlights) {
    const q = CONCEPT_FOLLOWUPS[h.concept];
    if (q) return q;
  }
  const pool = replaySame ? GENERIC_FOLLOWUPS.filter((q) => q !== SETTLED_ON_MOVE_QUESTION) : GENERIC_FOLLOWUPS;
  const index = Math.abs(hashCode(seed)) % pool.length;
  return pool[index];
}
