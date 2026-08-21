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
import type { RevealStage } from "@/lib/reveal-progress";
import type { GameMove, KeyMoment, Reflection } from "@prisma/client";

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

  // Everything above this point either succeeds instantly or fails with a
  // status code. Everything below takes real time — a Stockfish evaluation
  // and a generated explanation, together often more than ten seconds — so
  // the rest of the work is streamed as it happens, and the response is
  // committed to 200 from here on. Failures after this point come back as
  // an error EVENT rather than a status, since the headers are long gone.
  return streamReveal(async (announce) => {
    announce("checking");
    return finishReflection({
      announce,
      km,
      userColor,
      validated,
      thoughts,
      replaySame,
      confidence,
      tags,
      followUpQuestion,
      followUpAnswer,
      gameId,
    });
  });
}

/** What the client is told, as newline-delimited JSON, one event per line. */
type RevealEvent =
  | { type: "stage"; stage: RevealStage }
  | { type: "done"; keyMoment: unknown }
  | { type: "error"; error: string };

/**
 * Runs `work`, streaming its stage announcements to the client as they
 * happen so the reflection form can show a progress bar that reflects
 * actual server progress rather than a guessed timer.
 *
 * The stream is always closed exactly once, including on failure — an
 * unclosed stream would leave the player watching a bar that never moves
 * again, which is a worse failure than an error message.
 */
function streamReveal(
  work: (announce: (stage: RevealStage) => void) => Promise<unknown>
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: RevealEvent) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        const keyMoment = await work((stage) => send({ type: "stage", stage }));
        send({ type: "done", keyMoment });
      } catch (err) {
        console.error("[reflect] Failed while generating the verdict:", err);
        send({
          type: "error",
          error: "Something went wrong generating your verdict. Your reflection wasn't saved — try again.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      // Tells an nginx-style proxy not to buffer the response, which would
      // hold every stage event back until the whole thing finished and
      // defeat the point of streaming it.
      "X-Accel-Buffering": "no",
    },
  });
}

interface FinishArgs {
  announce: (stage: RevealStage) => void;
  km: KeyMoment & { reflection: Reflection | null; move: GameMove };
  userColor: Color;
  validated: NonNullable<ReturnType<typeof validateMove>>;
  thoughts: string;
  replaySame: boolean;
  confidence: number;
  tags: string[];
  followUpQuestion: string;
  followUpAnswer: string;
  gameId: string;
}

async function finishReflection({
  announce,
  km,
  userColor,
  validated,
  thoughts,
  replaySame,
  confidence,
  tags,
  followUpQuestion,
  followUpAnswer,
  gameId,
}: FinishArgs) {
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
  announce("explaining");
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

  announce("saving");
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
  // Still the one permitted serializer — streaming the response changed how
  // this reaches the client, not what the client is allowed to see.
  return toClientView(updated, updated.reflection);
}
