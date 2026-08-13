import { formatScore, describeScore } from "@/lib/chess/eval";
import { firstSentence } from "@/lib/explanation-summary";
import type { ConceptHighlight, ExplanationSummary, StructuredExplanation } from "@/lib/types";
import { computeApproximate } from "./concepts";
import { LOW_CLOCK_SECONDS } from "@/server/analysis/key-moments";
import { recordExplanation } from "./monitor";
import type { ExplainContext, ExplainInput, ExplanationProvider } from "./types";

/**
 * Deterministic, template-based explanation provider. No LLM calls — this
 * satisfies ExplanationProvider so it can be used directly, and doubles as
 * the fallback when the Claude-backed provider fails or times out.
 *
 * Same standard as the Claude provider: the evaluation number is never the
 * stated reason a move is good or bad — it's a trailing "(engine: ...)"
 * note at most. The concrete squares/pieces from concept detection are the
 * actual explanation.
 */
export class TemplateExplanationProvider implements ExplanationProvider {
  async explainMove(input: ExplainInput): Promise<StructuredExplanation> {
    const {
      classification,
      originalSan,
      bestSan,
      originalUci,
      bestUci,
      evalBeforeMover,
      evalAfterMover,
      conceptHighlights,
      principalVariationSan,
      clockSecondsAtMove,
    } = input;
    const concepts = conceptHighlights.map((c) => c.concept);

    if (classification === "TIME_TROUBLE") {
      return {
        summary: {
          headline: `${originalSan} was played with ${clockSecondsAtMove}s left — there was no time here to look for anything better.`,
          betterMove: `${bestSan} was the engine's choice, but the fix for this one is on the clock, not the board.`,
          takeaway: "Once the clock gets this low, play simple and fast rather than precise.",
        },
        whatYourMoveDid: `${originalSan} was played with the clock running out — ${clockSecondsAtMove}s left is barely enough time to look at the board, let alone calculate.`,
        whatItMissed: `This isn't really about what the move missed on the board — it's that there was no time left to look for anything better. The position itself may have still had options in it.`,
        whyBestIsBetter: `${bestSan} was the engine's suggestion here, but the real fix isn't a better move in this exact spot — it's more time on the clock earlier in the game.`,
        remember: "When your clock gets this low, prioritize simple, safe moves you can play instantly over precise calculation — losing on time costs just as much as losing material.",
        replayNote: describeReplay(input),
        concepts,
        approximate: false,
      };
    }

    const sameMove = originalUci === bestUci;

    const whatYourMoveDid = describeWhatMoveDid(classification, originalSan, sameMove);
    const whatItMissed = describeWhatItMissed(classification, conceptHighlights, sameMove);
    const whyBestIsBetter = describeWhyBestIsBetter(
      classification,
      originalSan,
      bestSan,
      bestUci,
      evalBeforeMover,
      evalAfterMover,
      sameMove,
      principalVariationSan,
      conceptHighlights
    );
    const remember = applyClockContext(
      describeRemember(classification, conceptHighlights),
      clockSecondsAtMove
    );
    const replayNote = describeReplay(input);

    return {
      summary: summarize(input, sameMove, whatYourMoveDid, remember),
      whatYourMoveDid,
      whatItMissed,
      whyBestIsBetter,
      remember,
      replayNote,
      concepts,
      approximate: computeApproximate(classification, concepts),
    };
  }
}

/**
 * The three-line layer the player reads first, built deterministically.
 *
 * It is assembled from the same verified facts as the long fields rather
 * than by shortening them: the first detected concept already names the
 * piece and square in one sentence, and inferPrinciple already knows which
 * idea is at stake, so both compress honestly. `remember` is reused as the
 * takeaway because it is already written as one lesson — but only its first
 * sentence, since the clock-context wrapper can prepend a second one.
 */
