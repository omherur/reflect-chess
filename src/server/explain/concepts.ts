import { Chess, type Square, type PieceSymbol } from "chess.js";
import type { ConceptHighlight, StructuredExplanation } from "@/lib/types";
import { firstSentence } from "@/lib/explanation-summary";
import { PIECE_VALUE, winsMaterial } from "./exchange";

/**
 * Lightweight, deterministic concept detection from board state — no
 * engine calls. Every detector here must verify REAL chess rules (piece
 * ownership/color, unobstructed line of sight, correct alignment) rather
 * than loosely inferring a pattern — a wrongly-claimed tactic teaches the
 * player something false, which is worse than saying nothing. See
 * concepts.test.ts for true-positive and false-positive-trap coverage of
 * every detector below, including a permanent regression test for a real
 * bug once found here (a "pin" claimed across mismatched piece colors with
 * a pawn merely blocking the line of sight — not a pin by any definition).
 *
 * Being geometrically real is necessary but NOT sufficient. A tactic whose
 * targets are all adequately defended wins nothing, and reporting it as a
 * finding actively wastes the player's attention — the thing they most need
 * from a review is to know which few facts actually mattered. So every
 * material-winning detector below is additionally gated on a static
 * exchange evaluation (see exchange.ts): the tactic has to be worth at
 * least a pawn once both sides have finished trading on the square.
 *
 * Detection runs on the position AFTER the move in question. Each finding
 * carries the squares involved, so the UI can highlight them on the board.
 */

/**
 * The most concepts ever reported for one moment. Past three, a reveal
 * turns into a list to read rather than a lesson to absorb — and the ones
 * beyond third place are, by the ordering in findConcepts, the least
 * material anyway.
 */
const MAX_CONCEPTS = 3;

type Side = "w" | "b";

function opposite(color: Side): Side {
  return color === "w" ? "b" : "w";
}

function fileOf(sq: Square): number {
  return sq.charCodeAt(0);
}
function rankOf(sq: Square): number {
  return parseInt(sq[1], 10);
}

/**
 * Undefended enemy pieces the side to move can actually win. "Undefended"
 * alone isn't enough: the attacking piece may itself be pinned, in which
 * case the capture is illegal and there was never anything to take — hence
 * the winsMaterial() gate, which enumerates legal captures rather than
 * geometric attacks.
 */
function hangingPieceTargets(
  chess: Chess,
  requireMaterial: boolean
): { square: Square; value: number }[] {
  const attacker = chess.turn();
  const defender = opposite(attacker);
  const found: { square: Square; value: number }[] = [];

  const board = chess.board();
  for (const row of board) {
    for (const piece of row) {
      if (!piece || piece.color !== defender || piece.type === "k") continue;
      const attackers = chess.attackers(piece.square, attacker);
      if (attackers.length === 0) continue;
      const defenders = chess.attackers(piece.square, defender);
      if (defenders.length > 0) continue;
      if (requireMaterial && !winsMaterial(chess, piece.square)) continue;
      found.push({ square: piece.square, value: PIECE_VALUE[piece.type] });
    }
  }
  return found.sort((a, b) => b.value - a.value);
}

/**
 * Detect a fork: one piece attacking 2+ valuable enemy pieces, where the
 * fork actually costs the defender something.
 *
 * The material gate is the whole point of this detector being trustworthy.
 * A knight hitting two rooks that are each defended still wins a rook for a
 * knight; a knight hitting two defended knights wins nothing, and a queen
 * "forking" two defended pawns loses material if it takes either one. Only
 * the first is a finding. `targets` is narrowed to the ones actually
 * winnable, so the note names what's genuinely at stake instead of listing
 * every piece the fork happens to touch.
 */
function findFork(
  chess: Chess,
  requireMaterial: boolean
): { attacker: Square; targets: Square[] } | null {
  const attackerColor = chess.turn();
  const defender = opposite(attackerColor);
  const board = chess.board();

  for (const row of board) {
    for (const piece of row) {
      if (!piece || piece.color !== attackerColor) continue;
      const targets: Square[] = [];
      for (const row2 of board) {
        for (const target of row2) {
          if (!target || target.color !== defender) continue;
          if (target.type === "p") continue;
          if (chess.attackers(target.square, attackerColor).includes(piece.square)) {
            targets.push(target.square);
          }
        }
      }
      if (targets.length < 2) continue;
      // Two targets are what makes it a fork — the defender can't save both
      // — but at least one of them has to be worth taking, or nothing is
      // being threatened and there's nothing to tell the player.
      if (!requireMaterial) return { attacker: piece.square, targets };
      const winnable = targets.filter((sq) => winsMaterial(chess, sq));
      if (winnable.length === 0) continue;
      return { attacker: piece.square, targets: winnable.length >= 2 ? winnable : targets };
    }
  }
  return null;
}

