import fs from "fs";
import path from "path";
import { prisma } from "@/lib/db";
import { getLocalUser, createGameFromCandidate } from "@/server/games";
import { pgnContentHash } from "@/server/pgn-hash";
import { parsePgn } from "@/lib/chess/pgn";
import { analyzeGame } from "@/server/analysis/pipeline";
import { stockfish } from "@/server/engine/engine";
import type { ImportCandidate } from "@/lib/import/types";

const SAMPLE_DIR = path.join(__dirname, "sample-pgns");

const SAMPLE_GAMES: { file: string; userColor: "white" | "black" }[] = [
  { file: "tactical-blunder.pgn", userColor: "black" },
  { file: "strategic-mistake.pgn", userColor: "black" },
];

async function main() {
  console.log("Seeding ReflectChess demo data...");
  const user = await getLocalUser();
  console.log(`Local user: ${user.name} (${user.id})`);

  await prisma.chessAccount.upsert({
    where: {
      platform_username_userId: { platform: "chesscom", username: "SeedPlayer", userId: user.id },
    },
    create: { platform: "chesscom", username: "SeedPlayer", userId: user.id },
    update: {},
  });

  for (const sample of SAMPLE_GAMES) {
    const pgn = fs.readFileSync(path.join(SAMPLE_DIR, sample.file), "utf8");
    const { headers, result } = parsePgn(pgn);

    const candidate: ImportCandidate = {
      platform: "manual",
      externalId: pgnContentHash(pgn),
      pgn,
      whitePlayer: headers.White ?? "White",
      blackPlayer: headers.Black ?? "Black",
      userColor: sample.userColor,
      result: headers.Result ?? result ?? "*",
      playedAt: headers.Date ? new Date(headers.Date.replace(/\./g, "-")).toISOString() : null,
      timeControl: headers.TimeControl ?? null,
      opening: headers.Opening ?? headers.ECO ?? null,
    };

    const { gameId, duplicate } = await createGameFromCandidate(user.id, candidate);
    if (duplicate) {
      console.log(`  Skipped (already seeded): ${sample.file}`);
      continue;
    }
    console.log(`  Imported: ${sample.file} -> game ${gameId}`);

    console.log(`  Analyzing ${sample.file} with Stockfish (this can take a minute)...`);
    await analyzeGame(gameId!, (percent) => {
      process.stdout.write(`\r    progress: ${percent}%   `);
    });
    process.stdout.write("\n");
    console.log(`  Analysis complete for ${sample.file}.`);
  }

  console.log("Seed complete.");
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    // The engine child process keeps stdin open, which would otherwise
    // keep this standalone script's event loop alive indefinitely.
    stockfish.stop();
  });
