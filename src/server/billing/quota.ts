import type { User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { PLANS, planForStatus, type PlanId, type QuotaView } from "@/lib/plans";

/**
 * The monthly analysis allowance: how many games this account may analyze,
 * how many it already has, and when that resets.
 *
 * Usage is DERIVED, not counted into a column. "Games charged since the
 * start of this UTC month" is a range scan over Game.analysisChargedAt, so
 * there is no counter to drift out of step, no reset job to run on the 1st,
 * and no way for a crash between "charge" and "increment" to lose money or
 * give it away.
 */

/** The account this quota belongs to — the columns, not the whole row. */
export type QuotaUser = Pick<User, "id" | "subscriptionStatus">;

export interface Quota {
  plan: PlanId;
  planLabel: string;
  limit: number;
  used: number;
  remaining: number;
  /** Start of the next UTC month: the instant `used` returns to zero. */
  resetsAt: Date;
}

/** Midnight UTC on the 1st of the month containing `now`. */
export function monthStartUtc(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * Midnight UTC on the 1st of the following month.
 *
 * Date.UTC normalises a month index of 12 into January of the next year, so
 * December needs no special case.
 */
export function nextMonthStartUtc(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

/** "1 September" — the reset date, phrased the way a sentence would. */
export function formatResetDate(resetsAt: Date): string {
  return resetsAt.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

/** How many games this account has been charged for in the current month. */
export async function usedThisMonth(userId: string, now: Date = new Date()): Promise<number> {
  return prisma.game.count({
    where: { userId, analysisChargedAt: { gte: monthStartUtc(now) } },
  });
}

/** The full allowance snapshot, for display and for the 402 body. */
export async function getQuota(user: QuotaUser, now: Date = new Date()): Promise<Quota> {
  const plan = planForStatus(user.subscriptionStatus);
  const limit = PLANS[plan].monthlyGames;
  const used = await usedThisMonth(user.id, now);
  return {
    plan,
    planLabel: PLANS[plan].label,
    limit,
    used,
    remaining: Math.max(0, limit - used),
    resetsAt: nextMonthStartUtc(now),
  };
}

/** Thrown by chargeAnalysis when the allowance is spent. Carries the snapshot the UI renders. */
export class QuotaExceededError extends Error {
  readonly quota: Quota;

  constructor(quota: Quota) {
    super(
      `You've analyzed all ${quota.limit} games included in your ${quota.planLabel} plan this month. ` +
        `Your allowance resets on ${formatResetDate(quota.resetsAt)}.`
    );
    this.name = "QuotaExceededError";
    this.quota = quota;
  }
}

/** Thrown when the game doesn't exist or isn't this user's. */
export class GameNotFoundError extends Error {
  constructor() {
    super("Game not found.");
    this.name = "GameNotFoundError";
  }
}

/**
 * Claim one game's worth of allowance, or throw.
 *
 * The check and the write are ONE SQL statement on purpose. "Analyze all"
 * fans out a Promise.all of N parallel POSTs, so a read-then-write — even
 * two Prisma calls in a row — lets every one of them observe the same
 * pre-write count and sail past a limit that only had room for one. Folding
 * the count into the UPDATE's WHERE clause means SQLite evaluates it while
 * holding the write lock for that statement, so exactly as many succeed as
 * there was room for. This does not depend on transaction isolation levels
 * or on how Prisma sizes its connection pool, which is why it's written this
 * way rather than as an interactive $transaction.
 *
 * The same statement is also what makes re-analysis free: `analysisChargedAt
 * IS NULL` means a game that was already paid for is silently a no-op rather
 * than a second charge.
 */
export async function chargeAnalysis(
  user: QuotaUser,
  gameId: string,
  now: Date = new Date()
): Promise<Quota> {
  const plan = planForStatus(user.subscriptionStatus);
  const limit = PLANS[plan].monthlyGames;
  const periodStart = monthStartUtc(now);

  const claimed = await prisma.$executeRaw`
    UPDATE "Game"
       SET "analysisChargedAt" = ${now}
     WHERE "id" = ${gameId}
       AND "userId" = ${user.id}
       AND "analysisChargedAt" IS NULL
       AND (
             SELECT COUNT(*) FROM "Game" AS "g"
              WHERE "g"."userId" = ${user.id}
                AND "g"."analysisChargedAt" >= ${periodStart}
           ) < ${limit}
  `;

  if (claimed > 0) return getQuota(user, now);

  // Nothing was written. Three reasons, and they need different answers, so
  // read the row back to find out which. This runs only on the miss path.
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: { userId: true, analysisChargedAt: true },
  });
  if (!game || game.userId !== user.id) throw new GameNotFoundError();
  // Already paid for on an earlier run — re-analysis is free.
  if (game.analysisChargedAt) return getQuota(user, now);

  throw new QuotaExceededError(await getQuota(user, now));
}

/**
 * Hand the allowance back.
 *
 * Called when an analysis run fails: the engine did no useful work, so
 * billing for it would be charging for a crash. Deliberately narrow — it
 * only clears a charge, and only for the game named.
 */
export async function refundAnalysis(gameId: string): Promise<void> {
  await prisma.game.updateMany({
    where: { id: gameId },
    data: { analysisChargedAt: null },
  });
}

/** The wire form of a Quota — see QuotaView for why the shapes differ. */
export function toQuotaView(quota: Quota): QuotaView {
  return {
    plan: quota.plan,
    planLabel: quota.planLabel,
    limit: quota.limit,
    used: quota.used,
    remaining: quota.remaining,
    resetsAt: quota.resetsAt.toISOString(),
    resetsAtLabel: formatResetDate(quota.resetsAt),
  };
}
