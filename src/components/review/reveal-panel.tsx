"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { formatScore, toPerspective, describeScore } from "@/lib/chess/eval";
import { explanationSummary } from "@/lib/explanation-summary";
import {
  classificationClass,
  classificationLabel,
  replayVerdictBadgeClass,
  replayVerdictBadgeLabel,
  tierLabel,
} from "@/lib/format";
import type { Color, ExplanationSummary, KeyMomentVerdict } from "@/lib/types";
import { ReviewBoard } from "./review-board";
import { ExplanationCard } from "@/components/explanation-card";
import {
  ChevronDown,
  Eye,
  Lightbulb,
  Quote,
  Sparkles,
  Target,
  TriangleAlert,
} from "lucide-react";

const TIER_BADGE_CLASS: Record<string, string> = {
  CRITICAL: "bg-[#8B2E2E]/12 text-[#8B2E2E] border-[#8B2E2E]/35",
  NOTABLE: "bg-[#B8860B]/12 text-[#8A6108] border-[#B8860B]/35",
  MINOR: "bg-stone-100 text-stone-600 border-stone-200",
};

/**
 * The verdict, in two layers.
 *
 * A player reviewing a game has several of these to get through, and the
 * thing that makes a review actually happen is being able to read one and
 * move on. So the panel opens on a three-line summary — what happened, what
 * was better, what to take away — sitting next to the board, and everything
 * that takes longer to read (the full mechanism, the engine's line narrated
 * move by move, the eval numbers, the detected concepts) waits behind
 * "Explain more".
 *
 * The split is presentation only: the deep layer was generated at the same
 * time as the summary and is already on the client, so opening it is
 * instant and costs nothing. Nobody is being shown a shallower analysis —
 * they're being shown the same analysis in the order that a person actually
 * reads one.
 */
