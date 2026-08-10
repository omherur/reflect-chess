import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/server/auth";
import { validateMove } from "@/lib/chess/pgn";
import { compareReplay, toPerspective } from "@/lib/chess/eval";
import { analyzeCached, resultToWhiteScore } from "@/server/engine/engine";
import { generateExplanation } from "@/server/explain/generate";
import { filterRelevantConcepts, findConcepts, pvSquaresFromSan, uciSquares } from "@/server/explain/concepts";
import { toClientView } from "@/server/keymoments";
import { isReflectionTag } from "@/lib/reflection-tags";
import type { Color, ConceptHighlight, Score } from "@/lib/types";

const REPLAY_DEPTH = 16;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; momentId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { id: gameId, momentId } = await params;

  const body = await req.json().catch(() => null);
  const thoughts = typeof body?.thoughts === "string" ? body.thoughts.trim() : "";
  const replaySame = body?.replaySame === true;
  const replayInput = typeof body?.replayMove === "string" ? body.replayMove.trim() : "";
  const confidence = Number(body?.confidence);
  const tagsInput: unknown = body?.tags;
  const followUpQuestion = typeof body?.followUpQuestion === "string" ? body.followUpQuestion.trim() : "";
  const followUpAnswer = typeof body?.followUpAnswer === "string" ? body.followUpAnswer.trim() : "";

  if (thoughts.length < 3) {
    return NextResponse.json(
      { error: "Tell us what you were thinking — a sentence or two is enough." },
      { status: 400 }
    );
  }
  if (!replaySame && !replayInput) {
    return NextResponse.json(
      { error: "Choose a replay move, or say you'd play the same move." },
      { status: 400 }
    );
  }
  if (!Number.isInteger(confidence) || confidence < 1 || confidence > 5) {
    return NextResponse.json(
      { error: "Rate how confident you were in this move, from 1 to 5." },
      { status: 400 }
    );
  }
  if (followUpQuestion && !followUpAnswer) {
    return NextResponse.json(
      { error: "Answer the follow-up question before submitting." },
      { status: 400 }
    );
  }
  const tags: string[] = Array.isArray(tagsInput)
    ? tagsInput.filter((t): t is string => typeof t === "string" && isReflectionTag(t))
    : [];

  const [game, km] = await Promise.all([
    prisma.game.findUnique({ where: { id: gameId } }),
    prisma.keyMoment.findUnique({
      where: { id: momentId },
      include: { reflection: true, move: true },
    }),
  ]);
  if (!game || game.userId !== user.id || !km || km.gameId !== gameId) {
    return NextResponse.json({ error: "Key moment not found." }, { status: 404 });
  }
  if (km.reflection) {
    return NextResponse.json({ error: "This moment has already been reviewed." }, { status: 409 });
  }

  const userColor = game.userColor as Color;
  const moveText = replaySame ? km.originalSan : replayInput;
  const validated = validateMove(km.fen, moveText);
  if (!validated) {
    return NextResponse.json(
      { error: `"${moveText}" is not a legal move in this position.` },
      { status: 400 }
    );
  }

  const evalBeforeWhite: Score =
    km.evalBeforeMate !== null ? { mate: km.evalBeforeMate } : { cp: km.evalBeforeCp ?? 0 };
  const evalAfterOriginalWhite: Score =
    km.evalAfterMate !== null ? { mate: km.evalAfterMate } : { cp: km.evalAfterCp ?? 0 };

  let replayEvalWhite = evalAfterOriginalWhite;
  if (validated.uci !== km.originalUci) {
    const result = await analyzeCached(validated.fenAfter, {
      depth: REPLAY_DEPTH,
      multiPv: 1,
    });
    replayEvalWhite = resultToWhiteScore(result, validated.fenAfter);
  }

  const evalBeforeMover = toPerspective(evalBeforeWhite, userColor);
  const evalAfterOriginalMover = toPerspective(evalAfterOriginalWhite, userColor);
  const evalAfterReplayMover = toPerspective(replayEvalWhite, userColor);

  const verdict = compareReplay({
    replayUci: validated.uci,
    originalUci: km.originalUci,
    bestUci: km.bestMoveUci,
    afterReplay: evalAfterReplayMover,
    afterOriginal: evalAfterOriginalMover,
    bestBefore: evalBeforeMover,
  });

  const conceptHighlights = JSON.parse(km.conceptHighlights) as ConceptHighlight[];
  // Grounds the replayNote concretely when the replay didn't fix things —
  // computed on the position after the REPLAY move, not the original. Same
  // relevance filter as the original concepts: only keep what's actually
  // connected to the replay move, the best move, or the immediate PV.
  const pvSquares = pvSquaresFromSan(km.fen, JSON.parse(km.principalVariation) as string[]);
  const replayConceptHighlights = filterRelevantConcepts(
    findConcepts(validated.fenAfter, userColor === "white" ? "w" : "b"),
    {
      moveSquares: uciSquares(validated.uci),
      bestSquares: uciSquares(km.bestMoveUci),
      pvSquares,
    }
  );

  // Personalized to this exact reasoning + replay move — can only be
  // generated now that both reflection questions exist. Never blocks the
  // response for long: the Claude provider has its own timeout and falls
  // back to a deterministic template on any failure.
  const explanation = await generateExplanation({
    fenBefore: km.fen,
    originalSan: km.originalSan,
    originalUci: km.originalUci,
    bestSan: km.bestMoveSan,
    bestUci: km.bestMoveUci,
    classification: km.classification as never,
    moverColor: userColor,
    evalBeforeMover,
    evalAfterMover: evalAfterOriginalMover,
    principalVariationSan: JSON.parse(km.principalVariation) as string[],
    conceptHighlights,
    userThoughts: thoughts,
    replaySan: validated.san,
    replayUci: validated.uci,
    replaySame,
    evalAfterReplayMover,
    replayVerdict: verdict,
    replayConceptHighlights,
    clockSecondsAtMove: km.move.clockSeconds,
  }, { gameId, keyMomentId: km.id });

  await prisma.$transaction([
    prisma.reflection.create({
      data: {
        keyMomentId: km.id,
        thoughts,
        replaySame,
        replayMoveSan: validated.san,
        replayMoveUci: validated.uci,
        confidence,
        tags: JSON.stringify(tags),
        followUpQuestion: followUpQuestion || null,
        followUpAnswer: followUpAnswer || null,
        replayEvalCp: replayEvalWhite.cp ?? null,
        replayEvalMate: replayEvalWhite.mate ?? null,
        replayVerdict: verdict,
        explanation: JSON.stringify(explanation),
      },
    }),
    prisma.keyMoment.update({
      where: { id: km.id },
      data: { reviewStatus: "REVIEWED" },
    }),
  ]);

  const updated = await prisma.keyMoment.findUniqueOrThrow({
    where: { id: km.id },
    include: { reflection: true },
  });
  return NextResponse.json({ keyMoment: toClientView(updated, updated.reflection) });
}
