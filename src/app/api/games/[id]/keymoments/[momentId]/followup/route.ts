import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/server/auth";
import { generateFollowUpQuestion, isThinReflection } from "@/server/explain/followup";
import type { ConceptHighlight } from "@/lib/types";

/**
 * Checks whether the player's reflection so far is thin enough to warrant
 * one adaptive follow-up question — never reveals a move, evaluation, or
 * classification, and the caller (the reflection form) only ever calls
 * this once per key moment, so it can't become a repeating loop.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; momentId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { id: gameId, momentId } = await params;

  const km = await prisma.keyMoment.findUnique({
    where: { id: momentId },
    include: { game: { select: { userId: true } } },
  });
  if (!km || km.gameId !== gameId || km.game.userId !== user.id) {
    return NextResponse.json({ error: "Key moment not found." }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const thoughts = typeof body?.thoughts === "string" ? body.thoughts : "";
  const replaySame = body?.replaySame === true;

  if (!isThinReflection(thoughts)) {
    return NextResponse.json({ needsFollowUp: false });
  }

  const conceptHighlights = JSON.parse(km.conceptHighlights) as ConceptHighlight[];
  const question = generateFollowUpQuestion(conceptHighlights, km.id, replaySame);
  return NextResponse.json({ needsFollowUp: true, question });
}
