import type { Color } from "@/lib/types";

/** A game retrieved from a platform, ready to be shown for import selection. */
export interface ImportCandidate {
  platform: string;
  externalId: string;
  pgn: string;
  whitePlayer: string;
  blackPlayer: string;
  /** Which color the importing user played. */
  userColor: Color;
  result: string;
  playedAt: string | null; // ISO date
  timeControl: string | null;
  opening: string | null;
}

/**
 * A chess platform we can import games from. Implementations must be
 * self-contained so new platforms (e.g. Lichess) can be added without
 * touching core logic — register them in `adapters` below.
 */
export interface PlatformAdapter {
  platform: string;
  /** Fetch the user's most recent games, newest first. */
  fetchRecentGames(username: string, limit?: number): Promise<ImportCandidate[]>;
}

export class ImportError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
  }
}
