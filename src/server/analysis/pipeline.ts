import { Chess } from "chess.js";
import { prisma } from "@/lib/db";
import { classifyMove, scoreToComparable, toPerspective, toWhitePerspective, winProbLoss } from "@/lib/chess/eval";
import {
  analyzeCached,
  resultToWhiteScore,
  type EngineResult,
} from "@/server/engine/engine";
import {
  applyTimeTroubleAdjustment,
  backfillCandidates,
  computeImportance,
  detectCandidates,
  selectKeyMoments,
  type MomentCandidate,
  type PlyEval,
} from "./key-moments";
import { filterRelevantConcepts, findConcepts, uciSquares } from "@/server/explain/concepts";
import type { Color, ParsedMove } from "@/lib/types";

const QUICK_DEPTH = 10;
const DEEP_DEPTH = 16;
const MULTI_PV = 3;

/**
 * Full pipeline for one game: quick-scan every position, select key
 * moments (guaranteeing a minimum, ranked by importance), deep-analyze
 * only those, and persist. Explanations are NOT generated here — they're
 * personalized to the user's reflection, so they're generated at reflect
 * time (see the reflect API route). Idempotent — re-running clears and
 * regenerates key moments (analysis cache is reused, so this is cheap).
 */
export async function analyzeGame(
  gameId: string,
  onProgress?: (percent: number) => Promise<void> | void
): Promise<void> {
  const game = await prisma.game.findUniqueOrThrow({
    where: { id: gameId },
    include: { moves: { orderBy: { ply: "asc" } } },
  });

  await prisma.game.update({
    where: { id: gameId },
    data: { analysisStatus: "ANALYZING", analysisProgress: 0, analysisError: null },
  });

  try {
    const userColor = game.userColor as Color;
    const moves: ParsedMove[] = game.moves.map((m) => ({
      ply: m.ply,
      moveNumber: m.moveNumber,
      color: m.color as Color,
      san: m.san,
      uci: m.uci,
      fenBefore: m.fenBefore,
      fenAfter: m.fenAfter,
    }));

    // Positions to evaluate: before move 1 and after every move.
    const fens: string[] = [moves[0]?.fenBefore, ...moves.map((m) => m.fenAfter)].filter(
      Boolean
    ) as string[];

    const evalByFen = new Map<string, EngineResult>();
    for (let i = 0; i < fens.length; i++) {
      const fen = fens[i];
      if (!evalByFen.has(fen)) {
        const result = await analyzeCached(fen, { depth: QUICK_DEPTH, multiPv: 1 });
        evalByFen.set(fen, result);
      }
      if (onProgress) await onProgress(Math.round(((i + 1) / fens.length) * 40));
    }

    const plyEvals: PlyEval[] = moves.map((m) => ({
      ply: m.ply,
      before: resultToWhiteScore(evalByFen.get(m.fenBefore)!, m.fenBefore),
      after: resultToWhiteScore(evalByFen.get(m.fenAfter)!, m.fenAfter),
    }));

    const candidates = detectCandidates(plyEvals, moves, userColor);
    const grouped = selectKeyMoments(candidates);
    let finalCandidates = backfillCandidates(grouped, plyEvals, moves, userColor);

    // If the player lost this game on time, don't let low-clock moves in an
    // otherwise-fine position get flagged as tactical blunders — surface a
    // dedicated time-management moment instead. No-op for every other game.
    const userLostOnTime =
      game.terminationReason === "timeout" &&
      ((game.result === "1-0" && userColor === "black") ||
        (game.result === "0-1" && userColor === "white"));
    const clockByPly = new Map(
      game.moves.filter((m) => m.clockSeconds !== null).map((m) => [m.ply, m.clockSeconds!])
    );
    const timeTrouble = applyTimeTroubleAdjustment(
      finalCandidates,
      moves,
      userColor,
      clockByPly,
      userLostOnTime
    );
    finalCandidates = timeTrouble.candidates;
    if (timeTrouble.timeTroublePly !== null) {
      const move = moves.find((m) => m.ply === timeTrouble.timeTroublePly)!;
      const e = plyEvals.find((p) => p.ply === timeTrouble.timeTroublePly)!;
      const before = toPerspective(e.before, userColor);
      const after = toPerspective(e.after, userColor);
      const injected: MomentCandidate = {
        ply: move.ply,
        loss: winProbLoss(before, after),
        reason: `You had only ${timeTrouble.clockSecondsAtTimeTrouble}s left on the clock here — severe time pressure.`,
        beforeForMover: before,
        afterForMover: after,
        kind: "mistake",
      };
      finalCandidates = [...finalCandidates, injected].sort((a, b) => a.ply - b.ply);
    }

    // Clear any previous key moments (reflections cascade-delete with them).
    await prisma.keyMoment.deleteMany({ where: { gameId } });

    const moveIdByPly = new Map(game.moves.map((m) => [m.ply, m.id]));

    const total = finalCandidates.length || 1;
    for (let i = 0; i < finalCandidates.length; i++) {
      const cand = finalCandidates[i];
      const move = moves.find((m) => m.ply === cand.ply)!;
      const mover = move.color;

      const deep = await analyzeCached(move.fenBefore, {
        depth: DEEP_DEPTH,
        multiPv: MULTI_PV,
      });
      const top = deep.lines.find((l) => l.multipv === 1) ?? deep.lines[0];
      const second = deep.lines.find((l) => l.multipv === 2);
      const onlyLegalMove = deep.lines.length > 0 && isForced(move.fenBefore);

      const bestBeforeMover = top ? top.score : { cp: 0 };
      const bestUci = deep.bestmoveUci ?? move.uci;
      const bestSan = uciToSan(move.fenBefore, bestUci) ?? move.san;

      const afterWhite = resultToWhiteScore(evalByFen.get(move.fenAfter)!, move.fenAfter);
      const afterPlayedMover = toPerspective(afterWhite, mover);

      const classification =
        cand.ply === timeTrouble.timeTroublePly
          ? "TIME_TROUBLE"
          : classifyMove({
              bestBefore: bestBeforeMover,
              afterPlayed: afterPlayedMover,
              playedIsBest: bestUci === move.uci,
              onlyLegalMove,
            });

      // Use the deep (multi-PV) scan's eval, not the quick scan's, so the
      // stored "eval before" always matches the number the classification
      // and (later) the explanation were computed from.
      const evalBeforeWhite = toWhitePerspective(bestBeforeMover, mover);
      const pv = pvToSan(move.fenBefore, top?.pvUci ?? []);

      // Concepts are computed from the position AFTER the original move —
      // pure board state, no reflection needed, so this can happen now. Then
      // filtered to only what's actually load-bearing for THIS move — true
      // but disconnected facts (e.g. a back-rank weakness nothing in this
      // move's story touches) are dropped rather than mentioned as noise.
      const allConcepts = findConcepts(move.fenAfter, mover === "white" ? "w" : "b");
      const pvSquares = (top?.pvUci ?? []).slice(0, 3).flatMap(uciSquares);
      const conceptHighlights = filterRelevantConcepts(allConcepts, {
        moveSquares: uciSquares(move.uci),
        bestSquares: uciSquares(bestUci),
        pvSquares,
      });

      const secondBestGap =
        second && top ? Math.abs(scoreToComparable(top.score) - scoreToComparable(second.score)) : null;
      const importance = computeImportance({
        loss: cand.loss,
        classification,
        hadMateBefore: bestBeforeMover.mate !== undefined && bestBeforeMover.mate > 0,
        allowsMateAfter: afterPlayedMover.mate !== undefined && afterPlayedMover.mate < 0,
        secondBestGap,
      });

      await prisma.keyMoment.create({
        data: {
          gameId,
          moveId: moveIdByPly.get(move.ply)!,
          sortIndex: i,
          ply: cand.ply,
          fen: move.fenBefore,
          originalSan: move.san,
          originalUci: move.uci,
          bestMoveSan: bestSan,
          bestMoveUci: bestUci,
          evalBeforeCp: evalBeforeWhite.cp ?? null,
          evalBeforeMate: evalBeforeWhite.mate ?? null,
          evalAfterCp: afterWhite.cp ?? null,
          evalAfterMate: afterWhite.mate ?? null,
          selectionReason: cand.reason,
          classification,
          principalVariation: JSON.stringify(pv),
          conceptHighlights: JSON.stringify(conceptHighlights),
          importanceScore: importance.score,
          importanceTier: importance.tier,
        },
      });

      if (onProgress) {
        await onProgress(40 + Math.round(((i + 1) / total) * 60));
      }
    }

    await prisma.game.update({
      where: { id: gameId },
      data: { analysisStatus: "ANALYZED", analysisProgress: 100 },
    });
  } catch (err) {
    await prisma.game.update({
      where: { id: gameId },
      data: {
        analysisStatus: "FAILED",
        analysisError: err instanceof Error ? err.message : String(err),
      },
    });
    throw err;
  }
}

function isForced(fen: string): boolean {
  const chess = new Chess(fen);
  return chess.moves().length === 1;
}

function uciToSan(fen: string, uci: string | null): string | null {
  if (!uci) return null;
  const chess = new Chess(fen);
  try {
    const move = chess.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci.slice(4, 5) || undefined,
    });
    return move.san;
  } catch {
    return null;
  }
}

function pvToSan(fen: string, pvUci: string[]): string[] {
  const chess = new Chess(fen);
  const sans: string[] = [];
  for (const uci of pvUci.slice(0, 8)) {
    try {
      const move = chess.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci.slice(4, 5) || undefined,
      });
      sans.push(move.san);
    } catch {
      break;
    }
  }
  return sans;
}
