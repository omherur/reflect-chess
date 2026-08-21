"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ClearAllGamesButton } from "@/components/dashboard/clear-all-games-button";
import { MiniBoard } from "@/components/dashboard/mini-board";
import { UpgradePrompt } from "@/components/billing/upgrade-prompt";
import { Input } from "@/components/ui/input";
import {
  formatDate,
  formatResult,
  resultBadgeVariant,
  platformLabel,
} from "@/lib/format";
import type { DashboardData, DashboardGame } from "@/server/dashboard";
import { Flame, Globe, Timer, Sparkles, PlayCircle, Link2, RefreshCw, MessageCircleHeart } from "lucide-react";

type StatusFilter = "all" | "not_analyzed" | "awaiting" | "reviewed";
type SortKey = "date" | "opponent" | "result";

function gameStatus(g: DashboardGame): StatusFilter | "analyzing" | "failed" {
  if (g.analysisStatus === "PENDING") return "not_analyzed";
  if (g.analysisStatus === "ANALYZING") return "analyzing";
  if (g.analysisStatus === "FAILED") return "failed";
  if (g.totalKeyMoments > 0 && g.reviewedKeyMoments < g.totalKeyMoments) return "awaiting";
  if (g.totalKeyMoments > 0 && g.reviewedKeyMoments === g.totalKeyMoments) return "reviewed";
  return "all";
}

function opponentName(g: DashboardGame): string {
  return g.userColor === "white" ? g.blackPlayer : g.whitePlayer;
}