/**
 * Whether two squares lie on a line the given sliding piece type can move
 * along (rook: file/rank, bishop: diagonal, queen: either).
 */
function isAligned(a: Square, b: Square, pieceType: "b" | "r" | "q"): boolean {
  const [af, ar] = [fileOf(a), rankOf(a)];
  const [bf, br] = [fileOf(b), rankOf(b)];
  const sameFile = af === bf;
  const sameRank = ar === br;
  const sameDiag = Math.abs(af - bf) === Math.abs(ar - br);
  if (pieceType === "r") return sameFile || sameRank;
  if (pieceType === "b") return sameDiag;
  return sameFile || sameRank || sameDiag;
}

/** Squares strictly between a and b along their shared line (exclusive of both ends). */
function squaresBetween(a: Square, b: Square): Square[] {
  const [af, ar] = [fileOf(a), rankOf(a)];
  const [bf, br] = [fileOf(b), rankOf(b)];
  const stepF = Math.sign(bf - af);
  const stepR = Math.sign(br - ar);
  const squares: Square[] = [];
  let f = af + stepF;
  let r = ar + stepR;
  // Guards against non-aligned inputs (shouldn't happen given isAligned checks upstream).
  let guard = 0;
  while ((f !== bf || r !== br) && guard < 8) {
    squares.push((String.fromCharCode(f) + r) as Square);
    f += stepF;
    r += stepR;
    guard++;
  }
  return squares;
}

/**
 * The first occupied square beyond `through`, continuing the ray from
 * `from` through it (may pass over empty squares first — a skewer doesn't
 * require the second piece to be immediately adjacent to the first, only
 * that nothing else blocks the line between them).
 */
function firstOccupiedBeyond(chess: Chess, from: Square, through: Square): Square | null {
  const [ff, fr] = [fileOf(from), rankOf(from)];
  const [tf, tr] = [fileOf(through), rankOf(through)];
  const stepF = Math.sign(tf - ff);
  const stepR = Math.sign(tr - fr);
  let f = tf + stepF;
  let r = tr + stepR;
  while (f >= 97 && f <= 104 && r >= 1 && r <= 8) {
    const sq = (String.fromCharCode(f) + r) as Square;
    if (chess.get(sq)) return sq;
    f += stepF;
    r += stepR;
  }
  return null;
}

function findKing(chess: Chess, color: Side): Square | null {
  const board = chess.board();
  for (const row of board) {
    for (const piece of row) {
      if (piece && piece.type === "k" && piece.color === color) return piece.square;
    }
  }
  return null;
}

/**
 * A real (absolute) pin: an attacking sliding piece is aligned with the
 * enemy king, with EXACTLY ONE piece anywhere in between, and that piece
 * belongs to the DEFENDER (the same side as the king) — not the attacker's
 * own piece merely sitting in the way. Both the color of the blocking piece
 * and the fact that there is exactly one of them are required; neither was
 * checked before, which is exactly how a mixed-color, pawn-blocked non-pin
 * could get flagged as a pin.
 */
function findPin(
  chess: Chess,
  requireMaterial: boolean
): { pinner: Square; pinned: Square; behind: Square } | null {
  const attacker = chess.turn();
  const defender = opposite(attacker);
  const kingSquare = findKing(chess, defender);
  if (!kingSquare) return null;
  const board = chess.board();

  for (const row of board) {
    for (const piece of row) {
      if (!piece || piece.color !== attacker) continue;
      if (piece.type !== "b" && piece.type !== "r" && piece.type !== "q") continue;
      if (piece.square === kingSquare) continue;
      if (!isAligned(piece.square, kingSquare, piece.type)) continue;

      const between = squaresBetween(piece.square, kingSquare);
      if (between.length === 0) continue; // adjacent/direct line = check, not a pin

      const occupied = between
        .map((sq) => ({ sq, occupant: chess.get(sq) }))
        .filter((x) => x.occupant !== undefined);
      if (occupied.length !== 1) continue; // must be exactly one piece in the way

      const { sq: pinnedSq, occupant } = occupied[0];
      if (!occupant || occupant.color !== defender) continue; // must be the DEFENDER's piece, not the attacker's own
      if (requireMaterial && !pinCostsMaterial(chess, pinnedSq, attacker, defender)) continue;

      return { pinner: piece.square, pinned: pinnedSq, behind: kingSquare };
    }
  }
  return findRelativePin(chess, requireMaterial);
}

