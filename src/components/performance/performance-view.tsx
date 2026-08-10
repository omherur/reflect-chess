"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Gauge, Sparkles, Swords, TrendingUp } from "lucide-react";
import type { MilestoneProgress, PerformanceData } from "@/server/rating";
import { cn } from "@/lib/utils";

const THEME = {
  amber: {
    card: "border-[#B8860B]/30 bg-gradient-to-r from-[#D4B96B]/15 to-[#B8860B]/10",
    icon: "text-[#8A6108]",
    bar: "bg-[#B8860B]",
  },
  slate: {
    card: "border-[#4A6178]/30 bg-gradient-to-r from-[#4A6178]/10 to-[#2F4F3D]/10",
    icon: "text-[#4A6178]",
    bar: "bg-[#4A6178]",
  },
} as const;

function MilestoneCard({
  theme,
  icon,
  title,
  description,
  rating,
  milestone,
  footnote,
}: {
  theme: keyof typeof THEME;
  icon: React.ReactNode;
  title: string;
  description: string;
  rating: number;
  milestone: MilestoneProgress;
  footnote: string;
}) {
  const t = THEME[theme];
  return (
    <Card className={cn("duration-500 animate-in fade-in-0 slide-in-from-bottom-2", t.card)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <span className={t.icon}>{icon}</span>
          {title}
        </CardTitle>
        <p className="text-sm text-stone-600">{description}</p>
      </CardHeader>
      <CardContent>
        <div className="mb-3 flex items-end justify-between">
          <span className="text-4xl font-bold tabular-nums text-stone-900">{rating}</span>
          <span className="text-sm text-stone-500">
            {milestone.nextMilestone - rating} points to {milestone.nextMilestone}
          </span>
        </div>
        <div className="mb-1 flex justify-between text-xs text-stone-500">
          <span>{milestone.previousMilestone}</span>
          <span>{milestone.nextMilestone}</span>
        </div>
        <Progress
          value={milestone.progressPercent}
          className="h-3"
          indicatorClassName={t.bar}
        />
        <p className="mt-3 text-xs text-stone-500">{footnote}</p>
      </CardContent>
    </Card>
  );
}

function EmptyMetricCard({
  theme,
  icon,
  title,
  description,
  emptyMessage,
}: {
  theme: keyof typeof THEME;
  icon: React.ReactNode;
  title: string;
  description: string;
  emptyMessage: string;
}) {
  const t = THEME[theme];
  return (
    <Card className={cn("duration-500 animate-in fade-in-0 slide-in-from-bottom-2", t.card)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <span className={t.icon}>{icon}</span>
          {title}
        </CardTitle>
        <p className="text-sm text-stone-600">{description}</p>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-stone-500">{emptyMessage}</p>
      </CardContent>
    </Card>
  );
}

export function PerformanceView({ data }: { data: PerformanceData }) {
  const { actualRating, moveQuality, reflectionQuality } = data;

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10">
      <h1 className="mb-1 text-3xl font-bold tracking-tight text-stone-900">Performance</h1>
      <p className="mb-8 text-stone-600">
        How your decisions on the board — and how you reflect on them — compare to where you&apos;re
        headed.
      </p>

      <Card className="mb-6">
        <CardContent className="flex flex-wrap items-center gap-x-10 gap-y-4 py-6">
          <div>
            <div className="flex items-center gap-1.5 text-sm text-stone-500">
              <Swords className="size-4" />
              Actual rating (Chess.com)
            </div>
            <div className="text-3xl font-bold tabular-nums text-stone-900">
              {actualRating ?? "—"}
            </div>
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-sm text-stone-500">
              <Gauge className="size-4" />
              Engine-predicted rating
            </div>
            <div className="text-3xl font-bold tabular-nums text-stone-900">
              {moveQuality ? moveQuality.predictedRating : "—"}
            </div>
          </div>
          {actualRating !== null && moveQuality && (
            <div className="text-sm text-stone-500">
              {moveQuality.predictedRating > actualRating
                ? `Your decision quality is trending ${moveQuality.predictedRating - actualRating} points above your rating.`
                : moveQuality.predictedRating < actualRating
                  ? `Your decision quality is trending ${actualRating - moveQuality.predictedRating} points below your rating.`
                  : "Your decision quality matches your current rating."}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {moveQuality ? (
          <MilestoneCard
            theme="amber"
            icon={<TrendingUp className="size-5" />}
            title="Move quality trajectory"
            description="Based on how your actual game moves compare to the engine's best line."
            rating={moveQuality.predictedRating}
            milestone={moveQuality.milestone}
            footnote={`Based on ${moveQuality.sampleSize} analyzed key moment${moveQuality.sampleSize === 1 ? "" : "s"}.`}
          />
        ) : (
          <EmptyMetricCard
            theme="amber"
            icon={<TrendingUp className="size-5" />}
            title="Move quality trajectory"
            description="Based on how your actual game moves compare to the engine's best line."
            emptyMessage="Analyze a few games to see this trajectory."
          />
        )}

        {reflectionQuality ? (
          <MilestoneCard
            theme="slate"
            icon={<Sparkles className="size-5" />}
            title="Reflection trajectory"
            description="Based on your reflection answers and replay moves — not raw move accuracy."
            rating={reflectionQuality.predictedRating}
            milestone={reflectionQuality.milestone}
            footnote={`Average reflection quality: ${reflectionQuality.averageQualityScore}/100, from ${reflectionQuality.sampleSize} reflection${reflectionQuality.sampleSize === 1 ? "" : "s"}.`}
          />
        ) : (
          <EmptyMetricCard
            theme="slate"
            icon={<Sparkles className="size-5" />}
            title="Reflection trajectory"
            description="Based on your reflection answers and replay moves — not raw move accuracy."
            emptyMessage="Answer a few reflections to see this trajectory."
          />
        )}
      </div>
    </div>
  );
}