export function DashboardView({ initialData }: { initialData: DashboardData }) {
  const router = useRouter();
  const [data, setData] = useState(initialData);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortKey>("date");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [starting, setStarting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { games, counts, momentum, quota } = data;

  const visibleGames = useMemo(() => {
    let list = games;
    if (filter !== "all") {
      list = list.filter((g) => gameStatus(g) === filter);
    }
    const sorted = [...list];
    if (sort === "date") {
      sorted.sort((a, b) => (b.playedAt ?? "").localeCompare(a.playedAt ?? ""));
    } else if (sort === "opponent") {
      sorted.sort((a, b) => opponentName(a).localeCompare(opponentName(b)));
    } else if (sort === "result") {
      const rank: Record<string, number> = { Win: 0, Draw: 1, Loss: 2, Ongoing: 3 };
      sorted.sort(
        (a, b) =>
          (rank[formatResult(a.result, a.userColor)] ?? 4) -
          (rank[formatResult(b.result, b.userColor)] ?? 4)
      );
    }
    return sorted;
  }, [games, filter, sort]);

  const analyzableIds = useMemo(
    () => games.filter((g) => g.analysisStatus === "PENDING" || g.analysisStatus === "FAILED").map((g) => g.id),
    [games]
  );

  async function refetch() {
    const res = await fetch("/api/dashboard");
    if (res.ok) setData(await res.json());
  }

  /**
   * Start analysis for a batch.
   *
   * Every response is inspected, and only the games that actually started
   * are flipped to ANALYZING. This used to fire the requests and discard the
   * results, which was harmless while analysis was unlimited — but with a
   * monthly allowance the server can refuse (402), and optimistically
   * showing every card as "analyzing" would make the paywall invisible and
   * leave the UI asserting something untrue.
   *
   * The requests deliberately still go out together: the server hands out
   * slots atomically, so it decides how many of a too-large batch succeed,
   * rather than the client guessing.
   */
  async function startAnalysis(ids: string[]) {
    if (ids.length === 0) return;
    setStarting(true);
    try {
      const outcomes = await Promise.all(
        ids.map(async (id) => {
          try {
            const res = await fetch(`/api/games/${id}/analyze`, { method: "POST" });
            const body = await res.json().catch(() => null);
            return { id, ok: res.ok, status: res.status, body };
          } catch {
            return { id, ok: false, status: 0, body: null };
          }
        })
      );

      const started = outcomes.filter((o) => o.ok).map((o) => o.id);
      const blocked = outcomes.filter((o) => o.status === 402);
      const failed = outcomes.filter((o) => !o.ok && o.status !== 402);

      if (started.length > 0) {
        setData((d) => ({
          ...d,
          games: d.games.map((g) =>
            started.includes(g.id) ? { ...g, analysisStatus: "ANALYZING", analysisProgress: 0 } : g
          ),
        }));
        toast.success(`Started analysis for ${started.length} game${started.length === 1 ? "" : "s"}.`);
      }

      if (blocked.length > 0) {
        // Every 402 carries the same allowance snapshot, so one message covers
        // the batch. Reuse the server's own wording rather than rephrasing it.
        const quota = blocked[0].body?.quota as DashboardData["quota"] | undefined;
        if (quota) setData((d) => ({ ...d, quota }));
        toast.error(
          blocked[0].body?.error ?? "You've used this month's analysis allowance.",
          {
            description:
              started.length > 0
                ? `${blocked.length} game${blocked.length === 1 ? "" : "s"} couldn't be started.`
                : undefined,
            action: { label: "Upgrade", onClick: () => router.push("/billing") },
          }
        );
      }

      if (failed.length > 0) {
        toast.error(
          `Couldn't start ${failed.length} game${failed.length === 1 ? "" : "s"}. Try again.`
        );
      }

      // Pick up the new usage count (and anything else that moved).
      if (started.length > 0) void refetch();
      setSelected(new Set());
    } finally {
      setStarting(false);
    }
  }

  const analyzingIds = games.filter((g) => g.analysisStatus === "ANALYZING").map((g) => g.id);
  const analyzingKey = analyzingIds.join(",");

  useEffect(() => {
    if (analyzingIds.length === 0) return;
    pollRef.current = setInterval(async () => {
      const results = await Promise.all(
        analyzingIds.map(async (id) => {
          const res = await fetch(`/api/games/${id}/analyze`);
          if (!res.ok) return null;
          const status = await res.json();
          return { id, ...status };
        })
      );
      const justFinished = results.some((r) => r && r.analysisStatus !== "ANALYZING");
      if (justFinished) {
        // At least one game in this batch just finished analyzing. Refresh
        // full per-game data (key moment counts, thumbnails, review status)
        // right away so THAT game becomes reviewable immediately, instead of
        // only merging analysisProgress/analysisStatus locally and waiting
        // for every game in the batch to finish before anything else
        // updates — that gap was why a finished game kept showing "no key
        // moments to review" until the whole batch was done. Games still
        // analyzing simply keep polling below; the effect naturally stops
        // once analyzingIds is empty after this refetch.
        await refetch();
        router.refresh();
      } else {
        setData((d) => ({
          ...d,
          games: d.games.map((g) => {
            const r = results.find((x) => x?.id === g.id);
            return r ? { ...g, analysisProgress: r.analysisProgress, analysisStatus: r.analysisStatus } : g;
          }),
        }));
      }
    }, 1200);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analyzingKey]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const reviewProgressPct = counts.totalGames === 0 ? 0 : Math.round((counts.fullyReviewed / counts.totalGames) * 100);
  const [syncing, setSyncing] = useState(false);

  async function syncNow() {
    setSyncing(true);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? "Sync failed.");
      if (result.imported > 0) {
        toast.success(`Synced ${result.imported} new game${result.imported === 1 ? "" : "s"} from Chess.com.`);
        await refetch();
        router.refresh();
      } else {
        toast.info("No new games since your last sync.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sync failed.");
    } finally {
      setSyncing(false);
    }
  }

  // Auto-sync once per mount if a Chess.com account is already linked — no
  // need to re-search or re-import by hand on every visit.
  const syncedRef = useRef(false);
  useEffect(() => {
    if (!data.hasChessAccount || syncedRef.current) return;
    syncedRef.current = true;
    (async () => {
      try {
        const res = await fetch("/api/sync", { method: "POST" });
        if (!res.ok) return;
        const result = await res.json();
        if (result.imported > 0) {
          toast.success(`Synced ${result.imported} new game${result.imported === 1 ? "" : "s"} from Chess.com.`);
          await refetch();
          router.refresh();
        }
      } catch {
        // Silent — auto-sync is a nice-to-have, not worth alarming the user over.
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.hasChessAccount]);

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Your games</h1>
          <p className="mt-1 text-base text-stone-600">
            Capture what you were thinking before the engine tells you what was true.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {data.hasChessAccount && (
            <Button variant="outline" onClick={syncNow} disabled={syncing} className="gap-1.5">
              <RefreshCw className={`size-4 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Syncing…" : "Sync now"}
            </Button>
          )}
          <ClearAllGamesButton disabled={counts.totalGames === 0} />
          <Link href="/import">
            <Button size="lg">Import game</Button>
          </Link>
        </div>
      </div>

      {!data.hasChessAccount && (
        <ConnectAccountCard
          onConnected={() => {
            setData((d) => ({ ...d, hasChessAccount: true }));
            syncedRef.current = false; // let the auto-sync effect run now that an account exists
          }}
        />
      )}

      {momentum.totalReflections > 0 && (
        <Card className="mb-6 border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 duration-500 animate-in fade-in-0 slide-in-from-top-2">
          <CardContent className="flex flex-wrap items-center gap-x-8 gap-y-3 py-4">
            {/* The reflection mechanic is the core habit this app reinforces — a
                persistent count, distinct from the games-imported/reviewed
                stats below, keeps that front and center. */}
            <div className="flex items-center gap-2">
              <MessageCircleHeart className="size-5 text-primary" />
              <span className="text-base font-semibold text-stone-800">
                {momentum.totalReflections} thought{momentum.totalReflections === 1 ? "" : "s"} recorded
              </span>
            </div>
            {momentum.streakDays > 0 && (
              <div className="flex items-center gap-2">
                <Flame className="size-5 text-orange-500" />
                <span className="text-base font-semibold text-stone-800">
                  {momentum.streakDays}-day reflection streak
                </span>
              </div>
            )}
            <div className="flex flex-1 min-w-[220px] items-center gap-3">
              <Sparkles className="size-5 shrink-0 text-amber-500" />
              <div className="flex-1">
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-medium text-stone-700">
                    {momentum.remainingToMilestone} more reflection
                    {momentum.remainingToMilestone === 1 ? "" : "s"} until your next milestone
                  </span>
                  <span className="text-stone-500">
                    {momentum.totalReflections}/{momentum.nextMilestone}
                  </span>
                </div>
                <Progress
                  value={(momentum.totalReflections / momentum.nextMilestone) * 100}
                  className="h-2"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Games imported" value={counts.totalGames} />
        <StatCard label="Awaiting reflection" value={counts.awaitingReflection} />
        <StatCard label="Fully reviewed" value={counts.fullyReviewed} />
      </div>

      {/* The allowance, shown before the "Analyze all" button rather than
          after a refusal — the point is that running out is never a surprise.
          Escalates from a status line to a real pitch as the limit nears. */}
      <UpgradePrompt quota={quota} />

      {counts.totalGames > 0 && (
        <div className="mb-4">
          <div className="mb-1 flex items-center justify-between text-sm text-stone-600">
            <span>Overall review progress</span>
            <span className="font-medium text-stone-800">{reviewProgressPct}%</span>
          </div>
          <Progress value={reviewProgressPct} className="h-2.5" />
        </div>
      )}

      {games.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-stone-200 bg-card px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              {(
                [
                  ["all", "All"],
                  ["not_analyzed", "Not analyzed"],
                  ["awaiting", "Awaiting reflection"],
                  ["reviewed", "Fully reviewed"],
                ] as [StatusFilter, string][]
              ).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  className={`rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
                    filter === key
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-stone-200 text-stone-600 hover:bg-stone-100"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="ml-auto flex items-center gap-2">
              <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="date">Date played</SelectItem>
                  <SelectItem value="opponent">Opponent</SelectItem>
                  <SelectItem value="result">Result</SelectItem>
                </SelectContent>
              </Select>

              {analyzableIds.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    startAnalysis(selected.size > 0 ? [...selected] : analyzableIds)
                  }
                  disabled={starting || data.quota.remaining === 0}
                  className="gap-1.5"
                  title={
                    data.quota.remaining === 0
                      ? `You've analyzed all ${data.quota.limit} games included this month. Resets on ${data.quota.resetsAtLabel}.`
                      : undefined
                  }
                >
                  <PlayCircle className="size-4" />
                  {selected.size > 0
                    ? `Analyze selected (${selected.size})`
                    : `Analyze all (${analyzableIds.length})`}
                </Button>
              )}
            </div>
          </div>

          {visibleGames.length === 0 && (
            <p className="rounded-lg border border-dashed border-stone-300 py-8 text-center text-stone-500">
              No games match this filter.
            </p>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {visibleGames.map((g, i) => (
              <GameCard
                key={g.id}
                game={g}
                index={i}
                selected={selected.has(g.id)}
                onToggleSelect={() => toggleSelect(g.id)}
                canSelect={g.analysisStatus === "PENDING" || g.analysisStatus === "FAILED"}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ConnectAccountCard({ onConnected }: { onConnected: () => void }) {
  const [username, setUsername] = useState("");
  const [connecting, setConnecting] = useState(false);

  async function connect() {
    if (!username.trim()) return;
    setConnecting(true);
    try {
      const res = await fetch("/api/account/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not connect that account.");
      toast.success(`Connected to Chess.com as ${data.account.username}. Checking for games…`);
      onConnected();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not connect that account.");
    } finally {
      setConnecting(false);
    }
  }

  return (
    <Card className="mb-6 border-[#4A6178]/25 bg-[#4A6178]/5">
      <CardContent className="flex flex-wrap items-center gap-3 py-4">
        <Link2 className="size-5 shrink-0 text-[#4A6178]" />
        <div className="min-w-[220px] flex-1">
          <p className="font-medium text-stone-800">Connect your Chess.com account</p>
          <p className="text-sm text-stone-600">
            Enter it once — new games sync automatically every time you visit.
          </p>
        </div>
        <Input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && connect()}
          placeholder="Chess.com username"
          className="w-48 bg-card"
        />
        <Button onClick={connect} disabled={connecting || !username.trim()}>
          {connecting ? "Connecting…" : "Connect"}
        </Button>
      </CardContent>
    </Card>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardContent className="py-4">
        <div className="text-4xl font-semibold tabular-nums">{value}</div>
        <div className="text-base text-stone-500">{label}</div>
      </CardContent>
    </Card>
  );
}

function EmptyState() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>No games yet</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-stone-600">
        <p>
          Import a game from Chess.com or paste a PGN to start reflecting on your moves —
          before the engine tells you the answer.
        </p>
        <div>
          <Link href="/import">
            <Button>Import your first game</Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

const RESULT_BORDER: Record<string, string> = {
  Win: "border-l-[#2F4F3D]",
  Loss: "border-l-[#8B2E2E]",
  Draw: "border-l-stone-300",
  Ongoing: "border-l-[#4A6178]",
};

function GameCard({
  game,
  index,
  selected,
  onToggleSelect,
  canSelect,
}: {
  game: DashboardGame;
  index: number;
  selected: boolean;
  onToggleSelect: () => void;
  canSelect: boolean;
}) {
  const resultLabel = formatResult(game.result, game.userColor);
  const reviewLabel =
    game.analysisStatus !== "ANALYZED"
      ? null
      : game.totalKeyMoments === 0
        ? "No key moments"
        : game.reviewedKeyMoments === game.totalKeyMoments
          ? "Fully reviewed"
          : `${game.reviewedKeyMoments}/${game.totalKeyMoments} reflected`;

  return (
    <Card
      className={`overflow-hidden border-l-4 py-0 duration-300 animate-in fade-in-0 slide-in-from-bottom-2 transition-shadow hover:shadow-md ${RESULT_BORDER[resultLabel] ?? "border-l-stone-300"}`}
      style={{ animationDelay: `${Math.min(index, 10) * 40}ms`, animationFillMode: "backwards" }}
    >
      <CardContent className="flex flex-col gap-3 px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-start gap-2">
            {canSelect && (
              <Checkbox checked={selected} onCheckedChange={onToggleSelect} className="mt-1" />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="truncate text-lg font-semibold text-stone-900">
                  {game.whitePlayer} vs {game.blackPlayer}
                </span>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-stone-500">
                <span className="flex items-center gap-1">
                  <Globe className="size-3.5" />
                  {platformLabel(game.platform)}
                </span>
                <span>{formatDate(game.playedAt)}</span>
                {game.timeControl && (
                  <span className="flex items-center gap-1">
                    <Timer className="size-3.5" />
                    {game.timeControl}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <Badge variant={resultBadgeVariant(game.result, game.userColor)}>{resultLabel}</Badge>
            <Badge variant="outline">Played {game.userColor}</Badge>
          </div>
        </div>

        {game.thumbnails.length > 0 && (
          <div className="flex items-center gap-2">
            {game.thumbnails.map((t, i) => (
              <MiniBoard
                key={i}
                fen={t.fen}
                from={t.from}
                to={t.to}
                orientation={game.userColor === "white" ? "white" : "black"}
                size={72}
              />
            ))}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-stone-100 pt-2.5">
          <StatusBadge game={game} reviewLabel={reviewLabel} />
          <ActionButton game={game} />
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ game, reviewLabel }: { game: DashboardGame; reviewLabel: string | null }) {
  if (game.analysisStatus === "PENDING") return <Badge variant="secondary">Not analyzed</Badge>;
  if (game.analysisStatus === "ANALYZING") {
    return (
      <div className="flex w-32 items-center gap-2">
        <Progress value={game.analysisProgress} className="h-2" />
        <span className="text-xs text-stone-500">{game.analysisProgress}%</span>
      </div>
    );
  }
  if (game.analysisStatus === "FAILED") return <Badge variant="destructive">Analysis failed</Badge>;
  return (
    <Badge variant={game.reviewedKeyMoments === game.totalKeyMoments ? "default" : "secondary"}>
      {reviewLabel}
    </Badge>
  );
}

function ActionButton({ game }: { game: DashboardGame }) {
  if (game.analysisStatus === "ANALYZING") return null;
  return (
    <Link href={`/games/${game.id}`}>
      <Button size="sm" variant={game.analysisStatus === "ANALYZED" ? "default" : "outline"}>
        {game.analysisStatus !== "ANALYZED"
          ? "Analyze"
          : game.reviewedKeyMoments === 0
            ? "Start review"
            : "Continue review"}
      </Button>
    </Link>
  );
}