function summarize(
  input: ExplainInput,
  sameMove: boolean,
  whatYourMoveDid: string,
  remember: string
): ExplanationSummary {
  const { originalSan, bestSan, bestUci, classification, conceptHighlights } = input;
  const concept = conceptHighlights[0];
  const principle = inferPrinciple(bestUci, bestSan, conceptHighlights);

  let headline: string;
  if (sameMove) {
    headline = `${originalSan} was the strongest move on the board here.`;
  } else if (concept) {
    headline = `After ${originalSan}, ${concept.note}.`;
  } else if (classification === "FORCED" || classification === "BEST" || classification === "GOOD") {
    headline = whatYourMoveDid;
  } else {
    // No verified concept to point at. Naming only the severity ("gave up a
    // small amount of your advantage") tells the player nothing they can
    // use, so the principle at stake goes in the headline instead — it's
    // the most concrete thing that can be said here without inventing a
    // mechanism this provider can't actually see.
    headline = `${originalSan} cost you some ground here, and the difference is about ${principle.name}.`;
  }

  let betterMove: string;
  if (sameMove) {
    betterMove = `${bestSan} was your own move — the engine picked it too.`;
  } else if (classification === "FORCED") {
    betterMove = "There was no alternative here to compare against.";
  } else {
    betterMove = `${bestSan} is about ${principle.name}: it ${principle.clause}.`;
  }

  return { headline, betterMove, takeaway: firstSentence(remember) };
}

/**
 * When the move was played with very little time left, the "what to
 * remember" lesson should distinguish a rushed decision from a genuine
 * miscalculation — otherwise a time-pressure blip reads as a pure thinking
 * error, which isn't a fair or useful lesson.
 */
function applyClockContext(remember: string, clockSecondsAtMove: number | null): string {
  if (clockSecondsAtMove === null || clockSecondsAtMove > LOW_CLOCK_SECONDS) return remember;
  return `You had well under a minute left here (${clockSecondsAtMove}s), so this may have been more about time pressure than a pure miscalculation. Still worth noting for next time: ${remember[0].toLowerCase()}${remember.slice(1)}`;
}

function conceptSentence(h: ConceptHighlight): string {
  // h.note already names the specific pieces and squares involved, so it
  // doesn't need a redundant trailing square list appended.
  return h.note;
}

function describeReplay(input: ExplainInput): string {
  const { replayVerdict, replaySan, originalSan, bestSan, evalAfterReplayMover, evalAfterMover, replayConceptHighlights } =
    input;
  switch (replayVerdict) {
    case "SAME_AS_BEST":
      // replaySan === bestSan by definition here — no need to name the move twice.
      return `You found it! ${replaySan} is the engine's own top choice — with the pressure of the clock off, you landed on exactly the right move.`;
    case "SAME_AS_ORIGINAL":
      return `You replayed the same move, ${replaySan}. That's useful data: your evaluation of the position didn't change even with time to reconsider.`;
    case "IMPROVEMENT": {
      const before = describeScore(evalAfterMover);
      const after = describeScore(evalAfterReplayMover);
      const stillShortOfBest =
        replaySan !== bestSan
          ? ` It doesn't fully solve things the way ${bestSan} does, but it's a real step in the right direction.`
          : "";
      return `Your replay move, ${replaySan}, is a genuine improvement over your original ${originalSan} — it moves you from a position where ${before} to one where ${after}.${stillShortOfBest}`;
    }
    case "WORSE": {
      const problem = replayConceptHighlights[0];
      const detail = problem
        ? ` Specifically, ${conceptSentence(problem)} — a problem ${originalSan} didn't have.`
        : ` It doesn't address what made ${originalSan} a problem, and introduces its own issues instead.`;
      return `${replaySan} is actually worse than ${originalSan}.${detail} ${bestSan} was the move that actually solved the position.`;
    }
    case "SIMILAR":
    default:
      return `${replaySan} lands at a similar evaluation to ${originalSan} — a lateral change rather than a fix. ${bestSan} was the move that actually addressed the position.`;
  }
}

function describeWhatMoveDid(classification: string, san: string, sameMove: boolean): string {
  if (sameMove) return `${san} was the engine's top choice in this position.`;
  switch (classification) {
    case "BEST":
    case "GOOD":
      return `${san} kept the position on track — a reasonable, solid choice.`;
    case "FORCED":
      return `${san} was the only legal move available.`;
    case "MISSED_OPPORTUNITY":
      return `${san} was played in a position where you had a much stronger option — the advantage you had slipped away.`;
    case "INACCURACY":
      return `${san} gave up a small amount of your advantage.`;
    case "MISTAKE":
      return `${san} gave up a significant amount of ground.`;
    case "BLUNDER":
      return `${san} handed over a large advantage.`;
    default:
      return `${san} was played here.`;
  }
}

