import { Chess, type Move, type PieceSymbol, type Square } from "chess.js";

/**
 * Static exchange evaluation (SEE) — "if both sides trade off on this
 * square, who comes out ahead, and by how much?"
 *
 * This exists because a tactic can be geometrically real and still be worth
 * nothing. A knight "forking" two rooks that are both defended wins
 * material; a knight forking two defended knights wins nothing at all, and
 * telling a player about the second one as though it were a finding is
 * noise dressed up as analysis. Counting attackers and defenders isn't
 * enough to tell those apart — the piece VALUES are what decide it — so the
 * detectors in concepts.ts gate on the number this module returns.
 */

export const PIECE_VALUE: Record<PieceSymbol, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};

/**
 * Capture ordering, which is NOT the same as material value: the king is
 * the last piece you ever want to recapture with (it can only do so when
 * nothing else is left), whereas PIECE_VALUE.k is 0 because a king is never
 * won as material. Sorting by PIECE_VALUE alone would make the king look
 * like the cheapest available capturer and invert the whole exchange.
 */
const CAPTURE_ORDER: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3.1, r: 5, q: 9, k: 100 };

/** Depth guard. Real exchanges on one square resolve well inside this. */
const MAX_PLIES = 12;

/**
 * The material the side to move nets by starting an exchange on `square`,
 * in pawns, from their own point of view. Never negative: either side is
 * free to stop capturing, so a losing exchange is simply declined and
 * scores 0.
 *
 * Captures are enumerated from chess.js's LEGAL move list, which is what
 * makes this stricter than an attacker count — a piece that is itself
 * pinned to its king is not a real attacker, and a king cannot recapture
 * into check. Both cases previously read as live threats.
 */
export function staticExchangeEval(chess: Chess, square: Square): number {
  // A clone, because this plays moves out and the callers share their board.
  return see(new Chess(chess.fen()), square, 0);
}

function see(chess: Chess, square: Square, ply: number): number {
  if (ply >= MAX_PLIES) return 0;
  const occupant = chess.get(square);
  if (!occupant) return 0;

  const capture = cheapestCapture(chess, square);
  if (!capture) return 0;

  const gained = PIECE_VALUE[capture.captured as PieceSymbol];
  chess.move(capture);
  // What the opponent nets by recapturing on the same square. Already
  // clamped at 0 by this function's own contract, so if recapturing loses
  // material they simply won't, and this contributes nothing.
  const recapture = see(chess, square, ply + 1);
  chess.undo();

  return Math.max(0, gained - recapture);
}

/**
 * The least valuable piece that can legally capture on `square` — SEE's
 * standard "take with the cheapest thing first" ordering, since capturing
 * with a queen what a pawn could have taken only ever loses material.
 *
 * En-passant captures are excluded: their `to` square isn't the square the
 * captured pawn stands on, so they don't belong to an exchange sequence
 * over that square.
 */
function cheapestCapture(chess: Chess, square: Square): Move | null {
  let best: Move | null = null;
  for (const move of chess.moves({ verbose: true })) {
    if (move.to !== square || !move.captured || move.isEnPassant()) continue;
    if (!best || CAPTURE_ORDER[move.piece] < CAPTURE_ORDER[best.piece]) best = move;
  }
  return best;
}

/**
 * Whether the side to move can win real material on `square`. A full pawn
 * is the floor: an exchange that nets nothing is not a finding worth
 * showing a player.
 */
export function winsMaterial(chess: Chess, square: Square): boolean {
  return staticExchangeEval(chess, square) >= 1;
}
