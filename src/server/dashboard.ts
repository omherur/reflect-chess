import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/server/auth";

export interface KeyMomentThumbnail {
  fen: string;
  from: string;
  to: string;
}

export interface DashboardGame {
  id: string;
  platform: string;
  whitePlayer: string;
  blackPlayer: string;
  userColor: string;
  result: string;
  playedAt: string | null;
  timeControl: string | null;
  opening: string | null;
  analysisStatus: string;
  analysisProgress: number;
  totalKeyMoments: number;
  reviewedKeyMoments: number;
  /**
   * Board snapshots of a couple of the game's most notable positions, so a
   * game is recognizable by its position, not just names and dates. Which
   * positions get picked uses the (otherwise hidden) importance ranking
   * internally, but the thumbnail itself is just historical board state —
   * the position and the move played — same as everywhere else pre-reveal.
   * No classification, tier, or eval is exposed by showing it.
   */
  thumbnails: KeyMomentThumbnail[];
}

export interface DashboardMomentum {
  totalReflections: number;
  streakDays: number;
  nextMilestone: number;
  remainingToMilestone: number;
}

export interface DashboardData {
  userName: string;
  hasChessAccount: boolean;
  games: DashboardGame[];
  counts: {
    totalGames: number;
    awaitingReflection: number; // analyzed, with at least one PENDING key moment
    fullyReviewed: number; // analyzed, all key moments REVIEWED
  };
  momentum: DashboardMomentum;
}

const MILESTONE_STEP = 5;

function computeStreakDays(dates: Date[]): number {
  const dayStrings = new Set(dates.map((d) => d.toISOString().slice(0, 10)));
  const cursor = new Date();
  cursor.setUTCHours(0, 0, 0, 0);
  if (!dayStrings.has(cursor.toISOString().slice(0, 10))) {
    // No activity yet today — the streak is still "alive" through today,
    // so check whether it was active as of yesterday.
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  let streak = 0;
  while (dayStrings.has(cursor.toISOString().slice(0, 10))) {
    streak++;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

export async function getDashboardData(): Promise<DashboardData> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not signed in.");

  const chessAccountCount = await prisma.chessAccount.count({
    where: { userId: user.id, platform: "chesscom" },
  });

  const games = await prisma.game.findMany({
    where: { userId: user.id },
    orderBy: [{ playedAt: "desc" }, { createdAt: "desc" }],
    include: {
      keyMoments: {
        select: { reviewStatus: true, fen: true, originalUci: true, importanceScore: true, ply: true },
      },
    },
  });

  const mapped: DashboardGame[] = games.map((g) => {
    const thumbnails = [...g.keyMoments]
      .sort((a, b) => b.importanceScore - a.importanceScore || a.ply - b.ply)
      .slice(0, 2)
      .map((km) => ({
        fen: km.fen,
        from: km.originalUci.slice(0, 2),
        to: km.originalUci.slice(2, 4),
      }));

    return {
      id: g.id,
      platform: g.platform,
      whitePlayer: g.whitePlayer,
      blackPlayer: g.blackPlayer,
      userColor: g.userColor,
      result: g.result,
      playedAt: g.playedAt ? g.playedAt.toISOString() : null,
      timeControl: g.timeControl,
      opening: g.opening,
      analysisStatus: g.analysisStatus,
      analysisProgress: g.analysisProgress,
      totalKeyMoments: g.keyMoments.length,
      reviewedKeyMoments: g.keyMoments.filter((km) => km.reviewStatus === "REVIEWED").length,
      thumbnails,
    };
  });

  const awaitingReflection = mapped.filter(
    (g) => g.analysisStatus === "ANALYZED" && g.totalKeyMoments > 0 && g.reviewedKeyMoments < g.totalKeyMoments
  ).length;
  const fullyReviewed = mapped.filter(
    (g) => g.analysisStatus === "ANALYZED" && g.totalKeyMoments > 0 && g.reviewedKeyMoments === g.totalKeyMoments
  ).length;

  const reflections = await prisma.reflection.findMany({
    where: { keyMoment: { game: { userId: user.id } } },
    select: { createdAt: true },
  });
  const totalReflections = reflections.length;
  const nextMilestone = (Math.floor(totalReflections / MILESTONE_STEP) + 1) * MILESTONE_STEP;

  return {
    userName: user.name,
    hasChessAccount: chessAccountCount > 0,
    games: mapped,
    counts: { totalGames: mapped.length, awaitingReflection, fullyReviewed },
    momentum: {
      totalReflections,
      streakDays: computeStreakDays(reflections.map((r) => r.createdAt)),
      nextMilestone,
      remainingToMilestone: nextMilestone - totalReflections,
    },
  };
}
