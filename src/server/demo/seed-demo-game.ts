import { prisma } from "@/lib/db";
import { DEMO_GAME } from "./demo-game";

/**
 * Seeds the demo game into a brand-new account.
 *
 * This exists because the landing page promises "your first game comes back
 * analyzed" — without it, a new account lands on an empty dashboard and the
 * CTA is a lie. Seeding from a checked-in fixture rather than running the
 * engine keeps signup fast and works on a database with no games in it.
 *
 * Every seeded key moment stays PENDING with no Reflection attached, so the
 * reflection-first rule holds for the demo exactly as it does for a real
 * game: the user still writes down their thinking before any verdict is
 * shown. Pre-reviewing it would hand them the answers and defeat the point.
 */

export const DEMO_PLATFORM = "demo";
export const DEMO_EXTERNAL_ID = "demo-seed-v1";

/**
 * Returns the created game's id, or null if nothing was created (the account
 * already has the demo game, or seeding failed).
 *
 * Never throws: a failure here must not stop someone signing in. The account
 * is already created by the time this runs, and an empty dashboard is a much
 * better outcome than a failed login.
 */
export async function seedDemoGame(userId: string): Promise<string | null> {
  try {
    const existing = await prisma.game.findUnique({
      where: {
        userId_platform_externalId: {
          userId,
          platform: DEMO_PLATFORM,
          externalId: DEMO_EXTERNAL_ID,
        },
      },
      select: { id: true },
    });
    if (existing) return null;

    const { game, moves, keyMoments } = DEMO_GAME;

    const created = await prisma.game.create({
      data: {
        userId,
        platform: DEMO_PLATFORM,
        externalId: DEMO_EXTERNAL_ID,
        pgn: game.pgn,
        whitePlayer: game.whitePlayer,
        blackPlayer: game.blackPlayer,
        userColor: game.userColor,
        result: game.result,
        playedAt: game.playedAt ? new Date(game.playedAt) : null,
        timeControl: game.timeControl,
        opening: game.opening,
        terminationReason: game.terminationReason,
        userRating: game.userRating,
        // The fixture is the output of a completed analysis run, so the game
        // is finished the moment it's inserted — no engine work is queued.
        analysisStatus: "ANALYZED",
        analysisProgress: 100,
        moves: {
          create: moves.map((m) => ({
            ply: m.ply,
            moveNumber: m.moveNumber,
            color: m.color,
            san: m.san,
            uci: m.uci,
            fenBefore: m.fenBefore,
            fenAfter: m.fenAfter,
            clockSeconds: m.clockSeconds,
          })),
        },
      },
      include: { moves: { select: { id: true, ply: true } } },
    });

    // Key moments point at a specific GameMove row, and the fixture can only
    // reference it by ply — the ids are generated on insert.
    const moveIdByPly = new Map(created.moves.map((m) => [m.ply, m.id]));

    await prisma.keyMoment.createMany({
      data: keyMoments.map((k) => {
        const moveId = moveIdByPly.get(k.ply);
        if (!moveId) {
          throw new Error(`demo fixture key moment at ply ${k.ply} has no matching move`);
        }
        return {
          gameId: created.id,
          moveId,
          sortIndex: k.sortIndex,
          ply: k.ply,
          fen: k.fen,
          originalSan: k.originalSan,
          originalUci: k.originalUci,
          bestMoveSan: k.bestMoveSan,
          bestMoveUci: k.bestMoveUci,
          evalBeforeCp: k.evalBeforeCp,
          evalBeforeMate: k.evalBeforeMate,
          evalAfterCp: k.evalAfterCp,
          evalAfterMate: k.evalAfterMate,
          selectionReason: k.selectionReason,
          classification: k.classification,
          principalVariation: k.principalVariation,
          conceptHighlights: k.conceptHighlights,
          importanceScore: k.importanceScore,
          importanceTier: k.importanceTier,
          // Explicit rather than relying on the schema default: this is the
          // field the reflection-first gate keys off, and it must never be
          // seeded as REVIEWED.
          reviewStatus: "PENDING",
        };
      }),
    });

    return created.id;
  } catch (err) {
    console.error("[demo] Failed to seed demo game for user", userId, err);
    return null;
  }
}
