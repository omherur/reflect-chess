import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { getPerformanceData } from "./rating";

let gameCounter = 0;
let momentCounter = 0;

async function makeUser(name: string) {
  return prisma.user.create({ data: { name } });
}

async function makeGame(userId: string, opts: { userRating?: number | null; playedAt?: Date } = {}) {
  gameCounter++;
  return prisma.game.create({
    data: {
      userId,
      platform: "manual",
      externalId: `rating-test-${gameCounter}`,
      pgn: "1. e4 e5 *",
      whitePlayer: "Alice",
      blackPlayer: "Bob",
      userColor: "white",
      result: "*",
      analysisStatus: "ANALYZED",
      userRating: opts.userRating ?? null,
      playedAt: opts.playedAt ?? null,
    },
  });
}

async function makeMove(gameId: string) {
  momentCounter++;
  return prisma.gameMove.create({
    data: {
      gameId,
      ply: momentCounter,
      moveNumber: 1,
      color: "white",
      san: "e4",
      uci: "e2e4",
      fenBefore: "startpos",
      fenAfter: "afterpos",
    },
  });
}

async function makeKeyMoment(
  gameId: string,
  moveId: string,
  opts: { evalBeforeCp: number; evalAfterCp: number; classification: string }
) {
  momentCounter++;
  return prisma.keyMoment.create({
    data: {
      gameId,
      moveId,
      sortIndex: momentCounter,
      ply: momentCounter,
      fen: "startpos",
      originalSan: "e4",
      originalUci: "e2e4",
      bestMoveSan: "e4",
      bestMoveUci: "e2e4",
      evalBeforeCp: opts.evalBeforeCp,
      evalAfterCp: opts.evalAfterCp,
      selectionReason: "test",
      classification: opts.classification,
      principalVariation: "[]",
    },
  });
}

describe("getPerformanceData", () => {
  it("returns nulls for a brand new user with no games", async () => {
    const user = await makeUser(`rating-empty-${Date.now()}`);
    const data = await getPerformanceData(user.id);
    expect(data.actualRating).toBeNull();
    expect(data.moveQuality).toBeNull();
    expect(data.reflectionQuality).toBeNull();
  });

  it("computes move-quality rating from average centipawn loss, excluding FORCED and TIME_TROUBLE", async () => {
    const user = await makeUser(`rating-move-${Date.now()}`);
    const game = await makeGame(user.id);
    const m1 = await makeMove(game.id);
    const m2 = await makeMove(game.id);
    const m3 = await makeMove(game.id);
    const m4 = await makeMove(game.id);

    // loss 0 (best move played)
    await makeKeyMoment(game.id, m1.id, { evalBeforeCp: 100, evalAfterCp: 100, classification: "BEST" });
    // loss 200 (blunder)
    await makeKeyMoment(game.id, m2.id, { evalBeforeCp: 100, evalAfterCp: -100, classification: "BLUNDER" });
    // excluded despite a huge loss
    await makeKeyMoment(game.id, m3.id, { evalBeforeCp: 500, evalAfterCp: -500, classification: "FORCED" });
    await makeKeyMoment(game.id, m4.id, {
      evalBeforeCp: 500,
      evalAfterCp: -500,
      classification: "TIME_TROUBLE",
    });

    const data = await getPerformanceData(user.id);
    expect(data.moveQuality).not.toBeNull();
    expect(data.moveQuality!.sampleSize).toBe(2);
    // average loss = (0 + 200) / 2 = 100 -> rating = 2400 - 5*100 = 1900
    expect(data.moveQuality!.predictedRating).toBe(1900);
    expect(data.moveQuality!.milestone).toEqual({
      rating: 1900,
      previousMilestone: 1900,
      nextMilestone: 2000,
      progressPercent: 0,
    });
  });

  it("caps a single catastrophic (e.g. mate-ending) move's loss so it doesn't dominate the average", async () => {
    const user = await makeUser(`rating-mate-${Date.now()}`);
    const game = await makeGame(user.id);
    const m1 = await makeMove(game.id);
    const m2 = await makeMove(game.id);

    // loss 0 (best move played)
    await makeKeyMoment(game.id, m1.id, { evalBeforeCp: 100, evalAfterCp: 100, classification: "BEST" });
    // a blunder into getting mated: evalAfterMate uses the ±100,000 mate
    // sentinel internally, which must be capped rather than averaged raw.
    await prisma.keyMoment.create({
      data: {
        gameId: game.id,
        moveId: m2.id,
        sortIndex: 999,
        ply: 999,
        fen: "startpos",
        originalSan: "e4",
        originalUci: "e2e4",
        bestMoveSan: "e4",
        bestMoveUci: "e2e4",
        evalBeforeCp: 168,
        evalAfterMate: -2,
        selectionReason: "test",
        classification: "BLUNDER",
        principalVariation: "[]",
      },
    });

    const data = await getPerformanceData(user.id);
    // average loss = (0 + 400) / 2 = 200 -> rating = 2400 - 5*200 = 1400
    expect(data.moveQuality!.predictedRating).toBe(1400);
  });

  it("computes reflection-quality rating from replay verdicts and original classification", async () => {
    const user = await makeUser(`rating-reflect-${Date.now()}`);
    const game = await makeGame(user.id);

    const cases: { classification: string; verdict: string }[] = [
      { classification: "BLUNDER", verdict: "SAME_AS_BEST" }, // 100
      { classification: "MISTAKE", verdict: "WORSE" }, // 10
      { classification: "GOOD", verdict: "SAME_AS_ORIGINAL" }, // 90 (original was fine)
      { classification: "BLUNDER", verdict: "SAME_AS_ORIGINAL" }, // 20 (repeated a mistake)
    ];

    for (const c of cases) {
      const move = await makeMove(game.id);
      const km = await makeKeyMoment(game.id, move.id, {
        evalBeforeCp: 0,
        evalAfterCp: 0,
        classification: c.classification,
      });
      await prisma.reflection.create({
        data: {
          keyMomentId: km.id,
          thoughts: "test thoughts",
          replayMoveSan: "e4",
          replayMoveUci: "e2e4",
          replayVerdict: c.verdict,
        },
      });
    }

    const data = await getPerformanceData(user.id);
    expect(data.reflectionQuality).not.toBeNull();
    expect(data.reflectionQuality!.sampleSize).toBe(4);
    // average score = (100 + 10 + 90 + 20) / 4 = 55 -> rating = 400 + 0.55*2500 = 1775
    expect(data.reflectionQuality!.averageQualityScore).toBe(55);
    expect(data.reflectionQuality!.predictedRating).toBe(1775);
    expect(data.reflectionQuality!.milestone).toEqual({
      rating: 1775,
      previousMilestone: 1700,
      nextMilestone: 1800,
      progressPercent: 75,
    });
  });

  it("uses the most recently played game's rating as the actual rating", async () => {
    const user = await makeUser(`rating-actual-${Date.now()}`);
    await makeGame(user.id, { userRating: 1500, playedAt: new Date("2026-01-01") });
    await makeGame(user.id, { userRating: 1600, playedAt: new Date("2026-06-01") });

    const data = await getPerformanceData(user.id);
    expect(data.actualRating).toBe(1600);
  });
});