/**
 * A relative pin: the same shape as an absolute pin, except the piece
 * being shielded is merely more valuable rather than the king. A knight on
 * f6 with the queen behind it on d8 can technically move; it just loses the
 * queen if it does.
 *
 * This was missing entirely, and its absence had a cost beyond the missing
 * finding. Bg5 pinning a knight to the queen is one of the most common
 * shapes in chess — a player in the dev database described their own move
 * as exactly that — and because no detector could confirm it, the model
 * writing the same true sentence counted as an unverified tactical claim
 * and had its text replaced with the generic template. The check meant to
 * stop invented tactics was suppressing a real one.
 */
function findRelativePin(
  chess: Chess,
  requireMaterial: boolean
): { pinner: Square; pinned: Square; behind: Square } | null {
  const attacker = chess.turn();
  const defender = opposite(attacker);
  const board = chess.board();

  for (const row of board) {
    for (const piece of row) {
      if (!piece || piece.color !== attacker) continue;
      if (piece.type !== "b" && piece.type !== "r" && piece.type !== "q") continue;

      for (const row2 of board) {
        for (const front of row2) {
          if (!front || front.color !== defender || front.type === "k") continue;
          if (!isAligned(piece.square, front.square, piece.type)) continue;
          if (!chess.attackers(front.square, attacker).includes(piece.square)) continue;

          const beyond = firstOccupiedBeyond(chess, piece.square, front.square);
          if (!beyond) continue;
          const shielded = chess.get(beyond);
          if (!shielded || shielded.color !== defender) continue;

          // Strictly more valuable, or the shape is a skewer (handled
          // there) rather than a pin. The king is excluded because that's
          // the absolute pin the caller already looked for.
          if (shielded.type === "k") continue;
          if (PIECE_VALUE[shielded.type] <= PIECE_VALUE[front.type]) continue;

          if (requireMaterial && !pinCostsMaterial(chess, front.square, attacker, defender)) {
            continue;
          }
          return { pinner: piece.square, pinned: front.square, behind: beyond };
        }
      }
    }
  }
  return null;
}

/**
 * Whether a real pin is one the player needs to hear about.
 *
 * Every absolute pin is geometrically real, but most of them cost nothing:
 * a knight pinned to its king while defended twice and attacked once is
 * simply a piece that can't move for a while, not a piece that's going to
 * be lost. Two ways a pin becomes material, and it only takes one:
 *
 *  - it can be cashed in right now (a profitable capture on the square), or
 *  - the attacker can pile on and win it. Because a pinned piece cannot
 *    step out of the line, attackers only have to match defenders rather
 *    than outnumber them — the defender can never break the standoff by
 *    moving the piece to safety, which is exactly what the pin takes away.
 *
 * A pin that immobilizes a piece which is defending something else is a
 * third, genuinely useful case this deliberately does NOT try to detect —
 * the material it wins shows up on the OTHER square, where the hanging /
 * fork detectors will find it and describe it more concretely than "there
 * is a pin somewhere" ever could.
 */
function pinCostsMaterial(chess: Chess, pinned: Square, attacker: Side, defender: Side): boolean {
  if (winsMaterial(chess, pinned)) return true;
  const attackers = chess.attackers(pinned, attacker).length;
  const defenders = chess.attackers(pinned, defender).length;
  return attackers >= defenders;
}

/**
 * A skewer: an attacking sliding piece directly (unobstructed) attacks a
 * defender piece that is obligated to move (the king, or a piece of equal
 * or greater value than what's immediately behind it on the same line) —
 * with another defender piece directly behind it on that same line, ready
 * to be captured once the front piece moves out of the way.
 *
 * The piece behind must NOT be the king — that shape (a less-valuable piece
 * in front of the king, immobilized) is a PIN, not a skewer, regardless of
 * relative piece values. Without this exclusion, the king's value of 0 would
 * satisfy "front piece is worth at least as much," making every pin also
 * get double-labeled as a skewer of the exact same two squares.
 */