function describeWhatItMissed(
  classification: string,
  conceptHighlights: ConceptHighlight[],
  sameMove: boolean
): string {
  if (sameMove) return "Nothing — this was the strongest move available.";
  if (classification === "FORCED") return "Nothing to miss — there was no alternative.";
  if (classification === "BEST" || classification === "GOOD") {
    return "Not much — a stronger move existed but the difference is small in practice.";
  }
  if (conceptHighlights.length > 0) {
    return conceptHighlights.map(conceptSentence).join(" Also, ");
  }
  return "It missed a stronger continuation the engine found in this position.";
}

const CENTER_SQUARES = new Set(["d4", "d5", "e4", "e5"]);
const CASTLED_KING_SQUARES = new Set(["g1", "c1", "g8", "c8"]);
const BACK_RANK_SQUARE = /^[a-h][18]$/;

interface Principle {
  name: string;
  /** A clause naming what the move concretely does toward that principle — slots directly into a sentence. */
  clause: string;
}

/**
 * A best-effort, deterministic guess at which chess principle is actually
 * at stake, used only when there's no tactical concept to point to (quiet,
 * "minor moment" positions are exactly where restating the eval difference
 * teaches nothing — see CLAUDE.md §5). This can't reason about the position
 * the way a real analysis (or Claude) can, so it stays intentionally
 * conservative: geometry-based signals only (destination square, origin
 * square), never an invented tactical claim.
 */
function inferPrinciple(bestUci: string, bestSan: string, conceptHighlights: ConceptHighlight[]): Principle {
  const concept = conceptHighlights[0]?.concept;
  if (concept === "hanging piece") {
    return { name: "material safety", clause: "keeps every piece defended instead of leaving one hanging" };
  }
  if (concept === "pin" || concept === "skewer") {
    return { name: "piece activity", clause: "avoids relying on a piece that's tactically tied down" };
  }
  if (concept === "back-rank weakness" || concept === "king exposure") {
    return { name: "king safety", clause: "keeps the king safer instead of leaving it exposed" };
  }
  if (concept === "fork") {
    return {
      name: "piece activity",
      clause: "avoids walking a piece onto a square where a single enemy piece could hit two targets at once",
    };
  }

  const dest = bestUci.slice(2, 4);
  if (bestSan === "O-O" || bestSan === "O-O-O" || CASTLED_KING_SQUARES.has(dest)) {
    return { name: "king safety", clause: "gets the king off the center files before anything else happens" };
  }
  if (CENTER_SQUARES.has(dest)) {
    return {
      name: "center control",
      clause: `stakes a claim on ${dest}, one of the four central squares that matters most for space and piece scope`,
    };
  }
  const origin = bestUci.slice(0, 2);
  if (BACK_RANK_SQUARE.test(origin) && !BACK_RANK_SQUARE.test(dest)) {
    return { name: "piece development", clause: "brings a piece off its starting square and into the game" };
  }
  return { name: "piece activity", clause: "gives this piece more of the board to work with than it had before" };
}

function describeWhyBestIsBetter(
  classification: string,
  originalSan: string,
  bestSan: string,
  bestUci: string,
  evalBeforeMover: { cp?: number; mate?: number },
  evalAfterMover: { cp?: number; mate?: number },
  sameMove: boolean,
  pv: string[],
  conceptHighlights: ConceptHighlight[]
): string {
  const trailingNote = ` (engine: ${formatScore(evalBeforeMover)} vs ${formatScore(evalAfterMover)})`;
  if (sameMove) {
    const line = pv.length > 1 ? ` The engine's main line continues ${pv.slice(1, 5).join(" ")}.` : "";
    return `${bestSan} was already the strongest continuation here.${line}${trailingNote}`;
  }
  if (classification === "FORCED") return "There was no alternative to compare against.";
  // No concepts to ground this in a named tactic — the most concrete thing
  // the deterministic template can still say without inventing detail it
  // doesn't have is naming the underlying principle at stake (see
  // inferPrinciple) and proving it with a real before/after comparison, not
  // a bare "this fixes it" assertion or a restated eval number.
  const principle = inferPrinciple(bestUci, bestSan, conceptHighlights);
  const practicalComparison = `This is about ${principle.name}: ${bestSan} ${principle.clause}, which ${originalSan} didn't — ${originalSan} left the position at a point where ${describeScore(evalAfterMover)}, versus where ${describeScore(evalBeforeMover)} if you'd played ${bestSan}`;
  if (pv.length > 0) {
    const line = ` Engine line: ${pv.slice(0, 5).join(" ")}.`;
    return `${practicalComparison}.${line}${trailingNote}`;
  }
  return `${practicalComparison}.${trailingNote}`;
}

