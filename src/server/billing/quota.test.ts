import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import {
  chargeAnalysis,
  getQuota,
  monthStartUtc,
  nextMonthStartUtc,
  formatResetDate,
  refundAnalysis,
  usedThisMonth,
  QuotaExceededError,
  GameNotFoundError,
  type QuotaUser,
} from "./quota";
import { seedDemoGame } from "@/server/demo/seed-demo-game";

/**
 * The allowance is the paywall. Two properties matter more than the rest:
 * that a month boundary is where we say it is, and that N simultaneous
 * claims against a limit of M hand out exactly min(N, M) slots — because the
 * dashboard's "Analyze all" button fires every request at once, and a limit
 * that only holds when requests arrive one at a time isn't a limit.
 */

let counter = 0;
async function freshUser(status: string | null = null): Promise<QuotaUser> {
  counter += 1;
  const user = await prisma.user.create({
    data: { name: `quota-${Date.now()}-${counter}`, subscriptionStatus: status },
  });
  return { id: user.id, subscriptionStatus: user.subscriptionStatus };
}

async function makeGame(userId: string, n: number): Promise<string> {
  const game = await prisma.game.create({
    data: {
      userId,
      platform: "manual",
      externalId: `quota-${Date.now()}-${counter}-${n}`,
      pgn: "1. e4 e5",
      whitePlayer: "W",
      blackPlayer: "B",
      userColor: "white",
      result: "1-0",
    },
  });
  return game.id;
}

describe("month boundaries", () => {
  it("starts the period at midnight UTC on the 1st", () => {
    expect(monthStartUtc(new Date("2026-08-18T23:45:00Z")).toISOString()).toBe(
      "2026-08-01T00:00:00.000Z"
    );
  });

  it("treats the 1st itself as already inside the new period", () => {
    expect(monthStartUtc(new Date("2026-09-01T00:00:00Z")).toISOString()).toBe(
      "2026-09-01T00:00:00.000Z"
    );
  });

  it("rolls December into January of the next year", () => {
    expect(nextMonthStartUtc(new Date("2026-12-14T10:00:00Z")).toISOString()).toBe(
      "2027-01-01T00:00:00.000Z"
    );
  });

  it("handles a leap-year February", () => {
    expect(nextMonthStartUtc(new Date("2028-02-29T12:00:00Z")).toISOString()).toBe(
      "2028-03-01T00:00:00.000Z"
    );
  });

  it("formats the reset date in UTC, not the machine's timezone", () => {
    // 1 September UTC must not render as 31 August for anyone west of UTC.
    expect(formatResetDate(new Date("2026-09-01T00:00:00Z"))).toBe("1 September");
  });
});

describe("getQuota", () => {
  it("gives an unsubscribed account the free allowance", async () => {
    const user = await freshUser(null);
    const quota = await getQuota(user);
    expect(quota.plan).toBe("free");
    expect(quota.limit).toBe(5);
    expect(quota.used).toBe(0);
    expect(quota.remaining).toBe(5);
  });

  it("gives an active subscriber the pro allowance", async () => {
    const user = await freshUser("active");
    const quota = await getQuota(user);
    expect(quota.plan).toBe("pro");
    expect(quota.limit).toBe(30);
  });

  it("keeps the pro allowance while a payment is being retried", async () => {
    const user = await freshUser("past_due");
    expect((await getQuota(user)).limit).toBe(30);
  });

  it("drops a canceled subscriber back to free", async () => {
    const user = await freshUser("canceled");
    expect((await getQuota(user)).limit).toBe(5);
  });

  it("does not count the seeded demo game", async () => {
    const user = await freshUser(null);
    const seeded = await seedDemoGame(user.id);
    expect(seeded).not.toBeNull();
    // The demo game is inserted pre-analyzed and never passes through the
    // analyze route, so it must never have consumed anything.
    expect(await usedThisMonth(user.id)).toBe(0);
    expect((await getQuota(user)).remaining).toBe(5);
  });

  it("counts only this user's charges", async () => {
    const mine = await freshUser(null);
    const theirs = await freshUser(null);
    await chargeAnalysis(theirs, await makeGame(theirs.id, 1));
    expect(await usedThisMonth(mine.id)).toBe(0);
  });

  it("counts only charges inside the current month", async () => {
    const user = await freshUser(null);
    const gameId = await makeGame(user.id, 1);
    // Charged last month: outside the window, so it doesn't count now.
    await prisma.game.update({
      where: { id: gameId },
      data: { analysisChargedAt: new Date("2026-07-15T00:00:00Z") },
    });
    expect(await usedThisMonth(user.id, new Date("2026-08-18T00:00:00Z"))).toBe(0);
    expect(await usedThisMonth(user.id, new Date("2026-07-20T00:00:00Z"))).toBe(1);
  });
});

