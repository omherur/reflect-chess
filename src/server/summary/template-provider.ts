import type { GameSummaryInput, GameSummaryProvider, StructuredGameSummary, SummaryMistake } from "./types";

function severityRank(classification: string): number {
  return classification === "BLUNDER" ? 3 : classification === "MISTAKE" ? 2 : 1;
}

/** Most frequent key with at least 2 occurrences — "recurring" means more than once. */
function mostCommon(freq: Record<string, number>): [string, number] | null {
  let best: [string, number] | null = null;
  for (const [key, count] of Object.entries(freq)) {
    if (count < 2) continue;
    if (!best || count > best[1]) best = [key, count];
  }
  return best;
}

function worstMistake(mistakes: SummaryMistake[]): SummaryMistake {
  return [...mistakes].sort((a, b) => severityRank(b.classification) - severityRank(a.classification))[0];
}

function buildNarrative(input: GameSummaryInput): string {
  const { mistakes, whitePlayer, blackPlayer, userColor } = input;
  const opponent = userColor === "white" ? blackPlayer : whitePlayer;
  if (mistakes.length === 0) {
    return `A clean game against ${opponent} — none of your reviewed moments fell into the mistake, blunder, or missed-opportunity tier.`;
  }
  const blunderCount = mistakes.filter((m) => m.classification === "BLUNDER").length;
  const mistakeCount = mistakes.filter((m) => m.classification === "MISTAKE").length;
  const missedCount = mistakes.filter((m) => m.classification === "MISSED_OPPORTUNITY").length;
  const parts: string[] = [];
  if (blunderCount > 0) parts.push(`${blunderCount} blunder${blunderCount === 1 ? "" : "s"}`);
  if (mistakeCount > 0) parts.push(`${mistakeCount} mistake${mistakeCount === 1 ? "" : "s"}`);
  if (missedCount > 0) parts.push(`${missedCount} missed opportunit${missedCount === 1 ? "y" : "ies"}`);
  const tally = parts.join(", ");
  const worst = worstMistake(mistakes);
  const worstDescriptor = worst.classification === "BLUNDER" ? "a real turning point" : "a moment that gave back real ground";
  const moveRef = `${worst.moveNumber}${worst.color === "black" ? "…" : "."}${worst.san}`;
  return `Against ${opponent}, you had ${tally} across the moments reviewed. The costliest was ${moveRef} — ${worstDescriptor}. Outside those specific moments, the rest of your game held up reasonably well.`;
}

function buildRecurringPattern(input: GameSummaryInput): string | null {
  // A recurring pattern is a habit that shows up across separate mistakes
  // in THIS game — tags first (the player's own self-described reasoning
  // gap), then detected concepts, since both are more concrete than eval
  // numbers alone.
  const tagFreq: Record<string, number> = {};
  for (const m of input.mistakes) for (const tag of m.tags) tagFreq[tag] = (tagFreq[tag] ?? 0) + 1;
  const topTag = mostCommon(tagFreq);
  if (topTag) {
    const [tag, count] = topTag;
    return `"${tag}" came up in ${count} of your ${input.mistakes.length} mistakes this game — that's a real pattern, not just one-off errors.`;
  }

  const conceptFreq: Record<string, number> = {};
  for (const m of input.mistakes) for (const c of m.concepts) conceptFreq[c] = (conceptFreq[c] ?? 0) + 1;
  const topConcept = mostCommon(conceptFreq);
  if (topConcept) {
    const [concept, count] = topConcept;
    return `${count} of your mistakes this game involved a ${concept} — worth specifically drilling that before your next game.`;
  }

  return null;
}

function buildFocusAdvice(input: GameSummaryInput, recurringPattern: string | null): string {
  if (input.mistakes.length === 0) {
    return "Keep trusting the calculation that got you through this game — nothing here needs fixing.";
  }
  if (recurringPattern) {
    return "That's what showed up more than once today, so make it the one thing you actively check for in your next game — not everything at once, just this.";
  }
  const worst = worstMistake(input.mistakes);
  return `Your mistakes this game didn't share an obvious common thread, so there's no single fix — but ${worst.san} (move ${worst.moveNumber}) is the one worth reviewing most closely on your own before your next game.`;
}

function buildConfidenceObservation(input: GameSummaryInput): string | null {
  if (input.mistakes.length === 0) return null;
  const { highConfidenceMistakeCount, mistakes } = input;
  if (highConfidenceMistakeCount === 0) {
    return "You generally sensed something was off in your mistakes this game — none of them were played with high confidence.";
  }
  return `You were highly confident (4-5) in ${highConfidenceMistakeCount} of your ${mistakes.length} mistake${
    mistakes.length === 1 ? "" : "s"
  } this game — worth noticing when that certainty doesn't match the board.`;
}

/**
 * Deterministic, non-LLM game summary — satisfies GameSummaryProvider
 * directly (used when no API key is configured) and doubles as the
 * fallback when the Claude-backed provider fails. Every field is derived
 * from real counts/frequencies in the input, never an invented claim.
 */
export class TemplateGameSummaryProvider implements GameSummaryProvider {
  async generateSummary(input: GameSummaryInput): Promise<StructuredGameSummary> {
    const recurringPattern = buildRecurringPattern(input);
    return {
      narrative: buildNarrative(input),
      recurringPattern,
      focusAdvice: buildFocusAdvice(input, recurringPattern),
      confidenceObservation: buildConfidenceObservation(input),
      estimatedRating: input.estimatedRating,
    };
  }
}