function findSkewer(
  chess: Chess,
  requireMaterial: boolean
): { attacker: Square; front: Square; behind: Square } | null {
  const attackerColor = chess.turn();
  const defenderColor = opposite(attackerColor);
  const board = chess.board();

  for (const row of board) {
    for (const piece of row) {
      if (!piece || piece.color !== attackerColor) continue;
      if (piece.type !== "b" && piece.type !== "r" && piece.type !== "q") continue;

      for (const row2 of board) {
        for (const front of row2) {
          if (!front || front.color !== defenderColor) continue;
          if (!isAligned(piece.square, front.square, piece.type)) continue;
          if (!chess.attackers(front.square, attackerColor).includes(piece.square)) continue;

          const beyond = firstOccupiedBeyond(chess, piece.square, front.square);
          if (!beyond) continue;
          const behindPiece = chess.get(beyond);
          if (!behindPiece || behindPiece.color !== defenderColor) continue;
          if (behindPiece.type === "k") continue; // that's a pin, not a skewer

          const frontMustMove =
            front.type === "k" || PIECE_VALUE[front.type] >= PIECE_VALUE[behindPiece.type];
          if (!frontMustMove) continue;

          // The front piece has to be under a threat it can't just ignore.
          // Relative value alone said a queen "attacking" a defended pawn
          // forces that pawn to move, which is backwards — the queen is the
          // piece that daren't take. Real dev-DB data was full of exactly
          // this: "the White queen on h5 attacks the Black pawn on g5,
          // which must move and expose the Black pawn on d5 behind it".
          if (requireMaterial && front.type !== "k" && !winsMaterial(chess, front.square)) continue;

          // And what's behind has to be worth winning. A skewer that ends
          // in a pawn isn't a lesson, it's a footnote — every genuine one
          // wins a piece or better.
          if (requireMaterial && PIECE_VALUE[behindPiece.type] < PIECE_VALUE.n) continue;

          // The piece behind has to be worth taking once the front one
          // steps aside. If it's defended and worth no more than the
          // skewering piece, the "skewer" ends in an even trade at best —
          // true geometry, no consequence, nothing to report.
          //
          // The front piece is excluded from that defence count on purpose:
          // it's the piece being forced to move, so whatever it currently
          // covers it may well stop covering. Counting it would suppress the
          // most common skewer shape there is — a queen in front of a rook
          // on the same rank, where the queen "defends" the rook right up
          // until the moment it has to run.
          const defenders = chess
            .attackers(beyond, defenderColor)
            .filter((sq) => sq !== front.square);
          if (
            requireMaterial &&
            defenders.length > 0 &&
            PIECE_VALUE[behindPiece.type] <= PIECE_VALUE[piece.type]
          ) {
            continue;
          }

          return { attacker: piece.square, front: front.square, behind: beyond };
        }
      }
    }
  }
  return null;
}

/**
 * Back-rank weakness: king on its home rank with no square it could
 * actually flee to — meaning every square directly in front of it is
 * either occupied (by either side) or itself attacked by the opponent.
 * An empty-but-attacked escape square is not real luft.
 */
function hasBackRankWeakness(chess: Chess, color: Side): boolean {
  const kingSquare = findKing(chess, color);
  if (!kingSquare || kingSquare[1] !== (color === "w" ? "1" : "8")) return false;
  const opponent = opposite(color);
  const escapeRank = color === "w" ? "2" : "7";
  const file = fileOf(kingSquare);
  for (const df of [-1, 0, 1]) {
    const f = String.fromCharCode(file + df);
    if (f < "a" || f > "h") continue;
    const sq = `${f}${escapeRank}` as Square;
    if (chess.get(sq)) continue; // occupied, not a real escape square
    if (chess.attackers(sq, opponent).length > 0) continue; // empty but covered, not real luft
    return false; // found a genuine escape square
  }
  return true;
}

/** King safety: how many squares around the king are attacked by the opponent. */
function kingExposure(chess: Chess, color: Side): number {
  const kingSquare = findKing(chess, color);
  if (!kingSquare) return 0;
  const opponent = opposite(color);
  const file = fileOf(kingSquare) - 97;
  const rank = rankOf(kingSquare) - 1;
  let attacked = 0;
  for (let df = -1; df <= 1; df++) {
    for (let dr = -1; dr <= 1; dr++) {
      if (df === 0 && dr === 0) continue;
      const f = file + df;
      const r = rank + dr;
      if (f < 0 || f > 7 || r < 0 || r > 7) continue;
      const sq = (String.fromCharCode(97 + f) + (r + 1)) as Square;
      if (chess.attackers(sq, opponent).length > 0) attacked++;
    }
  }
  return attacked;
}

