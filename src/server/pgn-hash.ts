import { createHash } from "crypto";
import { parsePgn } from "@/lib/chess/pgn";

/**
 * Stable content hash used as the external id for manually pasted games,
 * so pasting the same game twice doesn't create a duplicate. Normalizes
 * on the move text only (headers like annotator/date typos shouldn't
 * defeat dedupe). Server-only (uses Node's crypto) — do not import from
 * client components.
 */
export function pgnContentHash(pgn: string): string {
  const { moves } = parsePgn(pgn);
  const normalized = moves.map((m) => m.uci).join(" ");
  return createHash("sha256").update(normalized).digest("hex").slice(0, 32);
}