export function RevealPanel({ km, userColor }: { km: KeyMomentVerdict; userColor: Color }) {
  const [expanded, setExpanded] = useState(false);
  const summary = explanationSummary(km.explanation);
  const from = km.originalUci.slice(0, 2);
  const to = km.originalUci.slice(2, 4);
  const bestFrom = km.bestMoveUci.slice(0, 2);
  const bestTo = km.bestMoveUci.slice(2, 4);
  const highlightSquares = km.conceptHighlights.flatMap((h) => h.squares);

  return (
    <div className="flex flex-col gap-6 duration-500 animate-in fade-in-0 slide-in-from-bottom-3">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full border px-3 py-1 text-sm font-semibold shadow-sm ${classificationClass(km.classification)}`}
        >
          {classificationLabel(km.classification)}
        </span>
        <span
          className={`rounded-full border px-2.5 py-1 text-xs font-medium ${TIER_BADGE_CLASS[km.importanceTier]}`}
        >
          {tierLabel(km.importanceTier)} moment
        </span>
        <span className="text-sm text-stone-500">{km.selectionReason}</span>
      </div>

      <YourWordsSection km={km} />

      <Separator />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div>
          <p className="mb-2 text-center text-sm text-stone-500">
            <span className="text-primary">●</span> what you played ·{" "}
            <span className="text-[#2F4F3D]">●</span> engine&apos;s best
            {highlightSquares.length > 0 && (
              <>
                {" "}
                · <span className="text-[#B8860B]">▨</span> concept squares
              </>
            )}
          </p>
          <ReviewBoard
            fen={km.fen}
            orientation={userColor}
            boardId={`reveal-${km.id}`}
            highlightSquares={highlightSquares}
            arrows={[
              { startSquare: from, endSquare: to, color: "#6F4518" },
              { startSquare: bestFrom, endSquare: bestTo, color: "#2F4F3D" },
            ]}
          />
        </div>

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm">
            <InfoBlock label="You played" value={km.originalSan} />
            <InfoBlock label="Engine's best" value={km.bestMoveSan} />
          </div>

          <QuickVerdict summary={summary} />

          {km.explanation.approximate && (
            <p className="text-xs italic text-stone-500">
              This one is approximate — it&apos;s based on pattern heuristics, not a certainty.
            </p>
          )}
        </div>
      </div>

      {/* Deliberately full-width and unmissable, but visually quieter than
          anything above it: the point is that most reveals end here. */}
      {!expanded && (
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={() => setExpanded(true)}
          className="w-full gap-2 border-dashed"
        >
          <Eye className="size-4" />
          Explain more
          <ChevronDown className="size-4" />
        </Button>
      )}

      {expanded && <DeepDive km={km} userColor={userColor} summary={summary} />}
    </div>
  );
}

/**
 * The three lines that carry the whole verdict. Each one is deliberately a
 * single sentence — the moment this grows to a paragraph, the fast review
 * path is gone and the "Explain more" button below it has no job left.
 */
function QuickVerdict({
  summary,
}: {
  summary: { headline: string; betterMove: string; takeaway: string };
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2.5">
        <Target className="mt-0.5 size-4 shrink-0 text-primary" />
        <p className="text-base leading-snug font-medium text-stone-800">{summary.headline}</p>
      </div>
      <div className="flex items-start gap-2.5">
        <Lightbulb className="mt-0.5 size-4 shrink-0 text-[#2F4F3D]" />
        <p className="text-sm leading-snug text-stone-700">{summary.betterMove}</p>
      </div>
      <div className="flex items-start gap-2.5 rounded-md border border-[#6B4A6B]/25 bg-[#6B4A6B]/8 px-3 py-2">
        <Sparkles className="mt-0.5 size-4 shrink-0 text-[#6B4A6B]" />
        <p className="text-sm leading-snug text-stone-700">{summary.takeaway}</p>
      </div>
    </div>
  );
}

/**
 * Everything that didn't fit in three lines: the full four-card
 * explanation, the engine's own numbers and line, and the verified board
 * concepts. Shown only on request — this is the layer for a player who read
 * the summary and still wants to know why.
 */
function DeepDive({
  km,
  userColor,
  summary,
}: {
  km: KeyMomentVerdict;
  userColor: Color;
  summary: ExplanationSummary;
}) {
  const evalBeforeUser = toPerspective(km.evalBefore, userColor);
  const evalAfterUser = toPerspective(km.evalAfter, userColor);

  return (
    <div className="flex flex-col gap-4 duration-300 animate-in fade-in-0 slide-in-from-top-2">
      <Separator />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ExplanationCard
          icon={Target}
          label="What your move did"
          text={km.explanation.whatYourMoveDid}
          tint="bg-primary/8 border-primary/20"
          iconClass="text-primary"
        />
        <ExplanationCard
          icon={TriangleAlert}
          label="What it missed"
          text={km.explanation.whatItMissed}
          tint="bg-[#B8860B]/10 border-[#B8860B]/25"
          iconClass="text-[#8A6108]"
        />
        <ExplanationCard
          icon={Lightbulb}
          label="Why the recommended move is stronger"
          text={km.explanation.whyBestIsBetter}
          tint="bg-[#2F4F3D]/10 border-[#2F4F3D]/25"
          iconClass="text-[#2F4F3D]"
        />
        {/* A card that only repeats a line the player has already read is
            worse than no card — it makes "Explain more" look like padding.
            The takeaway is derived from `remember` whenever the summary
            came from the deterministic template, so for those moments the
            two are identical by construction. */}
        {!repeatsSummary(km.explanation.remember, summary.takeaway) && (
          <ExplanationCard
            icon={Sparkles}
            label="What to remember"
            text={km.explanation.remember}
            tint="bg-[#6B4A6B]/10 border-[#6B4A6B]/25"
            iconClass="text-[#6B4A6B]"
          />
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="grid grid-cols-2 gap-3 rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm">
          <InfoBlock
            label="Eval before"
            value={`${formatScore(evalBeforeUser)} (${describeScore(evalBeforeUser)})`}
          />
          <InfoBlock
            label="Eval after your move"
            value={`${formatScore(evalAfterUser)} (${describeScore(evalAfterUser)})`}
          />
        </div>

        <div className="flex flex-col gap-4">
          {km.principalVariation.length > 0 && (
            <div>
              <p className="text-sm font-medium text-stone-700">Engine line</p>
              <p className="font-mono text-sm text-stone-600">{km.principalVariation.join(" ")}</p>
            </div>
          )}

          {km.conceptHighlights.length > 0 && (
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium text-stone-700">On the board</p>
              <ul className="flex flex-col gap-1">
                {km.conceptHighlights.map((h) => (
                  <li key={h.concept} className="flex items-start gap-2 text-sm text-stone-600">
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-sm bg-amber-500" />
                    <span>
                      <span className="font-medium capitalize text-stone-800">{h.concept}</span> —{" "}
                      {h.note}
                      {h.squares.length > 0 && (
                        <span className="font-mono text-xs text-stone-400">
                          {" "}
                          ({h.squares.join(", ")})
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Whether a detail card would only restate a line already shown above it. */
function repeatsSummary(cardText: string, summaryLine: string): boolean {
  const normalize = (text: string) => text.trim().replace(/\s+/g, " ").toLowerCase();
  return normalize(cardText) === normalize(summaryLine);
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-stone-500">{label}</p>
      <p className="font-medium text-stone-800">{value}</p>
    </div>
  );
}

function ConfidenceDots({ confidence }: { confidence: number }) {
  return (
    <span className="inline-flex items-center gap-1" aria-label={`Confidence ${confidence} out of 5`}>
      {[1, 2, 3, 4, 5].map((level) => (
        <span
          key={level}
          className={`size-2 rounded-full ${level <= confidence ? "bg-primary" : "bg-stone-300"}`}
        />
      ))}
    </span>
  );
}

/**
 * The reflection-first mechanic's payoff, front and center: the player's
 * own words — reasoning, replay move, confidence, tags, and any follow-up
 * — placed above the AI's take and given a distinct quote treatment so it
 * never blends in as just another system-generated data card.
 */
function YourWordsSection({ km }: { km: KeyMomentVerdict }) {
  const { reflection } = km;
  return (
    <div className="flex flex-col gap-4 rounded-xl border-l-4 border-primary bg-primary/[0.04] p-5">
      <div className="flex items-start gap-3">
        <Quote className="mt-0.5 size-6 shrink-0 text-primary/50" />
        <div className="flex flex-1 flex-col gap-3">
          <div>
            <p className="mb-1 text-xs font-medium tracking-wide text-stone-500 uppercase">
              Your reasoning, captured before reveal
            </p>
            <p className="font-heading text-lg leading-snug whitespace-pre-wrap text-stone-800 italic">
              &ldquo;{reflection.thoughts}&rdquo;
            </p>
          </div>

          {reflection.followUpQuestion && reflection.followUpAnswer && (
            <div className="border-l-2 border-[#6B4A6B]/40 pl-3">
              <p className="text-xs font-medium text-stone-500">{reflection.followUpQuestion}</p>
              <p className="font-heading text-base text-stone-700 italic">
                &ldquo;{reflection.followUpAnswer}&rdquo;
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-stone-500">Confidence:</span>
              <ConfidenceDots confidence={reflection.confidence} />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-stone-500">Replay move: </span>
              <span className="font-semibold text-stone-800">{reflection.replayMoveSan}</span>
              {reflection.replaySame && <span className="text-stone-500"> (same as original)</span>}
              {reflection.replayVerdict && (
                <span
                  className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${replayVerdictBadgeClass(reflection.replayVerdict)}`}
                >
                  {replayVerdictBadgeLabel(reflection.replayVerdict)}
                </span>
              )}
            </div>
          </div>

          {reflection.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {reflection.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-primary/25 bg-card px-2.5 py-0.5 text-xs text-stone-600"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {km.explanation.replayNote && (
            <p className="text-sm text-stone-600">{km.explanation.replayNote}</p>
          )}
        </div>
      </div>
    </div>
  );
}
