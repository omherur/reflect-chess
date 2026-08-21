"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import type { GameReviewData } from "@/server/review";
import type { Color, KeyMomentVerdict } from "@/lib/types";
import { formatDate, formatResult, resultBadgeVariant, platformLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { KeyMomentCard } from "./key-moment-card";
import { MomentList } from "./moment-list";
import { MoveStrip } from "./move-strip";
import { BrowseView } from "./browse-view";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

export function GameReview({
  gameId,
  initialData,
}: {
  gameId: string;
  initialData: GameReviewData;
}) {
  const router = useRouter();
  const [data, setData] = useState(initialData);
  const [starting, setStarting] = useState(false);
  // Set when the server refuses for want of allowance, so the panel can
  // explain it in place instead of the click appearing to do nothing.
  const [quotaBlock, setQuotaBlock] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function refetch() {
    const res = await fetch(`/api/games/${gameId}`);
    if (res.ok) setData(await res.json());
  }

  async function startAnalysis() {
    setStarting(true);
    setQuotaBlock(null);
    try {
      const res = await fetch(`/api/games/${gameId}/analyze`, { method: "POST" });
      // The response status has to be read: analysis is metered now, so
      // "started" is no longer the only possible answer, and flipping the
      // panel to ANALYZING regardless would show a progress bar for work
      // that was never dispatched.
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setQuotaBlock(
          res.status === 402
            ? (body?.error ?? "You've used this month's analysis allowance.")
            : (body?.error ?? "Couldn't start analysis. Try again.")
        );
        return;
      }
      setData((d) => ({ ...d, game: { ...d.game, analysisStatus: "ANALYZING", analysisProgress: 0 } }));
    } finally {
      setStarting(false);
    }
  }

  useEffect(() => {
    if (data.game.analysisStatus !== "ANALYZING") return;
    pollRef.current = setInterval(async () => {
      const res = await fetch(`/api/games/${gameId}/analyze`);
      if (!res.ok) return;
      const status = await res.json();
      if (status.analysisStatus === "ANALYZED" || status.analysisStatus === "FAILED") {
        if (pollRef.current) clearInterval(pollRef.current);
        await refetch();
        router.refresh();
      } else {
        setData((d) => ({
          ...d,
          game: { ...d.game, analysisProgress: status.analysisProgress },
        }));
      }
    }, 1200);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.game.analysisStatus, gameId]);

  const keyMomentByPly = useMemo(() => {
    const map = new Map<number, GameReviewData["keyMoments"][number]>();
    for (const km of data.keyMoments) map.set(km.ply, km);
    return map;
  }, [data.keyMoments]);
  const keyMomentPlies = useMemo(() => new Set(keyMomentByPly.keys()), [keyMomentByPly]);

  const firstPendingPly = data.keyMoments.find((km) => km.reviewStatus === "PENDING")?.ply;
  const [currentPly, setCurrentPly] = useState(firstPendingPly ?? data.moves[0]?.ply ?? 1);

  function goTo(ply: number) {
    setCurrentPly(Math.max(1, Math.min(data.moves.length, ply)));
  }

  function handleReviewed(verdict: KeyMomentVerdict) {
    const updatedKeyMoments = data.keyMoments.map((km) => (km.id === verdict.id ? verdict : km));
    setData((d) => ({ ...d, keyMoments: updatedKeyMoments }));

    // Once every key moment in the game has been reflected on, take the
    // player to the full-game summary instead of leaving them on the last
    // reveal panel (or requiring a manual trip back to the dashboard).
    const allReviewed =
      updatedKeyMoments.length > 0 && updatedKeyMoments.every((km) => km.reviewStatus === "REVIEWED");
    if (allReviewed) {
      router.push(`/games/${gameId}/summary`);
    }
  }

  const userColor = data.game.userColor as Color;
  const reviewedCount = data.keyMoments.filter((km) => km.reviewStatus === "REVIEWED").length;
  const totalKeyMoments = data.keyMoments.length;
  const currentMove = data.moves.find((m) => m.ply === currentPly);
  const currentKeyMoment = keyMomentByPly.get(currentPly);
  // The reflection mechanic is the centerpiece: while the player is actively
  // working through a not-yet-reflected key moment, secondary chrome (the
  // full move list, the sidebar) recedes visually rather than competing for
  // attention with the board and the reflection inputs. It brightens back
  // on hover, so it's quieter, not disabled.
  const isReflecting = currentKeyMoment?.reviewStatus === "PENDING";
  const chromeClass = cn(
    "transition-opacity duration-300",
    isReflecting && "opacity-40 hover:opacity-100 focus-within:opacity-100"
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 border-b border-stone-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold">
            {data.game.whitePlayer} vs {data.game.blackPlayer}
          </h1>
          <p className="text-sm text-stone-500">
            {platformLabel(data.game.platform)} · {formatDate(data.game.playedAt)}
            {data.game.timeControl ? ` · ${data.game.timeControl}` : ""}
            {data.game.opening ? ` · ${data.game.opening}` : ""}
          </p>
        </div>
        <Badge variant={resultBadgeVariant(data.game.result, data.game.userColor)}>
          {formatResult(data.game.result, data.game.userColor)} (played {data.game.userColor})
        </Badge>
      </div>

      {data.game.analysisStatus === "PENDING" && (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
            <p className="text-stone-600">
              This game hasn&apos;t been analyzed yet. Analysis runs a Stockfish scan of every
              position, then a deeper look at the most meaningful moments.
            </p>
            <Button size="lg" onClick={startAnalysis} disabled={starting}>
              {starting ? "Starting…" : "Analyze this game"}
            </Button>
            {quotaBlock && (
              <div className="flex flex-col items-center gap-3">
                <p className="max-w-md text-sm text-destructive">{quotaBlock}</p>
                <Link href="/billing">
                  <Button variant="outline" size="sm">
                    See plans
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {data.game.analysisStatus === "ANALYZING" && (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
            <p className="text-stone-600">Analyzing with Stockfish…</p>
            <div className="w-full max-w-sm">
              <Progress value={data.game.analysisProgress} />
              <p className="mt-2 text-sm text-stone-500">{data.game.analysisProgress}%</p>
            </div>
          </CardContent>
        </Card>
      )}

      {data.game.analysisStatus === "FAILED" && (
        <div className="flex flex-col gap-4">
          <Alert variant="destructive">
            <AlertDescription>
              Analysis failed: {data.game.analysisError ?? "Unknown error."}
            </AlertDescription>
          </Alert>
          <div>
            <Button onClick={startAnalysis} disabled={starting}>
              {starting ? "Retrying…" : "Retry analysis"}
            </Button>
          </div>
        </div>
      )}

      {data.game.analysisStatus === "ANALYZED" && data.keyMoments.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-stone-600">
            No meaningful key moments were found in this game — nice and clean!
          </CardContent>
        </Card>
      )}

      {data.game.analysisStatus === "ANALYZED" && data.keyMoments.length > 0 && currentMove && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[240px_1fr]">
          <div className={cn("flex flex-col gap-4", chromeClass)}>
            <div className="rounded-lg border border-stone-200 bg-card p-3">
              <div className="mb-1.5 flex items-center justify-between text-sm">
                <span className="font-medium text-stone-700">Reflection progress</span>
                <span className="text-stone-500">
                  {reviewedCount}/{totalKeyMoments}
                </span>
              </div>
              <Progress value={totalKeyMoments === 0 ? 0 : (reviewedCount / totalKeyMoments) * 100} className="h-2" />
            </div>
            <MomentList keyMoments={data.keyMoments} currentPly={currentPly} onSelect={goTo} />
          </div>

          <div className="flex flex-col gap-4">
            <div className={cn("flex flex-col gap-4", chromeClass)}>
              <MoveStrip
                moves={data.moves}
                keyMomentPlies={keyMomentPlies}
                currentPly={currentPly}
                onSelect={goTo}
              />

              <div className="flex items-center justify-between">
                <Button variant="outline" size="sm" onClick={() => goTo(currentPly - 1)} disabled={currentPly <= 1}>
                  <ChevronLeft className="size-4" />
                  Previous
                </Button>
                <span className="text-sm text-stone-500">
                  Move {currentPly} of {data.moves.length}
                  {currentKeyMoment ? " · key moment" : ""}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => goTo(currentPly + 1)}
                  disabled={currentPly >= data.moves.length}
                >
                  Next
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>

            {currentKeyMoment ? (
              <KeyMomentCard
                key={currentKeyMoment.id}
                gameId={gameId}
                keyMoment={currentKeyMoment}
                userColor={userColor}
                onReviewed={handleReviewed}
              />
            ) : (
              <BrowseView key={currentMove.ply} move={currentMove} userColor={userColor} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
