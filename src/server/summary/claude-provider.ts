import Anthropic from "@anthropic-ai/sdk";
import type { GameSummaryInput, GameSummaryProvider, StructuredGameSummary } from "./types";

const MODEL = "claude-sonnet-5";
const TIMEOUT_MS = 25_000;
const MAX_TOKENS = 1600;

export const SUMMARY_SYSTEM_PROMPT = `You are a warm, honest chess coach giving a player a short debrief right after they finished reviewing every key moment of one game — reasoning, replay move, confidence, and tags for each. You've seen everything they wrote. This is a whole-game synthesis, not another single-move explanation.

## GROUND EVERYTHING IN THE ACTUAL DATA

You are given the exact list of this game's mistake-tier moments (MISTAKE/BLUNDER/MISSED_OPPORTUNITY), each with the move, the player's own reasoning captured before reveal, their confidence rating, their self-selected tags, and how their replay attempt went. You are NOT given engine evaluations to reason from beyond what's already summarized — never invent a tactical claim, a square, or a piece that isn't named in the input. If there's nothing concrete to point to, say so plainly rather than inventing a detail.

## SYNTHESIZE, DON'T LIST

The "narrative" field must read as a short synthesis — 2-4 sentences that tell the story of this game's key mistakes, not a bullet-by-bullet recap. Reference specific moves by name, but connect them into a coherent read of how the game actually went wrong (or didn't).

## RECURRING PATTERN — ONLY IF IT'S REAL

"recurringPattern" should name a genuine reasoning habit that shows up across MULTIPLE separate mistakes in this specific game (e.g. the same self-selected tag, the same detected concept, a repeated kind of oversight visible in their own reasoning text). If the mistakes in this game don't actually share a pattern — different causes, different kinds of errors — say so honestly and set this to null. Never manufacture a pattern that isn't there; a false pattern is worse than no pattern.

## FOCUS ADVICE MUST BE SPECIFIC TO THIS GAME

"focusAdvice" is one concrete thing to work on, grounded in what actually happened in THIS game — not a generic chess proverb. If there's a recurring pattern, the advice should point directly at fixing that one thing. If there isn't, point at the single most costly mistake instead of trying to cover everything.

## CONFIDENCE AND TAGS

Reference the player's own confidence ratings and tags where they're actually informative (e.g. "you were highly confident in 3 of your 4 mistakes" is a real, useful observation — noticing overconfidence is valuable; so is noticing the opposite). If confidence/tags don't show anything meaningful this game, set "confidenceObservation" to null rather than forcing an observation.

## NEVER MENTION A RATING NUMBER

Do not state or estimate any numeric rating yourself — that's computed separately and shown alongside your text. Never write a number that looks like a rating (e.g. "1400", "~1200 level") anywhere in your response.

## OUTPUT FORMAT

Respond with ONLY a single JSON object (no markdown fences, no commentary) with exactly these keys:
- "narrative": string, 2-4 sentences, per SYNTHESIZE above.
- "recurringPattern": string or null, per RECURRING PATTERN above.
- "focusAdvice": string, one to two sentences, per FOCUS ADVICE above.
- "confidenceObservation": string or null, per CONFIDENCE AND TAGS above.`;

interface ClaudeSummaryResponseShape {
  narrative: string;
  recurringPattern: string | null;
  focusAdvice: string;
  confidenceObservation: string | null;
}

export function buildSummaryUserPrompt(input: GameSummaryInput): string {
  const opponent = input.userColor === "white" ? input.blackPlayer : input.whitePlayer;
  const lines = [
    `Game: you played ${input.userColor} against ${opponent}. Result: ${input.result}${
      input.terminationReason ? ` (${input.terminationReason})` : ""
    }.`,
    `Total key moments reviewed: ${input.totalKeyMoments}. Of those, ${input.goodMomentCount} were BEST/GOOD, and ${input.mistakes.length} were mistake-tier (MISTAKE/BLUNDER/MISSED_OPPORTUNITY).`,
    ``,
    `Mistake-tier moments, in order:`,
  ];
  if (input.mistakes.length === 0) {
    lines.push("(none — this was a clean game by the reviewed moments)");
  }
  for (const m of input.mistakes) {
    lines.push(
      `- Move ${m.moveNumber}${m.color === "black" ? "…" : "."}${m.san} [${m.classification}]${
        m.concepts.length > 0 ? ` — detected concepts: ${m.concepts.join(", ")}` : ""
      }`
    );
    lines.push(`  Player's reasoning (captured before reveal): "${m.thoughts}"`);
    lines.push(`  Confidence: ${m.confidence}/5. Tags: ${m.tags.length > 0 ? m.tags.join(", ") : "none"}.`);
    lines.push(`  Replay result: ${m.replayVerdict ?? "unknown"}.`);
  }
  const tagEntries = Object.entries(input.tagFrequency);
  if (tagEntries.length > 0) {
    lines.push(``, `Tag frequency across ALL reviewed moments this game (not just mistakes): ${tagEntries.map(([t, c]) => `${t}=${c}`).join(", ")}.`);
  }
  return lines.join("\n");
}

function extractText(message: Anthropic.Message): string {
  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

export function parseSummaryResponse(text: string): ClaudeSummaryResponseShape {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  const parsed = JSON.parse(cleaned);
  if (typeof parsed.narrative !== "string" || !parsed.narrative.trim()) {
    throw new Error('Claude summary response missing or empty field "narrative"');
  }
  if (typeof parsed.focusAdvice !== "string" || !parsed.focusAdvice.trim()) {
    throw new Error('Claude summary response missing or empty field "focusAdvice"');
  }
  return {
    narrative: parsed.narrative,
    recurringPattern: typeof parsed.recurringPattern === "string" ? parsed.recurringPattern : null,
    focusAdvice: parsed.focusAdvice,
    confidenceObservation: typeof parsed.confidenceObservation === "string" ? parsed.confidenceObservation : null,
  };
}

export class ClaudeGameSummaryProvider implements GameSummaryProvider {
  private readonly client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async generateSummary(input: GameSummaryInput): Promise<StructuredGameSummary> {
    const message = await this.client.messages.create(
      {
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SUMMARY_SYSTEM_PROMPT,
        thinking: { type: "disabled" },
        messages: [{ role: "user", content: buildSummaryUserPrompt(input) }],
      },
      { timeout: TIMEOUT_MS }
    );

    const text = extractText(message);
    if (!text) {
      const blockTypes = message.content.map((b) => b.type).join(", ") || "none";
      throw new Error(
        `Claude returned an empty game-summary response (stop_reason: ${message.stop_reason}, output_tokens: ${message.usage.output_tokens}, content blocks: [${blockTypes}])`
      );
    }
    const parsed = parseSummaryResponse(text);

    return {
      narrative: parsed.narrative.trim(),
      recurringPattern: parsed.recurringPattern?.trim() || null,
      focusAdvice: parsed.focusAdvice.trim(),
      confidenceObservation: parsed.confidenceObservation?.trim() || null,
      // Always the deterministic value, never taken from the model.
      estimatedRating: input.estimatedRating,
    };
  }
}
