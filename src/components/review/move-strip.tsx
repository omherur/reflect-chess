"use client";

import type { GameReviewMove } from "@/server/review";

interface MoveStripProps {
  moves: GameReviewMove[];
  keyMomentPlies: Set<number>;
  currentPly: number;
  onSelect: (ply: number) => void;
}

/**
 * The full game's move list — every ply, not just key moments — so users
 * can browse the whole game freely. Key-moment plies get a small marker;
 * this only signals "this move was flagged as worth a closer look," which
 * is already visible in the key-moments sidebar too, not a verdict.
 */
export function MoveStrip({ moves, keyMomentPlies, currentPly, onSelect }: MoveStripProps) {
  const pairs: { moveNumber: number; white?: GameReviewMove; black?: GameReviewMove }[] = [];
  for (const m of moves) {
    let pair = pairs[pairs.length - 1];
    if (!pair || pair.moveNumber !== m.moveNumber) {
      pair = { moveNumber: m.moveNumber };
      pairs.push(pair);
    }
    if (m.color === "white") pair.white = m;
    else pair.black = m;
  }

  return (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-1.5 rounded-lg border border-stone-200 bg-card px-3 py-2 text-sm">
      {pairs.map((pair) => (
        <span key={pair.moveNumber} className="flex items-center gap-1">
          <span className="text-stone-400">{pair.moveNumber}.</span>
          {pair.white && (
            <MoveToken
              move={pair.white}
              isKeyMoment={keyMomentPlies.has(pair.white.ply)}
              active={currentPly === pair.white.ply}
              onSelect={onSelect}
            />
          )}
          {pair.black && (
            <MoveToken
              move={pair.black}
              isKeyMoment={keyMomentPlies.has(pair.black.ply)}
              active={currentPly === pair.black.ply}
              onSelect={onSelect}
            />
          )}
        </span>
      ))}
    </div>
  );
}

function MoveToken({
  move,
  isKeyMoment,
  active,
  onSelect,
}: {
  move: GameReviewMove;
  isKeyMoment: boolean;
  active: boolean;
  onSelect: (ply: number) => void;
}) {
  return (
    <button
      onClick={() => onSelect(move.ply)}
      className={`rounded px-1.5 py-0.5 font-medium transition-colors ${
        active
          ? "bg-primary text-primary-foreground"
          : isKeyMoment
            ? "bg-amber-50 text-amber-900 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-200 dark:hover:bg-amber-900"
            : "text-stone-700 hover:bg-stone-100"
      }`}
    >
      {move.san}
      {isKeyMoment && !active && <span className="ml-0.5 text-amber-500">•</span>}
    </button>
  );
}
