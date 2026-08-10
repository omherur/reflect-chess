import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "@/lib/db";
import { getLocalUser, createGameFromCandidate, candidatesFromPastedPgn } from "./games";
import type { ImportCandidate } from "@/lib/import/types";

const SAMPLE_PGN = `[Event "Test"]
[White "Alice"]
[Black "Bob"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1-0`;

function candidate(externalId: string): ImportCandidate {
  return {
    platform: "chesscom",
    externalId,
    pgn: SAMPLE_PGN,
    whitePlayer: "Alice",
    blackPlayer: "Bob",
    userColor: "white",
    result: "1-0",
    playedAt: null,
    timeControl: "600",
    opening: null,
  };
}

describe("duplicate-import prevention", () => {
  let userId: string;

  beforeAll(async () => {
    const user = await getLocalUser();
    userId = user.id;
  });

  it("creates a game on first import", async () => {
    const result = await createGameFromCandidate(userId, candidate("dup-test-1"));
    expect(result.duplicate).toBe(false);
    expect(result.gameId).not.toBeNull();
  });

  it("reports a duplicate on re-import of the same external id, without creating a second row", async () => {
    const before = await prisma.game.count({ where: { userId, externalId: "dup-test-1" } });
    const result = await createGameFromCandidate(userId, candidate("dup-test-1"));
    const after = await prisma.game.count({ where: { userId, externalId: "dup-test-1" } });

    expect(result.duplicate).toBe(true);
    expect(result.gameId).toBeNull();
    expect(after).toBe(before);
    expect(after).toBe(1);
  });

  it("allows the same PGN under a different external id (different platform game)", async () => {
    const result = await createGameFromCandidate(userId, candidate("dup-test-2"));
    expect(result.duplicate).toBe(false);
  });
});

describe("candidatesFromPastedPgn", () => {
  it("auto-detects the user's color from a matching username", () => {
    const [c] = candidatesFromPastedPgn(SAMPLE_PGN, "white", "bob");
    expect(c.userColor).toBe("black");
  });

  it("falls back to the provided color when no username match", () => {
    const [c] = candidatesFromPastedPgn(SAMPLE_PGN, "black");
    expect(c.userColor).toBe("black");
  });

  it("produces a stable external id so re-pasting the same game dedupes", () => {
    const [a] = candidatesFromPastedPgn(SAMPLE_PGN, "white");
    const [b] = candidatesFromPastedPgn(SAMPLE_PGN, "white");
    expect(a.externalId).toBe(b.externalId);
  });
});
