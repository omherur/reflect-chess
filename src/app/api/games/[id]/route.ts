import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { getGameReviewData } from "@/server/review";

/** Full game data for the review page: metadata, move list, and gated key moments. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { id } = await params;
  const data = await getGameReviewData(id, user.id);
  if (!data) return NextResponse.json({ error: "Game not found." }, { status: 404 });
  return NextResponse.json(data);
}
