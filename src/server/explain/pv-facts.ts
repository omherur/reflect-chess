import { Chess, type PieceSymbol, type Square } from "chess.js";

/**
 * Deterministic, move-by-move facts about the engine's principal
 * variation, for the prompt.
 *
 * Without these the model is reading a bare move list several plies deep
 * and guessing at what each move does — and it guesses wrong in exactly the
 * way that matters. On a real line ending `a6 Nc3 c6`, it annotated c6 as
 * "shores up the center, ignoring the queen for now" when c6 in fact
 * attacks the White queen on d5. That is the move the whole line is built
 * around, described as if nothing happened.
 *
 * Everything here is computed by playing the line out on a real board, so
 * it is the same class of fact as the concept detectors: verified, never
 * asserted. It states only what a move captures, checks, or attacks — not
 * whether any of that is good, which is the model's job.
 */

const PIECE_NAME: Record<PieceSymbol, string> = {
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
  k: "king",
};

/** Pawns are excluded as attack targets — "attacks a pawn" is noise at this depth. */
const WORTH_NAMING: PieceSymbol[] = ["n", "b", "r", "q"];

export function describePrincipalVariation(
  fenBefore: string,
  principalVariationSan: string[],
  maxPlies = 8
): string[] {
  const chess = new Chess(fenBefore);
  const lines: string[] = [];

  for (const [index, san] of principalVariationSan.slice(0, maxPlies).entries()) {
    let move;
    try {
      move = chess.move(san);
    } catch {
      break;
    }

    const mover = move.color === "w" ? "White" : "Black";
    const facts: string[] = [];

    if (move.captured) facts.push(`captures the ${PIECE_NAME[move.captured]} on ${move.to}`);
    if (chess.isCheckmate()) facts.push("is checkmate");
    else if (chess.isCheck()) facts.push("gives check");

    const targets = attackedFrom(chess, move.to, move.color);
    if (targets.length > 0) facts.push(`now attacks the ${targets.join(" and the ")}`);

    const hanging = isUndefended(chess, move.to, move.color);
    if (hanging) facts.push(`the ${PIECE_NAME[move.piece]} on ${move.to} is undefended there`);

    lines.push(
      `${index + 1}. ${san} — ${mover} ${PIECE_NAME[move.piece]} ${move.from}-${move.to}` +
        (facts.length > 0 ? `; ${facts.join("; ")}` : "")
    );
  }

  return lines;
}

/** Enemy pieces the piece now standing on `square` attacks. */
function attackedFrom(chess: Chess, square: Square, moverColor: "w" | "b"): string[] {
  const enemy = moverColor === "w" ? "b" : "w";
  const found: string[] = [];
  for (const row of chess.board()) {
    for (const piece of row) {
      if (!piece || piece.color !== enemy) continue;
      if (piece.type !== "k" && !WORTH_NAMING.includes(piece.type)) continue;
      if (!chess.attackers(piece.square, moverColor).includes(square)) continue;
      const owner = enemy === "w" ? "White" : "Black";
      found.push(`${owner} ${PIECE_NAME[piece.type]} on ${piece.square}`);
    }
  }
  return found;
}

/**
 * Whether the piece that just moved is sitting on a square its own side
 * doesn't cover. Attacked-and-undefended is the single most common reason
 * a plausible-looking move in a line is actually bad, and it's cheap to
 * state rather than leave the model to infer.
 */
function isUndefended(chess: Chess, square: Square, moverColor: "w" | "b"): boolean {
  const enemy = moverColor === "w" ? "b" : "w";
  if (chess.attackers(square, enemy).length === 0) return false;
  return chess.attackers(square, moverColor).length === 0;
}
