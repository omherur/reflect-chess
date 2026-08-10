import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/server/auth";
import { getOrGenerateGameSummary } from "@/server/summary/service";
import { GameSummaryView } from "@/components/summary/game-summary-view";

export const dynamic = "force-dynamic";

export default async function GameSummaryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const result = await getOrGenerateGameSummary(id, user.id);
  if (result.status === "not_found") notFound();
  // Not fully reviewed yet — send back to the review flow rather than
  // showing an error page; this route is only ever reached deliberately
  // once review is complete anyway (see game-review.tsx), so "not_ready"
  // here means the game changed underneath (e.g. a moment got un-reviewed)
  // or a stale link was followed.
  if (result.status === "not_ready") redirect(`/games/${id}`);

  const game = await prisma.game.findUnique({
    where: { id },
    select: {
      whitePlayer: true,
      blackPlayer: true,
      userColor: true,
      result: true,
      playedAt: true,
      opening: true,
      platform: true,
    },
  });
  if (!game) notFound();

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
      <GameSummaryView
        gameId={id}
        game={{ ...game, playedAt: game.playedAt ? game.playedAt.toISOString() : null }}
        summary={result.summary}
      />
    </div>
  );
}
