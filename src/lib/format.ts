export function formatDate(iso: string | null): string {
  if (!iso) return "Unknown date";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatResult(result: string, userColor: string): string {
  if (result === "1/2-1/2") return "Draw";
  const userWon = (result === "1-0" && userColor === "white") || (result === "0-1" && userColor === "black");
  if (result === "*") return "Ongoing";
  return userWon ? "Win" : "Loss";
}

export function resultBadgeVariant(result: string, userColor: string): "success" | "secondary" | "destructive" {
  const label = formatResult(result, userColor);
  if (label === "Win") return "success";
  if (label === "Loss") return "destructive";
  return "secondary";
}

export function platformLabel(platform: string): string {
  if (platform === "chesscom") return "Chess.com";
  if (platform === "manual") return "Manual PGN";
  // Seeded into every new account so the landing page's "your first game
  // comes back analyzed" is true on arrival — labelled so nobody mistakes it
  // for a game of their own.
  if (platform === "demo") return "Demo game";
  return platform;
}

const CLASSIFICATION_LABEL: Record<string, string> = {
  BEST: "Best move",
  GOOD: "Good move",
  INACCURACY: "Inaccuracy",
  MISTAKE: "Mistake",
  BLUNDER: "Blunder",
  MISSED_OPPORTUNITY: "Missed opportunity",
  FORCED: "Forced",
  TIME_TROUBLE: "Time trouble",
};

export function classificationLabel(classification: string): string {
  return CLASSIFICATION_LABEL[classification] ?? classification;
}

// One coherent severity family, reused for badges, left-edge strips, and
// tier indicators alike: oxblood (blunder/critical), ochre (mistake),
// muted tan-gold (inaccuracy), forest green (good/best). Missed-opportunity
// and time-trouble stay in the same warm register without being confused
// for a tactical fault. Colors come from CSS variables (see globals.css)
// rather than hardcoded hex so each has a distinct, WCAG AA-passing value
// per theme — the light-mode hex values were reused verbatim in dark mode
// until this fix, which put text well under 4.5:1 against the dark
// background (as low as ~1.9:1 for BLUNDER).
const CLASSIFICATION_CLASS: Record<string, string> = {
  BEST: "bg-severity-best/12 text-severity-best border-severity-best/35",
  GOOD: "bg-severity-good/10 text-severity-good border-severity-good/30",
  INACCURACY: "bg-severity-inaccuracy/20 text-severity-inaccuracy-text border-severity-inaccuracy/45",
  MISTAKE: "bg-severity-mistake/12 text-severity-mistake-text border-severity-mistake/35",
  // Deliberately the same token as --destructive, not a dedicated variable
  // — the two are meant to always match.
  BLUNDER: "bg-destructive/12 text-destructive border-destructive/35",
  MISSED_OPPORTUNITY: "bg-severity-missed-opportunity/12 text-severity-missed-opportunity border-severity-missed-opportunity/35",
  FORCED: "bg-stone-100 text-stone-700 border-stone-200",
  // Deliberately not part of the oxblood/ochre "your fault" spectrum — this
  // wasn't a tactical failure, it's a clock-management note.
  TIME_TROUBLE: "bg-severity-time-trouble/12 text-severity-time-trouble border-severity-time-trouble/35",
};

export function classificationClass(classification: string): string {
  return CLASSIFICATION_CLASS[classification] ?? "bg-stone-100 text-stone-700 border-stone-200";
}

/**
 * A stronger left-edge color strip per classification, for scanning a list
 * top-to-bottom by severity at a glance — distinct from the badge above.
 */
const CLASSIFICATION_BORDER_CLASS: Record<string, string> = {
  BEST: "border-l-severity-best",
  GOOD: "border-l-severity-good",
  INACCURACY: "border-l-severity-inaccuracy",
  MISTAKE: "border-l-severity-mistake",
  BLUNDER: "border-l-destructive",
  MISSED_OPPORTUNITY: "border-l-severity-missed-opportunity",
  FORCED: "border-l-stone-300",
  TIME_TROUBLE: "border-l-severity-time-trouble",
};

export function classificationBorderClass(classification: string): string {
  return CLASSIFICATION_BORDER_CLASS[classification] ?? "border-l-stone-300";
}

const TIER_LABEL: Record<string, string> = {
  CRITICAL: "Critical",
  NOTABLE: "Notable",
  MINOR: "Minor",
};

export function tierLabel(tier: string): string {
  return TIER_LABEL[tier] ?? tier;
}

const TIER_DOT_CLASS: Record<string, string> = {
  CRITICAL: "bg-destructive",
  NOTABLE: "bg-severity-mistake",
  // stone-500, not stone-400: stone-400 falls below the 3:1 non-text
  // contrast minimum against the dark background/card once composited.
  MINOR: "bg-stone-500",
};

export function tierDotClass(tier: string): string {
  return TIER_DOT_CLASS[tier] ?? "bg-stone-500";
}

const TIER_RING_CLASS: Record<string, string> = {
  CRITICAL: "ring-2 ring-destructive/30 border-destructive/30",
  NOTABLE: "ring-1 ring-severity-mistake/30 border-severity-mistake/30",
  MINOR: "border-stone-200",
};

export function tierRingClass(tier: string): string {
  return TIER_RING_CLASS[tier] ?? "border-stone-200";
}

/**
 * A short, scannable badge label for the replay-move verdict — distinct
 * from the longer sentence above and from the prose explanation, so the
 * outcome ("did my second look actually help?") reads at a glance instead
 * of requiring the player to parse a full sentence.
 */
const REPLAY_VERDICT_BADGE_LABEL: Record<string, string> = {
  SAME_AS_BEST: "Matches the engine's best move",
  IMPROVEMENT: "Improvement",
  SAME_AS_ORIGINAL: "Equal to original",
  SIMILAR: "Still not addressing the core issue",
  WORSE: "Worse than original",
};

export function replayVerdictBadgeLabel(verdict: string): string {
  return REPLAY_VERDICT_BADGE_LABEL[verdict] ?? verdict;
}

// Reuses the severity family's color tokens so the badge's tone is
// consistent with how the rest of the app signals "good" vs "bad" —
// SAME_AS_BEST gets the brightest/most celebratory treatment, WORSE shares
// the destructive/oxblood tone with BLUNDER.
const REPLAY_VERDICT_BADGE_CLASS: Record<string, string> = {
  SAME_AS_BEST: "bg-severity-best/14 text-severity-best border-severity-best/40",
  IMPROVEMENT: "bg-severity-good/10 text-severity-good border-severity-good/30",
  SAME_AS_ORIGINAL: "bg-stone-100 text-stone-700 border-stone-200",
  SIMILAR: "bg-severity-mistake/12 text-severity-mistake-text border-severity-mistake/35",
  WORSE: "bg-destructive/12 text-destructive border-destructive/35",
};

export function replayVerdictBadgeClass(verdict: string): string {
  return REPLAY_VERDICT_BADGE_CLASS[verdict] ?? "bg-stone-100 text-stone-700 border-stone-200";
}
