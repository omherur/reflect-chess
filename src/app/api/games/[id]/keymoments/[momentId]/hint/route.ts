import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/server/auth";
import { generateHint } from "@/server/explain/hint";
import type { ConceptHighlight } from "@/lib/types";

/**
 * A soft, partial nudge — not a reveal. Deliberately never returns the
 * best move, evaluation, or classification; see generateHint for the
 * non-revealing hint text itself.
 */
export async function POST(
  _req: NextRequest,
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

  const conceptHighlights = JSON.parse(km.conceptHighlights) as ConceptHighlight[];
  const hint = generateHint(conceptHighlights, km.id);
  return NextResponse.json({ hint });
}
