import { Chess, type Square, type PieceSymbol } from "chess.js";
import type { ConceptHighlight, StructuredExplanation } from "@/lib/types";

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
 * Detection runs on the position AFTER the move in question. Each finding
 * carries the squares involved, so the UI can highlight them on the board.
 */

const PIECE_VALUE: Record<PieceSymbol, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};

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

/** Squares attacked by the side to move that hold an undefended enemy piece. */
function hangingPieceTargets(chess: Chess): { square: Square; value: number }[] {
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
      if (defenders.length === 0) {
        found.push({ square: piece.square, value: PIECE_VALUE[piece.type] });
      }
    }
  }
  return found.sort((a, b) => b.value - a.value);
}

/** Detect a fork: one piece attacking 2+ valuable enemy pieces. Returns the attacker + targets. */
function findFork(chess: Chess): { attacker: Square; targets: Square[] } | null {
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
      if (targets.length >= 2) return { attacker: piece.square, targets };
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
function findPin(chess: Chess): { pinner: Square; pinned: Square; king: Square } | null {
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

      return { pinner: piece.square, pinned: pinnedSq, king: kingSquare };
    }
  }
  return null;
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
function findSkewer(chess: Chess): { attacker: Square; front: Square; behind: Square } | null {
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
 */
export function findConcepts(fenAfter: string, moverColor: Side): ConceptHighlight[] {
  const chess = new Chess(fenAfter);
  const highlights: ConceptHighlight[] = [];

  const hanging = hangingPieceTargets(chess);
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

  const fork = findFork(chess);
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

  const pin = findPin(chess);
  if (pin) {
    const pinnedLabel = pieceLabel(chess, pin.pinned);
    const pinnerLabel = pieceLabel(chess, pin.pinner);
    const kingLabel = pieceLabel(chess, pin.king);
    highlights.push({
      concept: "pin",
      note: `${pinnedLabel} on ${pin.pinned} is pinned by the ${pinnerLabel} on ${pin.pinner} — it can't move without exposing the ${kingLabel} on ${pin.king}`,
      squares: [pin.pinner, pin.king, pin.pinned],
    });
  }

  const skewer = findSkewer(chess);
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

  return highlights;
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
  { concept: "pin", pattern: /\bpinn(?:ed|ing)?\b|\bpin\b/i },
  { concept: "fork", pattern: /\bfork(?:s|ed|ing)?\b/i },
  { concept: "skewer", pattern: /\bskewer(?:s|ed|ing)?\b/i },
  { concept: "discovered attack", pattern: /\bdiscover(?:ed|y)? (?:attack|check)\b/i },
  { concept: "back-rank weakness", pattern: /\bback[- ]rank\b/i },
  { concept: "hanging piece", pattern: /\bhang(?:s|ing)?\b/i },
  { concept: "king exposure", pattern: /\bking exposure\b|\bexposed king\b/i },
];

export interface GroundingViolation {
  field: keyof StructuredExplanation;
  concept: string;
}

const NARRATIVE_FIELDS: (keyof StructuredExplanation)[] = [
  "whatYourMoveDid",
  "whatItMissed",
  "whyBestIsBetter",
  "remember",
];

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
  const check = (field: keyof StructuredExplanation, text: string, allowed: Set<string>) => {
    for (const { concept, pattern } of TACTICAL_TERMS) {
      if (pattern.test(text) && !allowed.has(concept)) {
        violations.push({ field, concept });
      }
    }
  };

  for (const field of NARRATIVE_FIELDS) {
    check(field, explanation[field] as string, originalSet);
  }
  check("replayNote", explanation.replayNote, allSet);

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
  const patched = { ...explanation };
  for (const { field } of violations) {
    (patched[field] as string) = fallback[field] as string;
  }
  return patched;
}
