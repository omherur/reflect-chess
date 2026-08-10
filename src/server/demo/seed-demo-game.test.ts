import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "@/lib/db";
import { seedDemoGame, DEMO_PLATFORM, DEMO_EXTERNAL_ID } from "./seed-demo-game";
import { DEMO_GAME } from "./demo-game";
import { toClientView } from "@/server/keymoments";

/**
 * The demo game is the first thing a new account ever sees, which makes it
 * the easiest place to accidentally break the one rule the product has:
 * engine verdicts must not reach the client before the user has written down
 * their own reasoning. A fixture is data, not code, so nothing else would
 * catch a `reviewStatus: "REVIEWED"` slipping into it.
 */

async function freshUser(name: string) {
  return prisma.user.create({ data: { name } });
}

describe("seedDemoGame", () => {
  let userId: string;
  let gameId: string;

  beforeAll(async () => {
    const user = await freshUser(`demo-seed-${Date.now()}`);
    userId = user.id;
    const created = await seedDemoGame(userId);
    expect(created).not.toBeNull();
    gameId = created!;
  });

  it("creates the game owned by that user, already analyzed", async () => {
    const game = await prisma.game.findUniqueOrThrow({ where: { id: gameId } });
    expect(game.userId).toBe(userId);
    expect(game.platform).toBe(DEMO_PLATFORM);
    expect(game.externalId).toBe(DEMO_EXTERNAL_ID);
    // Seeded from a finished analysis run, so no engine work should be queued.
    expect(game.analysisStatus).toBe("ANALYZED");
    expect(game.analysisProgress).toBe(100);
  });

  it("inserts every move and key moment from the fixture", async () => {
    const moves = await prisma.gameMove.count({ where: { gameId } });
    const keyMoments = await prisma.keyMoment.count({ where: { gameId } });
    expect(moves).toBe(DEMO_GAME.moves.length);
    expect(keyMoments).toBe(DEMO_GAME.keyMoments.length);
  });

  it("links each key moment to the move at its own ply", async () => {
    const keyMoments = await prisma.keyMoment.findMany({
      where: { gameId },
      include: { move: true },
    });
    expect(keyMoments.length).toBeGreaterThan(0);
    for (const km of keyMoments) {
      expect(km.move.ply).toBe(km.ply);
      expect(km.move.gameId).toBe(gameId);
      // The stored SAN must be the move actually played at that ply, or the
      // review screen would show the wrong move for the position.
      expect(km.move.san).toBe(km.originalSan);
    }
  });

  it("leaves every key moment PENDING with no reflection", async () => {
    const keyMoments = await prisma.keyMoment.findMany({
      where: { gameId },
      include: { reflection: true },
    });
    for (const km of keyMoments) {
      expect(km.reviewStatus).toBe("PENDING");
      expect(km.reflection).toBeNull();
    }
  });

  it("never leaks an engine verdict through the client gate before reflection", async () => {
    const keyMoments = await prisma.keyMoment.findMany({ where: { gameId } });
    for (const km of keyMoments) {
      const view = toClientView(km, null) as unknown as Record<string, unknown>;
      for (const leaked of [
        "classification",
        "bestMoveSan",
        "bestMoveUci",
        "evalBeforeCp",
        "evalAfterCp",
        "principalVariation",
        "conceptHighlights",
        "selectionReason",
      ]) {
        expect(view[leaked]).toBeUndefined();
      }
    }
  });

  it("is idempotent — seeding twice does not duplicate the game", async () => {
    const second = await seedDemoGame(userId);
    expect(second).toBeNull();
    const games = await prisma.game.count({ where: { userId, platform: DEMO_PLATFORM } });
    expect(games).toBe(1);
  });

  it("gives a second account its own copy", async () => {
    const other = await freshUser(`demo-seed-other-${Date.now()}`);
    const otherGameId = await seedDemoGame(other.id);
    expect(otherGameId).not.toBeNull();
    expect(otherGameId).not.toBe(gameId);

    const otherGame = await prisma.game.findUniqueOrThrow({ where: { id: otherGameId! } });
    expect(otherGame.userId).toBe(other.id);
    // Same external id on a different account must not collide — the unique
    // constraint is per user.
    expect(otherGame.externalId).toBe(DEMO_EXTERNAL_ID);
  });
});
