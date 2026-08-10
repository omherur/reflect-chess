/**
 * Tracks recently generated explanations in-memory so two classes of the
 * recurring template-fallback bug (see CLAUDE.md §6) become visible
 * automatically instead of requiring a user to notice repeated phrasing:
 *
 * 1. A live similarity check: if two explanations for genuinely different
 *    key moments, both reported as AI-generated, share an unusually high
 *    fraction of their non-move vocabulary in "whyBestIsBetter", that's the
 *    exact signature of the bug (generic wrapper phrasing survives even
 *    when the substituted SAN/eval numbers differ).
 * 2. A queryable log (see getRecentExplanations) for the admin debug view,
 *    showing which recent explanations were AI-generated vs. fell back.
 */
import type { Classification } from "@/lib/types";

export type ExplanationSource = "ai" | "ai-patched" | "template";

export interface ExplanationLogEntry {
  timestamp: number;
  source: ExplanationSource;
  classification: Classification;
  originalSan: string;
  bestSan: string;
  whyBestIsBetter: string;
  gameId?: string;
  keyMomentId?: string;
  /** Set when source is "template" as a fallback from a failed AI call — the triggering error, if any. */
  fallbackReason?: string;
}

const HISTORY_LIMIT = 50;
const SIMILARITY_THRESHOLD = 0.55;
const history: ExplanationLogEntry[] = [];

const MOVE_TOKEN = /^(?:o-o-o|o-o|[nbrqk]?[a-h]?[1-8]?x?[a-h][1-8](?:=[nbrq])?[+#]?)$/;

function significantWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\w\s-]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !MOVE_TOKEN.test(w) && !/^\d+$/.test(w))
  );
}

/** Dice coefficient over normalized word sets — 0 (nothing shared) to 1 (identical vocabulary). */
export function textSimilarity(a: string, b: string): number {
  const setA = significantWords(a);
  const setB = significantWords(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let overlap = 0;
  for (const w of setA) if (setB.has(w)) overlap++;
  return (2 * overlap) / (setA.size + setB.size);
}

function checkForRegression(entry: ExplanationLogEntry): void {
  if (entry.source === "template") return;
  for (const prior of history) {
    if (prior.source === "template") continue;
    if (prior.originalSan === entry.originalSan && prior.classification === entry.classification) continue;
    const sim = textSimilarity(prior.whyBestIsBetter, entry.whyBestIsBetter);
    if (sim >= SIMILARITY_THRESHOLD) {
      console.error(
        `[explain] POSSIBLE TEMPLATE-FALLBACK REGRESSION: explanation for ${entry.originalSan} (${entry.classification}) shares ${Math.round(
          sim * 100
        )}% of its "whyBestIsBetter" vocabulary with an earlier explanation for ${prior.originalSan} (${prior.classification}), despite both being reported as AI-generated (source=${entry.source}/${prior.source}). This is the signature of the recurring templated-repetition bug — verify ANTHROPIC_API_KEY is set and check recent [explain] logs for silent fallbacks.`
      );
      return;
    }
  }
}

export function recordExplanation(entry: Omit<ExplanationLogEntry, "timestamp">): void {
  const full: ExplanationLogEntry = { ...entry, timestamp: Date.now() };
  checkForRegression(full);
  history.push(full);
  if (history.length > HISTORY_LIMIT) history.shift();
}

export function getRecentExplanations(limit = HISTORY_LIMIT): ExplanationLogEntry[] {
  return history.slice(-limit).reverse();
}

/** Test-only: reset the in-memory log between test cases. */
export function _resetForTests(): void {
  history.length = 0;
}