const PIECE_NAME: Record<PieceSymbol, string> = {
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
  k: "king",
};

/** e.g. "White bishop" for the piece actually sitting on `square`. */
function pieceLabel(chess: Chess, square: Square): string {
  const piece = chess.get(square);
  if (!piece) return "piece";
  const color = piece.color === "w" ? "White" : "Black";
  return `${color} ${PIECE_NAME[piece.type]}`;
}

/**
 * Analyze the position resulting from a move to surface plausible concepts,
 * with the squares involved so the UI can highlight them on the board. Each
 * note names the actual pieces and squares involved (not just an abstract
 * label) so it can be used as a concrete, verified fact — both for the
 * deterministic template and as grounding input to the explanation model.
 * `fenAfter` is the FEN after the move was played; `moverColor` is who just moved.
 *
 * `requireMaterial` separates two different questions that were previously
 * answered by one list. Displaying a finding asks "is this worth the
 * player's attention", which is why the material gates exist. Checking the
 * model's prose asks only "is this true", and holding it to the stricter
 * bar meant a correct sentence about a real-but-cheap tactic was treated
 * as an invented one. Pass false for the second question only.
 */
export function findConcepts(
  fenAfter: string,
  moverColor: Side,
  { requireMaterial = true }: { requireMaterial?: boolean } = {}
): ConceptHighlight[] {
  const chess = new Chess(fenAfter);
  const highlights: ConceptHighlight[] = [];

  const hanging = hangingPieceTargets(chess, requireMaterial);
  if (hanging.length > 0) {
    const [top, second] = hanging;
    const topLabel = pieceLabel(chess, top.square);
    const note = second
      ? `${topLabel} on ${top.square} is undefended and can be captured — so is the ${pieceLabel(chess, second.square)} on ${second.square}`
      : `${topLabel} on ${top.square} is undefended and can be captured`;
    highlights.push({
      concept: "hanging piece",
      note,
      squares: hanging.slice(0, 2).map((h) => h.square),
    });
  }

  const fork = findFork(chess, requireMaterial);
  if (fork) {
    const attackerLabel = pieceLabel(chess, fork.attacker);
    const targets = fork.targets
      .slice(0, 2)
      .map((sq) => `${pieceLabel(chess, sq)} on ${sq}`)
      .join(" and ");
    highlights.push({
      concept: "fork",
      note: `${attackerLabel} on ${fork.attacker} attacks ${targets} at the same time`,
      squares: [fork.attacker, ...fork.targets.slice(0, 2)],
    });
  }

  const pin = findPin(chess, requireMaterial);
  if (pin) {
    const pinnedLabel = pieceLabel(chess, pin.pinned);
    const pinnerLabel = pieceLabel(chess, pin.pinner);
    const behindLabel = pieceLabel(chess, pin.behind);
    // An absolute pin can't legally move at all; a relative one can, at a
    // price. Saying "can't move" of the second would be plainly wrong.
    const consequence = chess.get(pin.behind)?.type === "k" ? "can't move without exposing" : "can't move without losing";
    highlights.push({
      concept: "pin",
      note: `${pinnedLabel} on ${pin.pinned} is pinned by the ${pinnerLabel} on ${pin.pinner} — it ${consequence} the ${behindLabel} on ${pin.behind}`,
      squares: [pin.pinner, pin.behind, pin.pinned],
    });
  }

  const skewer = findSkewer(chess, requireMaterial);
  if (skewer) {
    const attackerLabel = pieceLabel(chess, skewer.attacker);
    const frontLabel = pieceLabel(chess, skewer.front);
    const behindLabel = pieceLabel(chess, skewer.behind);
    highlights.push({
      concept: "skewer",
      note: `the ${attackerLabel} on ${skewer.attacker} attacks the ${frontLabel} on ${skewer.front}, which must move and expose the ${behindLabel} on ${skewer.behind} behind it`,
      squares: [skewer.attacker, skewer.front, skewer.behind],
    });
  }

  if (hasBackRankWeakness(chess, moverColor)) {
    const king = findKing(chess, moverColor);
    highlights.push({
      concept: "back-rank weakness",
      note: king
        ? `the king on ${king} has no escape square on the back rank`
        : "the king has no escape square on the back rank",
      squares: king ? [king] : [],
    });
  }

  if (kingExposure(chess, moverColor) >= 3) {
    const king = findKing(chess, moverColor);
    highlights.push({
      concept: "king exposure",
      note: king
        ? `the king on ${king} is significantly exposed, with several nearby squares under attack`
        : "the king is significantly exposed to attack",
      squares: king ? [king] : [],
    });
  }

  // Push order above is roughly descending consequence — lost material
  // first, then tactics that win it, then king-safety observations — so
  // taking the first few keeps the ones that matter most.
  return highlights.slice(0, MAX_CONCEPTS);
}

