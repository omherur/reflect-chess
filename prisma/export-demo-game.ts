/**
 * One-shot fixture generator: exports a real, fully-analyzed game from the
 * dev DB into src/server/demo/demo-game.ts so new accounts can be seeded
 * with it on any database. Not part of the app; kept out of src/ on purpose.
 */
import { PrismaClient } from "@prisma/client";
import { writeFileSync } from "fs";

const GAME_ID = "cms98q42u0047jphzfek172d9";
const OUT = "src/server/demo/demo-game.ts";

const prisma = new PrismaClient();

async function main() {
  const game = await prisma.game.findUniqueOrThrow({
    where: { id: GAME_ID },
    include: {
      moves: { orderBy: { ply: "asc" } },
      keyMoments: { orderBy: { sortIndex: "asc" } },
    },
  });

  const fixture = {
    game: {
      pgn: game.pgn,
      whitePlayer: game.whitePlayer,
      blackPlayer: game.blackPlayer,
      userColor: game.userColor,
      result: game.result,
      playedAt: game.playedAt ? game.playedAt.toISOString() : null,
      timeControl: game.timeControl,
      opening: game.opening,
      terminationReason: game.terminationReason,
      userRating: game.userRating,
    },
    moves: game.moves.map((m) => ({
      ply: m.ply,
      moveNumber: m.moveNumber,
      color: m.color,
      san: m.san,
      uci: m.uci,
      fenBefore: m.fenBefore,
      fenAfter: m.fenAfter,
      clockSeconds: m.clockSeconds,
    })),
    keyMoments: game.keyMoments.map((k) => ({
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
    })),
  };

  const header = `/**
 * The demo game every new account is seeded with — a real, fully analyzed
 * game, exported from a live analysis run rather than hand-written, so the
 * evaluations, best moves and concept highlights are genuine engine output.
 *
 * Generated once from the dev database; regenerate by re-running the export
 * script if the analysis pipeline's output shape changes. Deliberately a
 * checked-in fixture rather than a DB lookup: a fresh production database
 * has no games to copy from, and seeding must not depend on the engine
 * being available at signup time.
 *
 * Note there are no reflections here, and every key moment is left PENDING —
 * the whole point of the product is that the user's own reasoning comes
 * first, so a pre-reviewed demo would defeat it.
 */
export const DEMO_GAME = `;

  writeFileSync(OUT, header + JSON.stringify(fixture, null, 2) + " as const;\n");
  console.log(
    `wrote ${OUT}: ${fixture.moves.length} moves, ${fixture.keyMoments.length} key moments`
  );
  await prisma.$disconnect();
}

main();
