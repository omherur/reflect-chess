"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import type { ExplanationLogEntry, ExplanationSource } from "@/server/explain/monitor";

const SOURCE_LABEL: Record<ExplanationSource, string> = {
  ai: "AI",
  "ai-patched": "AI (patched)",
  template: "Template fallback",
};

const SOURCE_CLASS: Record<ExplanationSource, string> = {
  ai: "bg-severity-best/14 text-severity-best border-severity-best/40",
  "ai-patched": "bg-severity-mistake/12 text-severity-mistake-text border-severity-mistake/35",
  template: "bg-destructive/12 text-destructive border-destructive/35",
};

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function ExplanationLogView({ initialEntries }: { initialEntries: ExplanationLogEntry[] }) {
  const [entries, setEntries] = useState(initialEntries);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  async function refresh() {
    setRefreshing(true);
    try {
      const res = await fetch("/api/admin/explanations");
      if (res.ok) {
        const data = await res.json();
        setEntries(data.entries as ExplanationLogEntry[]);
      }
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(refresh, 4000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh]);

  const total = entries.length;
  const templateCount = entries.filter((e) => e.source === "template").length;
  const patchedCount = entries.filter((e) => e.source === "ai-patched").length;
  const aiCount = entries.filter((e) => e.source === "ai").length;
  const fallbackRatio = total === 0 ? 0 : Math.round(((templateCount + patchedCount) / total) * 100);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total logged" value={total} />
        <StatCard label="Real AI" value={aiCount} tone="text-severity-best" />
        <StatCard label="AI, patched" value={patchedCount} tone="text-severity-mistake-text" />
        <StatCard label="Template fallback" value={templateCount} tone="text-destructive" />
      </div>

      {total > 0 && fallbackRatio >= 50 && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="py-3 text-sm text-destructive">
            {fallbackRatio}% of the last {total} explanations did NOT come from the real AI path — if this stays
            high, check that ANTHROPIC_API_KEY is set and check the server logs for recurring [explain] errors.
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm text-stone-600">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
            className="size-3.5"
          />
          Auto-refresh every 4s
        </label>
        <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing} className="gap-1.5">
          <RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {entries.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-stone-500">
            No explanations generated yet this server session — reflect on a key moment to populate this log.
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-stone-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-stone-50 text-xs text-stone-500 uppercase">
              <tr>
                <th className="px-3 py-2">Time</th>
                <th className="px-3 py-2">Source</th>
                <th className="px-3 py-2">Move</th>
                <th className="px-3 py-2">Classification</th>
                <th className="px-3 py-2">Why best is better (snippet)</th>
                <th className="px-3 py-2">Notes</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, i) => (
                <tr key={i} className="border-t border-stone-100 align-top">
                  <td className="px-3 py-2 whitespace-nowrap text-stone-500">{formatTime(entry.timestamp)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${SOURCE_CLASS[entry.source]}`}>
                      {SOURCE_LABEL[entry.source]}
                    </span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap font-medium text-stone-800">
                    {entry.originalSan} <span className="text-stone-400">vs</span> {entry.bestSan}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-stone-600">{entry.classification}</td>
                  <td className="max-w-md px-3 py-2 text-stone-600">
                    {entry.whyBestIsBetter.length > 140
                      ? `${entry.whyBestIsBetter.slice(0, 140)}…`
                      : entry.whyBestIsBetter}
                  </td>
                  <td className="px-3 py-2 text-stone-500">
                    {entry.fallbackReason && <p className="text-xs text-destructive">{entry.fallbackReason}</p>}
                    {entry.gameId && entry.keyMomentId && (
                      <Link href={`/games/${entry.gameId}`} className="text-xs text-primary hover:underline">
                        View game
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <Card>
      <CardContent className="py-3">
        <div className={`text-2xl font-semibold tabular-nums ${tone ?? ""}`}>{value}</div>
        <div className="text-xs text-stone-500">{label}</div>
      </CardContent>
    </Card>
  );
}
