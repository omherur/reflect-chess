import { TemplateGameSummaryProvider } from "./template-provider";
import type { GameSummaryInput, GameSummaryProvider, StructuredGameSummary } from "./types";

export { TemplateGameSummaryProvider };

let cachedProvider: GameSummaryProvider | null = null;
let cachedHasApiKey: boolean | null = null;

async function getProvider(): Promise<GameSummaryProvider> {
  if (cachedProvider) return cachedProvider;
  const template = new TemplateGameSummaryProvider();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  cachedHasApiKey = Boolean(apiKey);
  if (!apiKey) {
    cachedProvider = template;
    return cachedProvider;
  }
  const { ClaudeGameSummaryProvider } = await import("./claude-provider");
  const { FallbackGameSummaryProvider } = await import("./fallback-provider");
  cachedProvider = new FallbackGameSummaryProvider(new ClaudeGameSummaryProvider(apiKey), template);
  return cachedProvider;
}

export async function generateGameSummary(input: GameSummaryInput): Promise<StructuredGameSummary> {
  const provider = await getProvider();
  if (cachedHasApiKey === false) {
    console.warn(
      "[summary] No ANTHROPIC_API_KEY configured — using the deterministic template, not a real AI-generated summary."
    );
  }
  return provider.generateSummary(input);
}
