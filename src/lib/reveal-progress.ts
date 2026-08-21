/**
 * Pacing for the wait between "submit my reflection" and "here's the
 * verdict". That wait is real work — a Stockfish evaluation of the replay
 * move, then a generated explanation — and it can run to fifteen seconds,
 * which is a long time to sit in front of a button that just says
 * "Revealing…".
 *
 * The STAGES are ground truth: the server announces each one as it starts
 * (see the reflect route), so the label a player reads is always what is
 * actually happening. Only the movement between two stage boundaries is an
 * estimate, and it's built so it can never lie in the direction that
 * matters — the bar eases toward each stage's ceiling and stops there, so
 * it never claims to be finished before it is.
 */

export type RevealStage = "checking" | "explaining" | "saving" | "done";

export interface RevealStageInfo {
  stage: RevealStage;
  label: string;
  /** Percentage the bar sits at the moment this stage begins. */
  start: number;
  /** Percentage this stage eases toward and never passes. */
  end: number;
  /** Typical duration, used only to pace the easing between start and end. */
  typicalMs: number;
}

export const REVEAL_STAGES: RevealStageInfo[] = [
  {
    stage: "checking",
    label: "Checking your replay move with the engine",
    start: 0,
    end: 30,
    typicalMs: 3_500,
  },
  {
    stage: "explaining",
    label: "Working out what happened, in your own terms",
    start: 30,
    end: 88,
    typicalMs: 11_000,
  },
  {
    stage: "saving",
    label: "Saving your reflection",
    start: 88,
    end: 97,
    typicalMs: 600,
  },
  { stage: "done", label: "Done", start: 100, end: 100, typicalMs: 0 },
];

/** Roughly how long the whole thing takes, for the "usually about…" hint. */
export const TYPICAL_TOTAL_SECONDS = Math.round(
  REVEAL_STAGES.reduce((total, s) => total + s.typicalMs, 0) / 1000
);

export function stageInfo(stage: RevealStage): RevealStageInfo {
  return REVEAL_STAGES.find((s) => s.stage === stage) ?? REVEAL_STAGES[0];
}

/**
 * Where the bar should sit, given which stage the server last announced and
 * how long ago it announced it.
 *
 * The curve is `1 - e^(-t/typical)`: quick off the mark so the bar visibly
 * responds, then flattening as it approaches the stage ceiling, which it
 * never reaches. A stage running long therefore looks like a stage running
 * long — the bar crawls — instead of like a finished job that isn't
 * finished.
 */
export function revealProgress(stage: RevealStage, elapsedInStageMs: number): number {
  const info = stageInfo(stage);
  if (info.typicalMs <= 0) return info.end;
  const eased = 1 - Math.exp(-Math.max(0, elapsedInStageMs) / info.typicalMs);
  return info.start + (info.end - info.start) * eased;
}
