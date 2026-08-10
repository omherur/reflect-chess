"use client";

import { useState } from "react";
import { Chess } from "chess.js";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { validateMove } from "@/lib/chess/pgn";
import type { Color, KeyMomentPublic, KeyMomentVerdict } from "@/lib/types";
import { REFLECTION_TAGS } from "@/lib/reflection-tags";
import { ReviewBoard } from "./review-board";
import { RevealPanel } from "./reveal-panel";
import { VoiceInputButton } from "./voice-input-button";
import { MessageCircle, Undo2, Lightbulb, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

function isVerdict(km: KeyMomentPublic | KeyMomentVerdict): km is KeyMomentVerdict {
  return "classification" in km;
}

interface KeyMomentCardProps {
  gameId: string;
  keyMoment: KeyMomentPublic | KeyMomentVerdict;
  userColor: Color;
  onReviewed: (verdict: KeyMomentVerdict) => void;
}

export function KeyMomentCard({ gameId, keyMoment, userColor, onReviewed }: KeyMomentCardProps) {
  if (isVerdict(keyMoment) && keyMoment.reviewStatus === "REVIEWED") {
    return (
      <Card>
        <CardContent className="py-6">
          <RevealPanel km={keyMoment} userColor={userColor} />
        </CardContent>
      </Card>
    );
  }
  return (
    <ReflectionForm
      gameId={gameId}
      keyMoment={keyMoment}
      userColor={userColor}
      onReviewed={onReviewed}
    />
  );
}

interface ReplaySelection {
  uci: string;
  san: string;
  fenAfter: string;
}

function applyUci(fen: string, uci: string): string {
  const chess = new Chess(fen);
  chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.slice(4, 5) || undefined });
  return chess.fen();
}

