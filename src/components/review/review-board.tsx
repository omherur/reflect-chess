"use client";

import { Chessboard } from "react-chessboard";
import type { Arrow, PieceDropHandlerArgs } from "react-chessboard";
import { Chess } from "chess.js";

interface ReviewBoardProps {
  fen: string;
  orientation: "white" | "black";
  /**
   * When set, dragging a piece attempts a move and calls back with
   * UCI/SAN/resulting FEN on success. The move is validated against
   * `validateFen` (defaults to `fen`) — pass a fixed pre-move FEN here
   * (distinct from a `fen` that already reflects a selected move) so the
   * user can always drag a fresh piece to change their answer.
   */
  onUserMove?: (uci: string, san: string, fenAfter: string) => void;
  validateFen?: string;
  arrows?: Arrow[];
  /** Squares to highlight with a soft color wash, e.g. for a discussed concept. */
  highlightSquares?: string[];
  highlightColor?: string;
  boardId: string;
}

export function ReviewBoard({
  fen,
  orientation,
  onUserMove,
  validateFen,
  arrows,
  highlightSquares,
  highlightColor = "rgba(217, 119, 6, 0.45)",
  boardId,
}: ReviewBoardProps) {
  function handleDrop({ sourceSquare, targetSquare }: PieceDropHandlerArgs): boolean {
    if (!onUserMove || !targetSquare) return false;
    const chess = new Chess(validateFen ?? fen);
    try {
      // Auto-queen for simplicity; the underlying UCI/SAN still reflects the real move.
      const move = chess.move({ from: sourceSquare, to: targetSquare, promotion: "q" });
      onUserMove(move.from + move.to + (move.promotion ?? ""), move.san, chess.fen());
      return true;
    } catch {
      return false;
    }
  }

  const squareStyles = Object.fromEntries(
    (highlightSquares ?? []).map((sq) => [
      sq,
      { boxShadow: `inset 0 0 0 9999px ${highlightColor}` },
    ])
  );

  return (
    <div className="mx-auto w-full max-w-[480px]">
      <Chessboard
        options={{
          id: boardId,
          position: fen,
          boardOrientation: orientation,
          allowDragging: Boolean(onUserMove),
          onPieceDrop: onUserMove ? handleDrop : undefined,
          arrows: arrows ?? [],
          squareStyles,
          animationDurationInMs: 150,
          darkSquareStyle: { backgroundColor: "#8b7355" },
          lightSquareStyle: { backgroundColor: "#f0dfc4" },
        }}
      />
    </div>
  );
}
