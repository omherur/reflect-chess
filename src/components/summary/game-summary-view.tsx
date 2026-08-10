import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatResult, resultBadgeVariant, platformLabel } from "@/lib/format";
import type { StructuredGameSummary } from "@/server/summary/types";
import { Sparkles, Target, TrendingUp, MessageCircleHeart, ArrowLeft } from "lucide-react";

interface GameSummaryViewProps {
  gameId: string;
  game: {
    whitePlayer: string;
    blackPlayer: string;
    userColor: string;
    result: string;
    playedAt: string | null;
    opening: string | null;
    platform: string;
  };
  summary: StructuredGameSummary;
}

export function GameSummaryView({ gameId, game, summary }: GameSummaryViewProps) {
  const opponent = game.userColor === "white" ? game.blackPlayer : game.whitePlayer;

  return (
    <div className="flex flex-col gap-6 duration-500 animate-in fade-in-0 slide-in-from-bottom-3">
      <div>
        <Link href="/" className="mb-3 inline-flex items-center gap-1 text-sm text-stone-500 hover:text-stone-800">
          <ArrowLeft className="size-3.5" />
          Back to dashboard
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Game summary</h1>
            <p className="mt-1 text-sm text-stone-500">
              vs {opponent} · {platformLabel(game.platform)} · {formatDate(game.playedAt)}
              {game.opening ? ` · ${game.opening}` : ""}
            </p>
          </div>
          <Badge variant={resultBadgeVariant(game.result, game.userColor)} className="text-sm">
            {formatResult(game.result, game.userColor)} (played {game.userColor})
          </Badge>
        </div>
      </div>

      {summary.estimatedRating !== null && (
        <Card className="border-primary/25 bg-primary/5">
          <CardContent className="flex items-center gap-4 py-5">
            <TrendingUp className="size-8 shrink-0 text-primary" />
            <div>
              <p className="text-xs font-medium tracking-wide text-stone-500 uppercase">
                Estimated performance rating, this game
              </p>
              <p className="font-heading text-3xl font-semibold text-stone-900">{summary.estimatedRating}</p>
              <p className="text-xs text-stone-500">
                Based on how closely your moves in this game tracked the engine&apos;s evaluation — a rough,
                gamified estimate, not a precise rating.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <SummarySection
        icon={Sparkles}
        label="How this game went"
        text={summary.narrative}
        tint="bg-primary/8 border-primary/20"
        iconClass="text-primary"
      />

      {summary.recurringPattern && (
        <SummarySection
          icon={MessageCircleHeart}
          label="Recurring pattern this game"
          text={summary.recurringPattern}
          tint="bg-severity-mistake/10 border-severity-mistake/30"
          iconClass="text-severity-mistake-text"
        />
      )}

      <SummarySection
        icon={Target}
        label="What to focus on"
        text={summary.focusAdvice}
        tint="bg-severity-good/10 border-severity-good/25"
        iconClass="text-severity-good"
      />

      {summary.confidenceObservation && (
        <SummarySection
          icon={TrendingUp}
          label="About your confidence"
          text={summary.confidenceObservation}
          tint="bg-severity-time-trouble/10 border-severity-time-trouble/30"
          iconClass="text-severity-time-trouble"
        />
      )}

      <div className="flex justify-center pt-2">
        <Link href={`/games/${gameId}`}>
          <Button variant="outline">Review this game again</Button>
        </Link>
      </div>
    </div>
  );
}

function SummarySection({
  icon: Icon,
  label,
  text,
  tint,
  iconClass,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  text: string;
  tint: string;
  iconClass: string;
}) {
  return (
    <div className={`flex flex-col gap-2 rounded-xl border p-5 ${tint}`}>
      <div className="flex items-center gap-2">
        <Icon className={`size-5 ${iconClass}`} />
        <p className="text-sm font-semibold text-stone-800">{label}</p>
      </div>
      <p className="leading-relaxed text-stone-700">{text}</p>
    </div>
  );
}
