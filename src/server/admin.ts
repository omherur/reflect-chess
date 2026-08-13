import { prisma } from "@/lib/db";

/**
 * Read-only data for the /admin overview: who has signed up, and who is on
 * the waitlist. Both lists are newest-first, since "what happened recently"
 * is the question this page exists to answer.
 *
 * Callers must check isAdminUser() first — nothing in here does its own
 * access control.
 */

export interface AdminUserRow {
  id: string;
  name: string;
  /** Null for rows predating Supabase auth, which nobody can sign in as. */
  email: string | null;
  createdAt: Date;
  gameCount: number;
  /** Key moments this user has actually reflected on — the engagement signal. */
  reflectionCount: number;
  /** Linked Chess.com username, if they connected an account. */
  chessAccount: string | null;
}

export interface AdminWaitlistRow {
  id: string;
  email: string;
  source: string;
  createdAt: Date;
}

export interface AdminOverview {
  users: AdminUserRow[];
  waitlist: AdminWaitlistRow[];
  totals: {
    users: number;
    games: number;
    reflections: number;
    waitlist: number;
    /** Waitlist signups in the last 7 days, so the trend is visible. */
    waitlistLast7Days: number;
  };
}

export async function getAdminOverview(): Promise<AdminOverview> {
  const [users, waitlist, reviewedMoments, gameCount] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { games: true } },
        accounts: { select: { username: true }, take: 1 },
      },
    }),
    prisma.waitlistSignup.findMany({ orderBy: { createdAt: "desc" } }),
    // One query rather than a per-user count: reflections hang off key
    // moments, which hang off games, so there's no direct user relation to
    // count through. The tally below is cheap at this scale.
    prisma.keyMoment.findMany({
      where: { reviewStatus: "REVIEWED" },
      select: { game: { select: { userId: true } } },
    }),
    prisma.game.count(),
  ]);

  const reflectionsByUser = new Map<string, number>();
  for (const moment of reviewedMoments) {
    const userId = moment.game.userId;
    reflectionsByUser.set(userId, (reflectionsByUser.get(userId) ?? 0) + 1);
  }

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  return {
    users: users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      createdAt: u.createdAt,
      gameCount: u._count.games,
      reflectionCount: reflectionsByUser.get(u.id) ?? 0,
      chessAccount: u.accounts[0]?.username ?? null,
    })),
    waitlist: waitlist.map((w) => ({
      id: w.id,
      email: w.email,
      source: w.source,
      createdAt: w.createdAt,
    })),
    totals: {
      users: users.length,
      games: gameCount,
      reflections: reviewedMoments.length,
      waitlist: waitlist.length,
      waitlistLast7Days: waitlist.filter((w) => w.createdAt >= weekAgo).length,
    },
  };
}
