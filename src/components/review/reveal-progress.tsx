"use client";

import { useEffect, useRef, useState } from "react";
import { Progress } from "@/components/ui/progress";
import {
  REVEAL_STAGES,
  TYPICAL_TOTAL_SECONDS,
  revealProgress,
  stageInfo,
  type RevealStage,
} from "@/lib/reveal-progress";
import { Check, Loader2 } from "lucide-react";

const TICK_MS = 120;

/**
 * The wait between submitting a reflection and seeing the verdict, made
 * legible.
 *
 * `stage` comes from the server, which announces each step as it reaches
 * it, so the checklist below is a report rather than a guess. The bar
 * position between two announcements is the only estimated part, and it
 * eases toward the current stage's ceiling without ever passing it.
 */
export function RevealProgress({ stage }: { stage: RevealStage }) {
  const [value, setValue] = useState(() => stageInfo(stage).start);
  // Stamped in the effect rather than during render: reading the clock
  // while rendering isn't pure, and the first effect run sets it anyway
  // because lastStage starts as null.
  const stageStartedAt = useRef(0);
  const lastStage = useRef<RevealStage | null>(null);

  useEffect(() => {
    if (lastStage.current !== stage) {
      lastStage.current = stage;
      stageStartedAt.current = Date.now();
    }
    const tick = () => setValue(revealProgress(stage, Date.now() - stageStartedAt.current));
    tick();
    const timer = setInterval(tick, TICK_MS);
    return () => clearInterval(timer);
  }, [stage]);

  const current = stageInfo(stage);
  const currentIndex = REVEAL_STAGES.findIndex((s) => s.stage === stage);

  return (
    <div
      className="flex flex-col gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4 duration-300 animate-in fade-in-0"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm font-medium text-stone-800">
          <Loader2 className="size-4 animate-spin text-primary" />
          {current.label}…
        </span>
        <span className="text-sm text-stone-500 tabular-nums">{Math.round(value)}%</span>
      </div>

      <Progress value={value} className="h-2" />

      {/* The stage list is what makes the wait legible: a player can see
          there are three steps, which one is running, and that the long one
          in the middle is the explanation being written for them. */}
      <ol className="flex flex-col gap-1">
        {REVEAL_STAGES.filter((s) => s.stage !== "done").map((s, index) => {
          const done = index < currentIndex;
          const active = index === currentIndex;
          return (
            <li
              key={s.stage}
              className={`flex items-center gap-2 text-xs ${
                active ? "text-stone-700" : done ? "text-stone-500" : "text-stone-400"
              }`}
            >
              {done ? (
                <Check className="size-3.5 text-[#2F4F3D]" />
              ) : (
                <span
                  className={`size-1.5 rounded-full ${active ? "bg-primary" : "bg-stone-300"}`}
                />
              )}
              {s.label}
            </li>
          );
        })}
      </ol>

      <p className="text-xs text-stone-500">
        Usually about {TYPICAL_TOTAL_SECONDS} seconds — your explanation is written for this
        position and what you said about it, not pulled off a shelf.
      </p>
    </div>
  );
}
