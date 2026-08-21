import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";

/**
 * The paywall as the browser actually meets it.
 *
 * The quota logic has its own tests; what this pins is the wiring — that a
 * spent allowance comes back as a 402 with a body the client can act on, and
 * that being refused doesn't start the engine anyway. Both call sites in the
 * UI branch on exactly these fields.
 */

const getCurrentUser = vi.fn();
const analyzeGame = vi.fn(() => Promise.resolve());

vi.mock("@/server/auth", () => ({ getCurrentUser: () => getCurrentUser() }));
vi.mock("@/server/analysis/pipeline", () => ({
  analyzeGame: (...args: unknown[]) => analyzeGame(...(args as [])),
}));

const { POST } = await import("./route");

let n = 0;
async function freshUser(subscriptionStatus: string | null = null) {
  return prisma.user.create({
    data: { name: `route-quota-${Date.now()}-${++n}`, subscriptionStatus },
  });
}

async function makeGame(userId: string) {
  return prisma.game.create({
    data: {
      userId,
      platform: "manual",
      externalId: `route-${Date.now()}-${++n}`,
      pgn: "1. e4 e5",
      whitePlayer: "W",
      blackPlayer: "B",
      userColor: "white",
      result: "1-0",
    },
  });
}

function call(gameId: string) {
  return POST({} as never, { params: Promise.resolve({ id: gameId }) });
}

beforeEach(() => {
  getCurrentUser.mockReset();
  analyzeGame.mockClear();
  analyzeGame.mockImplementation(() => Promise.resolve());
});

describe("POST /api/games/[id]/analyze", () => {
  it("starts analysis and reports the allowance left", async () => {
    const user = await freshUser();
    getCurrentUser.mockResolvedValue(user);
    const game = await makeGame(user.id);

    const res = await call(game.id);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("started");
    expect(body.quota).toMatchObject({ plan: "free", limit: 5, used: 1, remaining: 4 });
    expect(analyzeGame).toHaveBeenCalledOnce();
  });

  it("refuses with 402 once the free allowance is spent, and does not run the engine", async () => {
    const user = await freshUser();
    getCurrentUser.mockResolvedValue(user);
    for (let i = 0; i < 5; i++) await call((await makeGame(user.id)).id);
    analyzeGame.mockClear();

    const blocked = await makeGame(user.id);
    const res = await call(blocked.id);
    const body = await res.json();

    expect(res.status).toBe(402);
    expect(body.code).toBe("QUOTA_EXCEEDED");
    expect(body.error).toMatch(/all 5 games included in your Free plan/);
    // The client renders these directly.
    expect(body.quota).toMatchObject({ plan: "free", limit: 5, used: 5, remaining: 0 });
    expect(body.quota.resetsAtLabel).toBeTruthy();
    // Refused means refused: no engine work, and no charge recorded.
    expect(analyzeGame).not.toHaveBeenCalled();
    expect(
      (await prisma.game.findUniqueOrThrow({ where: { id: blocked.id } })).analysisChargedAt
    ).toBeNull();
  });

  it("lets a subscriber past the free limit", async () => {
    const user = await freshUser("active");
    getCurrentUser.mockResolvedValue(user);
    for (let i = 0; i < 6; i++) {
      const res = await call((await makeGame(user.id)).id);
      expect(res.status).toBe(200);
    }
    const quota = (await (await call((await makeGame(user.id)).id)).json()).quota;
    expect(quota).toMatchObject({ plan: "pro", limit: 30, used: 7 });
  });

  it("refunds the slot when the analysis run fails", async () => {
    const user = await freshUser();
    getCurrentUser.mockResolvedValue(user);
    analyzeGame.mockImplementation(() => Promise.reject(new Error("engine died")));

    const game = await makeGame(user.id);
    expect((await call(game.id)).status).toBe(200);

    // The dispatch is fire-and-forget; let its rejection handler settle.
    await new Promise((r) => setTimeout(r, 50));
    expect(
      (await prisma.game.findUniqueOrThrow({ where: { id: game.id } })).analysisChargedAt
    ).toBeNull();
  });

  it("does not charge for re-analyzing a game already paid for", async () => {
    const user = await freshUser();
    getCurrentUser.mockResolvedValue(user);
    const game = await makeGame(user.id);

    await call(game.id);
    const second = await (await call(game.id)).json();
    expect(second.quota.used).toBe(1);
  });

  it("404s someone else's game without touching their allowance", async () => {
    const owner = await freshUser();
    const intruder = await freshUser();
    const game = await makeGame(owner.id);

    getCurrentUser.mockResolvedValue(intruder);
    expect((await call(game.id)).status).toBe(404);
    expect(analyzeGame).not.toHaveBeenCalled();
  });

  it("401s when signed out", async () => {
    getCurrentUser.mockResolvedValue(null);
    expect((await call("anything")).status).toBe(401);
  });
});
