import { notFound, redirect } from "next/navigation";
import { getGameReviewData } from "@/server/review";
import { getCurrentUser } from "@/server/auth";
import { GameReview } from "@/components/review/game-review";

export const dynamic = "force-dynamic";

export default async function GameReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const data = await getGameReviewData(id, user.id);
  if (!data) notFound();

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
      <GameReview gameId={id} initialData={data} />
    </div>
  );
}