// ---------------------------------------------------------------------------
// Relevance filter: a concept can be TRUE (structurally present somewhere on
// the board) without being LOAD-BEARING for the specific move being
// explained — e.g. a king's back-rank weakness that's real but has nothing
// to do with why this particular midgame move gained or lost value. Surfacing
// it anyway is background noise dressed up as an explanation. A concept only
// earns a place in the output if it's spatially connected to the move that
// was actually played, the engine's recommended move, or the immediate
// follow-up line — i.e. the best line, blunder, or missed tactic actually
// involves or exploits it.
// ---------------------------------------------------------------------------

export interface MoveRelevanceContext {
  /** [from, to] squares of the move actually being explained (original or replay). */
  moveSquares: string[];
  /** [from, to] squares of the engine's recommended move. */
  bestSquares: string[];
  /** [from, to] squares from the first few moves of the principal variation. */
  pvSquares: string[];
}

function isRelevantToMove(highlight: ConceptHighlight, ctx: MoveRelevanceContext): boolean {
  const relevant = new Set([...ctx.moveSquares, ...ctx.bestSquares, ...ctx.pvSquares]);
  return highlight.squares.some((sq) => relevant.has(sq));
}

/**
 * Drop concepts that are true but not currently relevant — keep only the
 * ones spatially connected to the move played, the best move, or the
 * immediate principal variation.
 */
export function filterRelevantConcepts(
  highlights: ConceptHighlight[],
  ctx: MoveRelevanceContext
): ConceptHighlight[] {
  return highlights.filter((h) => isRelevantToMove(h, ctx));
}

/** [from, to] squares for a UCI move string like "e2e4" (or "e7e8q"). */
export function uciSquares(uci: string): string[] {
  return [uci.slice(0, 2), uci.slice(2, 4)];
}

/**
 * Replays a SAN move sequence from a starting FEN (e.g. a stored principal
 * variation) to recover the actual squares involved, since PV lines are
 * sometimes only available as SAN rather than UCI.
 */
export function pvSquaresFromSan(fen: string, sanMoves: string[], maxMoves = 3): string[] {
  const chess = new Chess(fen);
  const squares: string[] = [];
  for (const san of sanMoves.slice(0, maxMoves)) {
    try {
      const move = chess.move(san);
      squares.push(move.from, move.to);
    } catch {
      break;
    }
  }
  return squares;
}

/**
 * A move is only "approximate" (low confidence) when we're leaning on
 * heuristic concept detection for a move that wasn't a clear blunder/mistake
 * and no concepts were found to anchor the explanation.
 */
export function computeApproximate(classification: string, concepts: string[]): boolean {
  return (
    concepts.length === 0 && (classification === "INACCURACY" || classification === "MISTAKE")
  );
}

// ---------------------------------------------------------------------------
// Grounding check: the explanation-generating model is never allowed to
// assert its own tactical claims — it may only reference concepts explicitly
// handed to it by the deterministic detectors above. This is a second-pass
// safety net that catches a model naming a tactic (pin, fork, skewer, etc.)
// that isn't actually present in the verified concept list it was given.
// ---------------------------------------------------------------------------

const TACTICAL_TERMS: { concept: string; pattern: RegExp }[] = [
  // "pins" was missing from this alternation, so "Bg5 pins the knight"
  // passed the check unexamined while "a pin on the knight" did not — the
  // same claim, caught or not depending on the verb form.
  { concept: "pin", pattern: /\bpin(?:s|ned|ning)?\b/i },
  { concept: "fork", pattern: /\bfork(?:s|ed|ing)?\b/i },
  { concept: "skewer", pattern: /\bskewer(?:s|ed|ing)?\b/i },
  { concept: "discovered attack", pattern: /\bdiscover(?:ed|y)? (?:attack|check)\b/i },
  { concept: "back-rank weakness", pattern: /\bback[- ]rank\b/i },
  { concept: "hanging piece", pattern: /\bhang(?:s|ing)?\b/i },
  { concept: "king exposure", pattern: /\bking exposure\b|\bexposed king\b/i },
];

