import type { GameSummaryInput, GameSummaryProvider, StructuredGameSummary } from "./types";

/**
 * Wraps a primary (Claude) provider with a deterministic fallback, same
 * shape as FallbackExplanationProvider in src/server/explain — if the
 * primary throws (API error, timeout, malformed response), the fallback
 * runs instead, so a flaky or unconfigured LLM call never blocks the
 * summary page.
 */
export class FallbackGameSummaryProvider implements GameSummaryProvider {
  constructor(
    private readonly primary: GameSummaryProvider,
    private readonly fallback: GameSummaryProvider
  ) {}

  async generateSummary(input: GameSummaryInput): Promise<StructuredGameSummary> {
    try {
      return await this.primary.generateSummary(input);
    } catch (err) {
      console.error(
        "[summary] Claude API call failed — falling back to the deterministic template. Triggering error:",
        err
      );
      return this.fallback.generateSummary(input);
    }
  }
}
