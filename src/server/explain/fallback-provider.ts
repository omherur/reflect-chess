import type { StructuredExplanation } from "@/lib/types";
import { applyGrounding, findGroundingViolations, verifiedConceptVocabulary } from "./concepts";
import { recordExplanation } from "./monitor";
import type { ExplainContext, ExplainInput, ExplanationProvider } from "./types";

/**
 * Wraps a primary provider with a fallback. If the primary throws (API
 * error, timeout, malformed response) the fallback runs instead, so a
 * flaky or unconfigured LLM call never breaks the review flow.
 *
 * Also runs the grounding check: the model is only allowed to reference
 * tactical concepts (pin, fork, skewer, etc.) that the deterministic
 * detectors actually verified for this position. If it names one that
 * isn't in that verified list, the affected field(s) are patched with the
 * deterministic template's text for the same input, which by construction
 * never names an unverified concept.
 */
export class FallbackExplanationProvider implements ExplanationProvider {
  constructor(
    private readonly primary: ExplanationProvider,
    private readonly fallback: ExplanationProvider
  ) {}

  async explainMove(input: ExplainInput, context: ExplainContext = {}): Promise<StructuredExplanation> {
    const logBase = {
      classification: input.classification,
      originalSan: input.originalSan,
      bestSan: input.bestSan,
      gameId: context.gameId,
      keyMomentId: context.keyMomentId,
    };

    let primaryResult: StructuredExplanation;
    try {
      primaryResult = await this.primary.explainMove(input);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error(
        "[explain] Claude API call failed — falling back to the deterministic template. Triggering error:",
        err
      );
      const fallbackResult = await this.fallback.explainMove(input);
      recordExplanation({ ...logBase, source: "template", whyBestIsBetter: fallbackResult.whyBestIsBetter, fallbackReason: reason });
      return fallbackResult;
    }

    // The allow-list is what the BOARD supports, not what the UI chose to
    // show. The displayed concepts are a strict subset — see
    // verifiedConceptVocabulary for the case where using the subset alone
    // silently gutted three of four fields.
    const verified = verifiedConceptVocabulary(
      input.fenBefore,
      input.originalUci,
      input.principalVariationSan
    );
    const originalConcepts = [...input.conceptHighlights.map((c) => c.concept), ...verified];
    const replayConcepts = input.replayConceptHighlights.map((c) => c.concept);
    const violations = findGroundingViolations(primaryResult, originalConcepts, replayConcepts);
    if (violations.length === 0) {
      recordExplanation({ ...logBase, source: "ai", whyBestIsBetter: primaryResult.whyBestIsBetter });
      return primaryResult;
    }

    console.warn(
      "[explain] Ungrounded tactical claim(s) detected, patching from template:",
      violations.map((v) => `${v.field}:${v.concept}`).join(", ")
    );
    const templateResult = await this.fallback.explainMove(input);
    const patched = applyGrounding(primaryResult, templateResult, violations);
    recordExplanation({ ...logBase, source: "ai-patched", whyBestIsBetter: patched.whyBestIsBetter });
    return patched;
  }
}