/**
 * Addressable text fields of an explanation. The summary's three lines are
 * addressed with a dotted path because they're nested one level down — and
 * they have to be addressable at all, since a summary is the layer most
 * players read and an unverified tactic asserted there would reach more
 * people than the same claim buried in the detail.
 */
export type ExplanationField =
  | "whatYourMoveDid"
  | "whatItMissed"
  | "whyBestIsBetter"
  | "remember"
  | "replayNote"
  | "summary.headline"
  | "summary.betterMove"
  | "summary.takeaway";

export interface GroundingViolation {
  field: ExplanationField;
  concept: string;
}

const NARRATIVE_FIELDS = [
  "whatYourMoveDid",
  "whatItMissed",
  "whyBestIsBetter",
  "remember",
] as const;

const SUMMARY_FIELDS = ["headline", "betterMove", "takeaway"] as const;

type SummaryField = Extract<ExplanationField, `summary.${string}`>;
/** The flat text fields — everything addressable that isn't a summary line. */
type DeepField = Exclude<ExplanationField, SummaryField>;

function isSummaryField(field: ExplanationField): field is SummaryField {
  return field.startsWith("summary.");
}

/**
 * Every concept that is genuinely verifiable for this moment — which is a
 * different question from which concepts are worth *showing*.
 *
 * `filterRelevantConcepts` decides what to display, and it is deliberately
 * strict; using that same narrowed list to decide what the model may SAY
 * conflates the two. A real case from the dev database: after Bg5 in
 * `r1bqk2r/pppp1ppp/1bn2n2/4p3/2BPP3/2P2N2/PP3PPP/RNBQK2R w KQkq - 1 6`,
 * a hanging piece is detected, the relevance filter drops it, and the
 * allow-list arrives empty — so the model's correct, concrete prose about
 * the pawn it could have taken was replaced with "It missed a stronger
 * continuation the engine found in this position." Three of the four
 * explanation fields degraded that way at once.
 *
 * So the vocabulary is drawn from the board rather than the display set:
 * the unfiltered concepts on the position after the move, plus those in
 * the engine's principal variation, which the prompt explicitly asks the
 * model to narrate.
 *
 * The guarantee this protects is unchanged in kind: every term is still
 * one a deterministic detector verified on a real position, never one the
 * model asserted on its own. It is weaker in degree — a tactic verified
 * several plies into the line could be cited as though it were on the
 * board now — which is why the PV window is short.
 */
export function verifiedConceptVocabulary(
  fenBefore: string,
  playedUci: string,
  principalVariationSan: string[],
  maxPvPlies = 6
): string[] {
  const names = new Set<string>();

  const afterPlayed = new Chess(fenBefore);
  try {
    const move = afterPlayed.move({
      from: playedUci.slice(0, 2),
      to: playedUci.slice(2, 4),
      promotion: playedUci.slice(4, 5) || undefined,
    });
    for (const name of conceptsFromBothSides(afterPlayed.fen(), move.color)) names.add(name);
  } catch {
    // An unplayable move here means the caller handed us mismatched data;
    // the PV pass below is still worth running.
  }

  const line = new Chess(fenBefore);
  for (const san of principalVariationSan.slice(0, maxPvPlies)) {
    let move;
    try {
      move = line.move(san);
    } catch {
      break;
    }
    for (const name of conceptsFromBothSides(line.fen(), move.color)) names.add(name);
  }

  return Array.from(names);
}

/**
 * Concept names present for EITHER side in a position.
 *
 * The detectors all read threats belonging to the side to move, which for a
 * position after the player's move means threats against the player —
 * correct for "what did your move leave hanging", and exactly wrong for
 * anything the player's own move created. Bg5 pinning a knight is the
 * player's pin, so it is invisible from that one perspective, which is how
 * a player's own accurate description of their move ("pinning the knight to
 * the queen") ended up unverifiable.
 *
 * Running the detectors again against the same position with the side to
 * move flipped — a null move — recovers the other half. This is only used
 * to decide what the model is ALLOWED TO SAY, never what gets displayed;
 * the display list stays deliberately one-sided.
 */
function conceptsFromBothSides(fen: string, moverColor: Side): string[] {
  const names = findConcepts(fen, moverColor, { requireMaterial: false }).map((c) => c.concept);
  const flipped = flipSideToMove(fen);
  if (!flipped) return names;
  try {
    for (const c of findConcepts(flipped, moverColor, { requireMaterial: false })) {
      names.push(c.concept);
    }
  } catch {
    // A position that is only legal for one side to move (the other side
    // would be leaving itself in check) — nothing to add from that side.
  }
  return names;
}

