import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/server/auth";
import { analyzeGame } from "@/server/analysis/pipeline";
import {
  chargeAnalysis,
  refundAnalysis,
  toQuotaView,
  GameNotFoundError,
  QuotaExceededError,
} from "@/server/billing/quota";

/** Kick off (or report status of) engine analysis for a game. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { id } = await params;
  const game = await prisma.game.findUnique({ where: { id } });
  if (!game || game.userId !== user.id) {
    return NextResponse.json({ error: "Game not found." }, { status: 404 });
  }

  if (game.analysisStatus === "ANALYZING") {
    return NextResponse.json({ status: "already_running" });
  }

  // Claim a slot from this month's allowance BEFORE dispatching. Analysis is
  // fire-and-forget, so there is no later moment at which this could be
  // charged, and "Analyze all" sends every request at once — chargeAnalysis
  // is written to be safe under exactly that (see its comment).
  let quota;
  try {
    quota = await chargeAnalysis(user, id);
  } catch (err) {
    if (err instanceof QuotaExceededError) {
      // toQuotaView, not the raw Quota: that one carries a Date and no
      // pre-formatted reset label, and the client reads both off this body.
      return NextResponse.json(
        { error: err.message, code: "QUOTA_EXCEEDED", quota: toQuotaView(err.quota) },
        { status: 402 }
      );
    }
    if (err instanceof GameNotFoundError) {
      return NextResponse.json({ error: "Game not found." }, { status: 404 });
    }
    throw err;
  }

  // Fire-and-forget: the engine runs in a child process, so this doesn't
  // block the Node event loop. The client polls GET for progress.
  analyzeGame(id, async (percent) => {
    await prisma.game.update({ where: { id }, data: { analysisProgress: percent } });
  }).catch(async (err) => {
    console.error(`Analysis failed for game ${id}:`, err);
    // The engine produced nothing usable, so this shouldn't cost the user a
    // game. Hand the slot back rather than billing for a crash.
    await refundAnalysis(id).catch((refundErr) => {
      console.error(`[billing] Failed to refund analysis for game ${id}:`, refundErr);
    });
  });

  return NextResponse.json({ status: "started", quota: toQuotaView(quota) });
}

/**
 * Progress poll. Deliberately NOT quota-gated: it runs on a timer while a
 * game analyzes, and charging or blocking it would break every progress bar
 * the moment someone hit their limit.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { id } = await params;
  const owned = await prisma.game.findUnique({ where: { id }, select: { userId: true } });
  if (!owned || owned.userId !== user.id) {
    return NextResponse.json({ error: "Game not found." }, { status: 404 });
  }
  const game = await prisma.game.findUniqueOrThrow({
    where: { id },
    select: { analysisStatus: true, analysisProgress: true, analysisError: true },
  });
  return NextResponse.json(game);
}
