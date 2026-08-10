"use client";

import { Card, CardContent } from "@/components/ui/card";
import type { Color } from "@/lib/types";
import type { GameReviewMove } from "@/server/review";
import { ReviewBoard } from "./review-board";

/**
 * Plain browsing view for a move that ISN'T a key moment — just the
 * position and the move played, no reflection prompt. Only key moments
 * trigger the reflection-first flow.
 */
export function BrowseView({ move, userColor }: { move: GameReviewMove; userColor: Color }) {
  const from = move.uci.slice(0, 2);
  const to = move.uci.slice(2, 4);
  const moverLabel = move.color === "white" ? "White" : "Black";

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 py-6">
        <p className="text-center text-sm text-stone-500">
          Move {move.moveNumber} ({moverLabel}) — <span className="font-semibold">{move.san}</span>
        </p>
        <ReviewBoard
          fen={move.fenBefore}
          orientation={userColor}
          boardId={`browse-${move.ply}`}
          arrows={[{ startSquare: from, endSquare: to, color: "#78716c" }]}
        />
        <p className="text-center text-xs text-stone-400">
          Not a key moment — just browsing. Only flagged moments ask for your reflection.
        </p>
      </CardContent>
    </Card>
  );
}