/**
 * The same position with the other side to move. The en-passant square is
 * cleared because it describes the move that was just played, and it makes
 * no sense — and may be rejected as illegal — once the turn is inverted.
 */
function flipSideToMove(fen: string): string | null {
  const fields = fen.split(" ");
  if (fields.length < 4) return null;
  fields[1] = fields[1] === "w" ? "b" : "w";
  fields[3] = "-";
  return fields.join(" ");
}

/**
 * Scans each narrative field of a generated explanation for named tactical
 * terms and flags any that don't appear in the verified concept list that
 * field is allowed to reference. `whatYourMoveDid`/`whatItMissed`/
 * `whyBestIsBetter`/`remember` describe the ORIGINAL position, so they're
 * checked against `originalConcepts`; `replayNote` describes the position
 * after the replay move, so it's checked against the union of both.
 */
export function findGroundingViolations(
  explanation: StructuredExplanation,
  originalConcepts: string[],
  replayConcepts: string[]
): GroundingViolation[] {
  const originalSet = new Set(originalConcepts.map((c) => c.toLowerCase()));
  const allSet = new Set([...originalConcepts, ...replayConcepts].map((c) => c.toLowerCase()));

  const violations: GroundingViolation[] = [];
  const check = (field: ExplanationField, text: string, allowed: Set<string>) => {
    for (const { concept, pattern } of TACTICAL_TERMS) {
      if (pattern.test(text) && !allowed.has(concept)) {
        violations.push({ field, concept });
      }
    }
  };

  for (const field of NARRATIVE_FIELDS) {
    check(field, explanation[field], originalSet);
  }
  check("replayNote", explanation.replayNote, allSet);

  // The summary describes the original position, same as the four detail
  // fields, so it's held to the same verified list.
  const summary = explanation.summary;
  if (summary) {
    for (const key of SUMMARY_FIELDS) {
      check(`summary.${key}`, summary[key] ?? "", originalSet);
    }
  }

  return violations;
}

/**
 * Patches any fields that failed the grounding check by replacing them with
 * the corresponding field from a known-safe fallback explanation (the
 * deterministic template, which only ever names concepts it was actually
 * given) — leaving every non-violating field from the original untouched.
 */
export function applyGrounding(
  explanation: StructuredExplanation,
  fallback: StructuredExplanation,
  violations: GroundingViolation[]
): StructuredExplanation {
  if (violations.length === 0) return explanation;
  const violatingFields = new Set(violations.map((v) => v.field));
  const patched: StructuredExplanation = { ...explanation };

  for (const field of violatingFields) {
    if (isSummaryField(field)) {
      const key = field.slice("summary.".length) as (typeof SUMMARY_FIELDS)[number];
      if (!patched.summary) continue;
      const replacement = summaryReplacement(key, explanation, fallback, violatingFields);
      if (replacement) patched.summary = { ...patched.summary, [key]: replacement };
      continue;
    }
    patched[field] = fallback[field];
  }
  return patched;
}

/**
 * What to put in a summary line whose original text named an unverified
 * tactic.
 *
 * The template's equivalent line is always available and always safe, but
 * it's also the most generic sentence in the system ("gave up a small
 * amount of your advantage"), and since the summary is the layer nearly
 * everyone reads, dropping to it costs more than it used to. So the deep
 * field that says the same thing is tried first: if the model's own
 * `whatItMissed` passed the grounding check, its first sentence is a far
 * better headline than the template's, and it's just as verified — it
 * survived exactly the same test.
 */
function summaryReplacement(
  key: (typeof SUMMARY_FIELDS)[number],
  explanation: StructuredExplanation,
  fallback: StructuredExplanation,
  violatingFields: Set<ExplanationField>
): string | undefined {
  const sourceField = SUMMARY_SOURCE_FIELD[key];
  if (!violatingFields.has(sourceField)) {
    const source = explanation[sourceField]?.trim();
    if (source) return firstSentence(source);
  }
  return fallback.summary?.[key];
}

/** The deep field each summary line compresses, used when one needs replacing. */
const SUMMARY_SOURCE_FIELD: Record<(typeof SUMMARY_FIELDS)[number], DeepField> = {
  headline: "whatItMissed",
  betterMove: "whyBestIsBetter",
  takeaway: "remember",
};