function describeRemember(classification: string, conceptHighlights: ConceptHighlight[]): string {
  if (classification === "BEST" || classification === "GOOD" || classification === "FORCED") {
    return "Keep trusting this kind of calculation — it held up.";
  }
  const concepts = conceptHighlights.map((c) => c.concept);
  const bySquares = (c: string) => conceptHighlights.find((h) => h.concept === c)?.squares.join(", ");

  if (concepts.includes("hanging piece")) {
    const sq = bySquares("hanging piece");
    return `Before moving on, scan for undefended pieces on both sides of the board${sq ? ` — this time it was on ${sq}` : ""}.`;
  }
  if (concepts.includes("fork")) {
    const sq = bySquares("fork");
    return `Watch for a single enemy piece that can jump to a square attacking two of your pieces at once${sq ? ` — here that square was ${sq}` : ""}.`;
  }
  if (concepts.includes("pin")) {
    const sq = bySquares("pin");
    return `Before relying on a piece to defend or attack, check whether it's pinned to something more valuable${sq ? ` (${sq})` : ""}.`;
  }
  if (concepts.includes("skewer")) {
    const sq = bySquares("skewer");
    return `Watch for your more valuable piece being lined up in front of a less valuable one on the same file, rank, or diagonal${sq ? ` (${sq})` : ""} — moving it away can cost you the piece behind.`;
  }
  if (concepts.includes("back-rank weakness")) {
    const sq = bySquares("back-rank weakness");
    return `Give your king an escape square before the back rank becomes a real threat${sq ? ` — right now ${sq} has nowhere to go` : ""}.`;
  }
  if (concepts.includes("king exposure")) {
    const sq = bySquares("king exposure");
    return `When your king loses its pawn cover${sq ? ` around ${sq}` : ""}, prioritize safety over grabbing material or keeping the initiative.`;
  }
  if (classification === "MISSED_OPPORTUNITY") {
    return "When you have a big advantage, slow down and look for the move that keeps or increases it, not just any reasonable move.";
  }
  return "Take an extra moment on critical positions like this one before committing.";
}

/**
 * The default provider: Claude for a warm, personalized explanation, with
 * an automatic fallback to the deterministic template provider if the API
 * call fails, times out, or no API key is configured. Resolved lazily so
 * that importing this module never crashes when ANTHROPIC_API_KEY is unset.
 */
let cachedProvider: ExplanationProvider | null = null;
let cachedHasApiKey: boolean | null = null;

async function getProvider(): Promise<ExplanationProvider> {
  if (cachedProvider) return cachedProvider;
  const template = new TemplateExplanationProvider();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  cachedHasApiKey = Boolean(apiKey);
  if (!apiKey) {
    cachedProvider = template;
    return cachedProvider;
  }
  const { ClaudeExplanationProvider } = await import("./claude-provider");
  const { FallbackExplanationProvider } = await import("./fallback-provider");
  cachedProvider = new FallbackExplanationProvider(new ClaudeExplanationProvider(apiKey), template);
  return cachedProvider;
}

export async function generateExplanation(
  input: ExplainInput,
  context: ExplainContext = {}
): Promise<StructuredExplanation> {
  const provider = await getProvider();
  // Every single call is logged when no key is configured — not just once —
  // since this is exactly the kind of silent-fallback that produces the same
  // generic template sentence across unrelated positions with no visible
  // cause. See FallbackExplanationProvider for the parallel log on a runtime
  // API failure once a key IS configured.
  if (cachedHasApiKey === false) {
    console.warn(
      "[explain] No ANTHROPIC_API_KEY configured — using the deterministic template, not a real AI-generated explanation. Set ANTHROPIC_API_KEY to enable personalized explanations."
    );
    const result = await provider.explainMove(input);
    recordExplanation({
      source: "template",
      classification: input.classification,
      originalSan: input.originalSan,
      bestSan: input.bestSan,
      whyBestIsBetter: result.whyBestIsBetter,
      gameId: context.gameId,
      keyMomentId: context.keyMomentId,
      fallbackReason: "ANTHROPIC_API_KEY not configured",
    });
    return result;
  }
  // When a key IS configured, provider is a FallbackExplanationProvider,
  // which records provenance (ai / ai-patched / template) itself since it's
  // the only place that actually knows which path was taken.
  return provider.explainMove(input, context);
}