describe("chargeAnalysis", () => {
  it("consumes one slot per game and then blocks", async () => {
    const user = await freshUser(null);
    for (let i = 0; i < 5; i++) {
      const quota = await chargeAnalysis(user, await makeGame(user.id, i));
      expect(quota.used).toBe(i + 1);
    }
    const sixth = await makeGame(user.id, 99);
    await expect(chargeAnalysis(user, sixth)).rejects.toBeInstanceOf(QuotaExceededError);
    // A blocked game must not be left marked as charged.
    const row = await prisma.game.findUniqueOrThrow({ where: { id: sixth } });
    expect(row.analysisChargedAt).toBeNull();
  });

  it("names the limit and the reset date in the error", async () => {
    const user = await freshUser(null);
    for (let i = 0; i < 5; i++) await chargeAnalysis(user, await makeGame(user.id, i));
    await expect(chargeAnalysis(user, await makeGame(user.id, 99))).rejects.toThrow(
      /all 5 games included in your Free plan/
    );
  });

  it("is free to re-analyze a game already paid for", async () => {
    const user = await freshUser(null);
    const gameId = await makeGame(user.id, 1);
    const first = await chargeAnalysis(user, gameId);
    const chargedAt = (await prisma.game.findUniqueOrThrow({ where: { id: gameId } }))
      .analysisChargedAt;

    const second = await chargeAnalysis(user, gameId);
    expect(second.used).toBe(first.used);
    // The original timestamp survives — it wasn't re-stamped.
    expect(
      (await prisma.game.findUniqueOrThrow({ where: { id: gameId } })).analysisChargedAt
    ).toEqual(chargedAt);
  });

  it("still allows re-analysis when the allowance is spent", async () => {
    const user = await freshUser(null);
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const id = await makeGame(user.id, i);
      ids.push(id);
      await chargeAnalysis(user, id);
    }
    // Out of allowance, but this game is already paid for.
    await expect(chargeAnalysis(user, ids[0])).resolves.toBeDefined();
  });

  it("refuses a game belonging to someone else", async () => {
    const mine = await freshUser(null);
    const theirs = await freshUser(null);
    const gameId = await makeGame(theirs.id, 1);
    await expect(chargeAnalysis(mine, gameId)).rejects.toBeInstanceOf(GameNotFoundError);
    expect(await usedThisMonth(theirs.id)).toBe(0);
  });

  it("refuses a game that doesn't exist", async () => {
    const user = await freshUser(null);
    await expect(chargeAnalysis(user, "nope")).rejects.toBeInstanceOf(GameNotFoundError);
  });

  it("hands the slot back on refund", async () => {
    const user = await freshUser(null);
    const gameId = await makeGame(user.id, 1);
    await chargeAnalysis(user, gameId);
    expect(await usedThisMonth(user.id)).toBe(1);
    await refundAnalysis(gameId);
    expect(await usedThisMonth(user.id)).toBe(0);
  });

  /**
   * The one that justifies the raw UPDATE. "Analyze all" does
   * Promise.all(ids.map(...)), so this is the real access pattern, not a
   * contrived race. With a read-then-write every one of these would observe
   * used=0 and all ten would be granted.
   */
  it("grants exactly the limit when every request arrives at once", async () => {
    const user = await freshUser(null);
    const ids = await Promise.all(Array.from({ length: 10 }, (_, i) => makeGame(user.id, i)));

    const outcomes = await Promise.all(
      ids.map((id) =>
        chargeAnalysis(user, id).then(
          () => "granted" as const,
          (err) => (err instanceof QuotaExceededError ? ("blocked" as const) : Promise.reject(err))
        )
      )
    );

    expect(outcomes.filter((o) => o === "granted")).toHaveLength(5);
    expect(outcomes.filter((o) => o === "blocked")).toHaveLength(5);
    expect(await usedThisMonth(user.id)).toBe(5);
  });
});
