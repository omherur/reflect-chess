import { prisma } from "@/lib/db";
import { buildGameSummaryInput } from "./build-input";
import { generateGameSummary } from "./generate";
import type { StructuredGameSummary } from "./types";

export type GameSummaryResult =
  | { status: "not_found" }
  | { status: "not_ready" }
  | { status: "ready"; summary: StructuredGameSummary };

/**
 * Single source of truth for "get this game's summary, generating and
 * caching it on first access if needed" — shared by the RSC summary page
 * and the API route so the ownership check, readiness check, and caching
 * logic can't drift apart between the two callers (see the IDOR bug fixed
 * in src/server/review.ts for exactly this kind of divergence).
 */
export async function getOrGenerateGameSummary(gameId: string, userId: string): Promise<GameSummaryResult> {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: {
      userId: true,
      summary: true,
      keyMoments: { select: { reviewStatus: true } },
    },
  });
  if (!game || game.userId !== userId) return { status: "not_found" };
  if (game.keyMoments.length === 0 || game.keyMoments.some((km) => km.reviewStatus !== "REVIEWED")) {
    return { status: "not_ready" };
  }

  if (game.summary) {
    return { status: "ready", summary: JSON.parse(game.summary) as StructuredGameSummary };
  }

  const input = await buildGameSummaryInput(gameId, userId);
  if (!input) return { status: "not_ready" };

  const summary = await generateGameSummary(input);
  await prisma.game.update({
    where: { id: gameId },
    data: { summary: JSON.stringify(summary), summaryGeneratedAt: new Date() },
  });

  return { status: "ready", summary };
}