function ReflectionForm({
  gameId,
  keyMoment,
  userColor,
  onReviewed,
}: {
  gameId: string;
  keyMoment: KeyMomentPublic;
  userColor: Color;
  onReviewed: (verdict: KeyMomentVerdict) => void;
}) {
  const [thoughts, setThoughts] = useState("");
  const [replaySame, setReplaySame] = useState(false);
  const [replayText, setReplayText] = useState("");
  const [boardMove, setBoardMove] = useState<ReplaySelection | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [hintLoading, setHintLoading] = useState(false);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [tags, setTags] = useState<string[]>([]);

  // Adaptive follow-up: checked at most once per key moment (followUpChecked
  // guards against re-asking on a second submit-button click), and skipped
  // entirely when the initial answer is already substantive.
  const [followUpChecked, setFollowUpChecked] = useState(false);
  const [followUpQuestion, setFollowUpQuestion] = useState<string | null>(null);
  const [followUpAnswer, setFollowUpAnswer] = useState("");
  const [checkingFollowUp, setCheckingFollowUp] = useState(false);

  const from = keyMoment.originalUci.slice(0, 2);
  const to = keyMoment.originalUci.slice(2, 4);
  const moveNumber = Math.ceil(keyMoment.ply / 2);
  const moverColor = keyMoment.ply % 2 === 1 ? "White" : "Black";

  const manualValidation = replayText.trim() ? validateMove(keyMoment.fen, replayText) : null;
  const manualInvalid = replayText.trim().length > 0 && !manualValidation;

  const effectiveReplay: ReplaySelection | null = replaySame
    ? { uci: keyMoment.originalUci, san: keyMoment.originalSan, fenAfter: applyUci(keyMoment.fen, keyMoment.originalUci) }
    : (boardMove ?? manualValidation);

  const canSubmit =
    thoughts.trim().length >= 3 &&
    effectiveReplay !== null &&
    confidence !== null &&
    (!followUpQuestion || followUpAnswer.trim().length > 0);

  function toggleTag(tag: string) {
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  function selectSameMove() {
    setReplaySame(true);
    setBoardMove(null);
    setReplayText("");
  }

  function handleBoardMove(uci: string, san: string, fenAfter: string) {
    setReplaySame(false);
    setReplayText("");
    setBoardMove({ uci, san, fenAfter });
  }

  function handleTextChange(value: string) {
    setReplayText(value);
    setReplaySame(false);
    setBoardMove(null);
  }

  function clearReplay() {
    setReplaySame(false);
    setBoardMove(null);
    setReplayText("");
  }

  async function requestHint() {
    setHintLoading(true);
    try {
      const res = await fetch(`/api/games/${gameId}/keymoments/${keyMoment.id}/hint`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) setHint(data.hint);
    } finally {
      setHintLoading(false);
    }
  }

  async function submit() {
    if (!canSubmit || !effectiveReplay) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/games/${gameId}/keymoments/${keyMoment.id}/reflect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          thoughts: thoughts.trim(),
          replaySame,
          replayMove: replaySame ? undefined : effectiveReplay.uci,
          confidence,
          tags,
          followUpQuestion: followUpQuestion ?? undefined,
          followUpAnswer: followUpAnswer.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not submit your reflection.");
      onReviewed(data.keyMoment as KeyMomentVerdict);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit your reflection.");
    } finally {
      setSubmitting(false);
    }
  }

  /**
   * The submit button's actual click handler: on first click, checks
   * whether the reasoning is thin enough to warrant one follow-up question
   * (never revealing anything, and never asked twice — followUpChecked
   * guards that). If a follow-up is triggered, this pauses here — the
   * button becomes a second "continue" click once the user has answered it.
   */
  async function handleSubmitClick() {
    if (!canSubmit) return;
    if (!followUpChecked) {
      setCheckingFollowUp(true);
      setError(null);
      try {
        const res = await fetch(`/api/games/${gameId}/keymoments/${keyMoment.id}/followup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ thoughts: thoughts.trim(), replaySame }),
        });
        const data = await res.json();
        setFollowUpChecked(true);
        if (res.ok && data.needsFollowUp) {
          setFollowUpQuestion(data.question as string);
          return;
        }
      } catch {
        // Follow-up check is a nice-to-have, not a blocker — proceed to submit.
        setFollowUpChecked(true);
      } finally {
        setCheckingFollowUp(false);
      }
    }
    await submit();
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="mb-2 text-center text-sm text-stone-500">
          Move {moveNumber} ({moverColor}) — you played <span className="font-semibold">{keyMoment.originalSan}</span>
        </p>
        <ReviewBoard
          fen={keyMoment.fen}
          orientation={userColor}
          boardId={`played-${keyMoment.id}`}
          arrows={[{ startSquare: from, endSquare: to, color: "#6F4518" }]}
        />
      </div>

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="flex flex-col gap-3 pt-6">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor={`thoughts-${keyMoment.id}`} className="flex items-center gap-2 text-lg font-semibold text-stone-800">
              <MessageCircle className="size-5 text-primary" />
              What were you thinking when you played this move?
            </Label>
            <VoiceInputButton onTranscript={(text) => setThoughts((prev) => (prev ? `${prev} ${text}` : text))} />
          </div>
          <p className="text-sm text-stone-500">
            Optional prompts: What was your plan? What did you expect your opponent to do? Were
            you worried about a threat?
          </p>
          <Textarea
            id={`thoughts-${keyMoment.id}`}
            rows={8}
            value={thoughts}
            onChange={(e) => setThoughts(e.target.value)}
            placeholder="Write freely — there's no wrong answer here. This is captured before any engine verdict."
            className="bg-card p-4 text-base leading-relaxed md:text-base"
          />

          <div className="flex flex-wrap gap-2">
            {REFLECTION_TAGS.map((tag) => {
              const selected = tags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    selected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-stone-300 bg-card text-stone-600 hover:border-primary/40"
                  )}
                >
                  {tag}
                </button>
              );
            })}
          </div>

          <div>
            <Label className="mb-2 block text-sm font-semibold text-stone-800">
              How confident were you in this move?
            </Label>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setConfidence(level)}
                  aria-pressed={confidence === level}
                  className={cn(
                    "flex size-9 items-center justify-center rounded-full border text-sm font-semibold transition-colors",
                    confidence === level
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-stone-300 bg-card text-stone-600 hover:border-primary/40"
                  )}
                >
                  {level}
                </button>
              ))}
            </div>
            <div className="mt-1 flex justify-between text-xs text-stone-500">
              <span>Total guess</span>
              <span>Certain</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-amber-200 bg-amber-50/40">
        <CardContent className="flex flex-col gap-4 pt-6">
          <div className="flex items-center justify-between gap-2">
            <Label className="flex items-center gap-2 text-base font-semibold text-stone-800">
              <Undo2 className="size-4 text-amber-600" />
              If you could replay this position, what would you play now?
            </Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={requestHint}
              disabled={hintLoading}
              className="shrink-0 gap-1.5 text-amber-700 hover:bg-amber-100 hover:text-amber-800"
            >
              <Lightbulb className="size-3.5" />
              {hintLoading ? "Thinking…" : "Hint"}
            </Button>
          </div>

          {hint && (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 duration-200 animate-in fade-in-0">
              <span className="font-medium">Hint:</span> {hint}
            </p>
          )}

          <ReviewBoard
            fen={effectiveReplay ? effectiveReplay.fenAfter : keyMoment.fen}
            validateFen={keyMoment.fen}
            orientation={userColor}
            boardId={`replay-${keyMoment.id}`}
            onUserMove={effectiveReplay ? undefined : handleBoardMove}
            arrows={
              effectiveReplay
                ? [
                    {
                      startSquare: effectiveReplay.uci.slice(0, 2),
                      endSquare: effectiveReplay.uci.slice(2, 4),
                      color: "#d97706",
                    },
                  ]
                : []
            }
          />

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              value={replayText}
              onChange={(e) => handleTextChange(e.target.value)}
              placeholder="Or type a move (SAN like Nf3, or UCI like g1f3)"
              className="flex-1 bg-card"
            />
            <Button type="button" variant="outline" onClick={selectSameMove}>
              I&apos;d play the same move
            </Button>
          </div>
          {manualInvalid && (
            <p className="text-sm text-red-600">Not a legal move in this position.</p>
          )}

          {effectiveReplay && (
            <div className="flex items-center gap-2 rounded-md border border-[#B8860B]/30 bg-card px-3 py-2 text-sm duration-200 animate-in fade-in-0">
              <span>
                Replay move selected: <span className="font-semibold">{effectiveReplay.san}</span>
                {replaySame ? " (same as original)" : ""}
              </span>
              <button
                type="button"
                onClick={clearReplay}
                className="ml-auto text-stone-500 underline hover:text-stone-800"
              >
                Clear
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      {followUpQuestion && (
        <Card className="border-[#6B4A6B]/30 bg-[#6B4A6B]/5 duration-300 animate-in fade-in-0 slide-in-from-top-1">
          <CardContent className="flex flex-col gap-3 pt-6">
            <div className="flex items-center justify-between gap-2">
              <Label
                htmlFor={`followup-${keyMoment.id}`}
                className="flex items-center gap-2 text-base font-semibold text-stone-800"
              >
                <HelpCircle className="size-4 text-[#6B4A6B]" />
                {followUpQuestion}
              </Label>
              <VoiceInputButton
                onTranscript={(text) =>
                  setFollowUpAnswer((prev) => (prev ? `${prev} ${text}` : text))
                }
              />
            </div>
            <Textarea
              id={`followup-${keyMoment.id}`}
              rows={3}
              value={followUpAnswer}
              onChange={(e) => setFollowUpAnswer(e.target.value)}
              placeholder="A sentence is plenty — still captured before any engine verdict."
              className="bg-card"
            />
          </CardContent>
        </Card>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex justify-end">
        <Button
          size="lg"
          onClick={handleSubmitClick}
          disabled={!canSubmit || submitting || checkingFollowUp}
        >
          {submitting
            ? "Revealing…"
            : checkingFollowUp
              ? "One moment…"
              : followUpQuestion
                ? "Continue"
                : "Submit and reveal engine verdict"}
        </Button>
      </div>
    </div>
  );
}
