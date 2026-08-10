import { Chess } from "chess.js";
import type { Color, ParsedMove, TerminationReason } from "@/lib/types";

export interface ParsedGame {
  headers: Record<string, string>;
  moves: ParsedMove[];
  result: string;
  terminationReason: TerminationReason | null;
}

export class PgnParseError extends Error {}

const CLK_PATTERN = /%clk\s+(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/;

/** Parses a `{[%clk 0:09:58]}`-style PGN comment into total seconds. */
function parseClockComment(comment: string | undefined): number | null {
  if (!comment) return null;
  const match = CLK_PATTERN.exec(comment);
  if (!match) return null;
  const [, hours, minutes, seconds] = match;
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
}

/**
 * Classifies how a game ended from its PGN Termination header (the text
 * Chess.com and similar platforms write, e.g. "PlayerA won on time"). Falls
 * back to a checkmate-symbol check on the final SAN, then "other".
 */
function classifyTermination(
  headers: Record<string, string>,
  finalSan: string | undefined
): TerminationReason | null {
  const text = (headers.Termination ?? "").toLowerCase();
  if (text) {
    if (text.includes("time")) return "timeout";
    if (text.includes("checkmate")) return "checkmate";
    if (text.includes("resign")) return "resignation";
    if (text.includes("abandon")) return "abandoned";
    if (text.includes("agreement") || text.includes("drawn") || text.includes("draw")) return "agreement";
    if (text.includes("stalemate") || text.includes("repetition") || text.includes("insufficient") || text.includes("50-move") || text.includes("fifty")) {
      return "agreement";
    }
    return "other";
  }
  if (finalSan?.includes("#")) return "checkmate";
  return null;
}

/**
 * Parse a single PGN into headers plus a fully expanded move list with
 * before/after FENs. Throws PgnParseError on malformed input.
 */
export function parsePgn(pgn: string): ParsedGame {
  const chess = new Chess();
  try {
    chess.loadPgn(pgn.trim());
  } catch (err) {
    throw new PgnParseError(
      `Could not parse PGN: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const headers = chess.getHeaders();
  const verbose = chess.history({ verbose: true });
  if (verbose.length === 0) {
    throw new PgnParseError("PGN contains no moves.");
  }

  const commentsByFen = new Map(chess.getComments().map((c) => [c.fen, c.comment]));

  const moves: ParsedMove[] = verbose.map((m, i) => ({
    ply: i + 1,
    moveNumber: Math.floor(i / 2) + 1,
    color: m.color === "w" ? "white" : "black",
    san: m.san,
    uci: m.from + m.to + (m.promotion ?? ""),
    fenBefore: m.before,
    fenAfter: m.after,
    clockSeconds: parseClockComment(commentsByFen.get(m.after)),
  }));

  return {
    headers,
    moves,
    result: headers.Result ?? "*",
    terminationReason: classifyTermination(headers, moves[moves.length - 1]?.san),
  };
}

/**
 * Split text that may contain multiple concatenated PGN games into
 * individual PGN strings.
 */
export function splitPgns(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  // A new game starts at an [Event ...] tag at the beginning of a line.
  const parts = trimmed.split(/\n(?=\[Event )/g).map((p) => p.trim());
  return parts.filter(Boolean);
}

/** Which color a username played in a game, matching case-insensitively. */
export function colorForUsername(
  headers: Record<string, string>,
  username: string
): Color | null {
  const u = username.trim().toLowerCase();
  if ((headers.White ?? "").toLowerCase() === u) return "white";
  if ((headers.Black ?? "").toLowerCase() === u) return "black";
  return null;
}

/** Side to move for a FEN. */
export function sideToMove(fen: string): Color {
  return fen.split(" ")[1] === "b" ? "black" : "white";
}

export interface ValidatedMove {
  san: string;
  uci: string;
  fenAfter: string;
}

/**
 * Validate a move (SAN like "Nf3" or UCI like "g1f3") in a position.
 * Returns null if the move is not legal.
 */
export function validateMove(fen: string, input: string): ValidatedMove | null {
  const text = input.trim();
  if (!text) return null;
  const chess = new Chess(fen);

  // Try UCI first: e2e4, e7e8q
  const uciMatch = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/i.exec(text);
  if (uciMatch) {
    try {
      const move = chess.move({
        from: uciMatch[1].toLowerCase(),
        to: uciMatch[2].toLowerCase(),
        promotion: uciMatch[3]?.toLowerCase(),
      });
      return {
        san: move.san,
        uci: move.from + move.to + (move.promotion ?? ""),
        fenAfter: chess.fen(),
      };
    } catch {
      return null;
    }
  }

  // Fall back to SAN.
  try {
    const move = chess.move(text);
    return {
      san: move.san,
      uci: move.from + move.to + (move.promotion ?? ""),
      fenAfter: chess.fen(),
    };
  } catch {
    return null;
  }
}
