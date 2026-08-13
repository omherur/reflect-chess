import type { ExplanationSummary, StructuredExplanation } from "@/lib/types";

/**
 * Reading an explanation should start with three short lines, not four
 * paragraphs. Freshly generated explanations carry that summary layer with
 * them; explanations written before the layer existed are already stored as
 * JSON on their reflection and can't gain fields retroactively, so this
 * derives one from the deep fields instead of showing an old review with a
 * hole in it.
 *
 * Every caller should go through here rather than reading `explanation.summary`
 * directly, so the two cases stay indistinguishable at the call site.
 */
export function explanationSummary(explanation: StructuredExplanation): ExplanationSummary {
  const summary = explanation.summary;
  if (
    summary &&
    summary.headline?.trim() &&
    summary.betterMove?.trim() &&
    summary.takeaway?.trim()
  ) {
    return {
      headline: summary.headline.trim(),
      betterMove: summary.betterMove.trim(),
      takeaway: summary.takeaway.trim(),
    };
  }

  return {
    headline: firstSentence(headlineSource(explanation)),
    betterMove: firstSentence(explanation.whyBestIsBetter),
    takeaway: firstSentence(explanation.remember),
  };
}

/**
 * For a move that went wrong, what it missed IS the headline — that's the
 * thing the player didn't see. When nothing was missed (the move was
 * already best, or forced), that field says so in a few words and makes a
 * useless headline, so what the move actually did leads instead.
 */
function headlineSource(explanation: StructuredExplanation): string {
  const missed = explanation.whatItMissed.trim();
  const saysNothingWasMissed = /^nothing\b/i.test(missed) || missed.length < 25;
  return saysNothingWasMissed ? explanation.whatYourMoveDid : missed;
}

/**
 * The first sentence of a passage.
 *
 * Written as a scan rather than one regex because chess prose breaks the
 * obvious rules twice over. A sentence ends at punctuation followed by a
 * capital letter, except that "2. Nf3" is exactly that shape and is not a
 * sentence end — so a period directly after a digit is treated as a move
 * number. (A lookbehind would express this more directly, but it postdates
 * this project's compile target, and this runs in the browser too.)
 */
export function firstSentence(text: string): string {
  const trimmed = text.trim();
  for (let i = 0; i < trimmed.length; i++) {
    const char = trimmed[i];
    if (char !== "." && char !== "!" && char !== "?") continue;

    const previous = trimmed[i - 1];
    if (previous && previous >= "0" && previous <= "9") continue; // move number

    const rest = trimmed.slice(i + 1);
    if (!rest.trim()) return trimmed; // punctuation ends the text
    if (/^\s+[A-Z]/.test(rest)) return trimmed.slice(0, i + 1);
  }
  return trimmed;
}
