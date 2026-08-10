"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatDate, formatResult, resultBadgeVariant } from "@/lib/format";
import type { ImportCandidate } from "@/lib/import/types";

export function ImportFlow() {
  return (
    <Tabs defaultValue="chesscom">
      <TabsList>
        <TabsTrigger value="chesscom">Chess.com</TabsTrigger>
        <TabsTrigger value="paste">Paste PGN</TabsTrigger>
      </TabsList>
      <TabsContent value="chesscom" className="mt-6">
        <ChessComImport />
      </TabsContent>
      <TabsContent value="paste" className="mt-6">
        <PasteImport />
      </TabsContent>
    </Tabs>
  );
}

function ChessComImport() {
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<ImportCandidate[] | null>(null);

  async function fetchGames() {
    if (!username.trim()) return;
    setLoading(true);
    setError(null);
    setCandidates(null);
    try {
      const res = await fetch("/api/import/chesscom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed.");
      setCandidates(data.games);
      if (data.games.length === 0) {
        toast.info("No recent games found for that username.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Label htmlFor="chesscom-username">Chess.com username</Label>
          <Input
            id="chesscom-username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="e.g. hikaru"
            onKeyDown={(e) => e.key === "Enter" && fetchGames()}
          />
        </div>
        <Button onClick={fetchGames} disabled={loading || !username.trim()}>
          {loading ? "Fetching…" : "Fetch recent games"}
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {candidates && candidates.length > 0 && <CandidateSelector candidates={candidates} />}
    </div>
  );
}

function PasteImport() {
  const [pgn, setPgn] = useState("");
  const [username, setUsername] = useState("");
  const [userColor, setUserColor] = useState<"white" | "black">("white");
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<ImportCandidate[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function parse() {
    setLoading(true);
    setError(null);
    setCandidates(null);
    try {
      const res = await fetch("/api/import/pgn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pgn, userColor, username: username || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not parse PGN.");
      setCandidates(data.games);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not parse PGN.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Label htmlFor="pgn-text">PGN text</Label>
        <Textarea
          id="pgn-text"
          rows={10}
          value={pgn}
          onChange={(e) => setPgn(e.target.value)}
          placeholder={`[Event "Casual Game"]\n[White "..."]\n[Black "..."]\n\n1. e4 e5 2. Nf3 ...`}
          className="font-mono text-sm"
        />
        <p className="mt-1 text-xs text-stone-500">
          You can paste more than one game — each must start with an [Event ...] tag.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="pgn-username">Your username (optional, to auto-detect color)</Label>
          <Input
            id="pgn-username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Matches White/Black tag if provided"
          />
        </div>
        <div>
          <Label>If we can&apos;t auto-detect, which color did you play?</Label>
          <RadioGroup
            value={userColor}
            onValueChange={(v) => setUserColor(v as "white" | "black")}
            className="mt-2 flex gap-4"
          >
            <label className="flex items-center gap-2 text-sm">
              <RadioGroupItem value="white" /> White
            </label>
            <label className="flex items-center gap-2 text-sm">
              <RadioGroupItem value="black" /> Black
            </label>
          </RadioGroup>
        </div>
      </div>

      <div>
        <Button onClick={parse} disabled={loading || !pgn.trim()}>
          {loading ? "Parsing…" : "Parse PGN"}
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {candidates && candidates.length > 0 && <CandidateSelector candidates={candidates} />}
    </div>
  );
}

function CandidateSelector({ candidates }: { candidates: ImportCandidate[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set(candidates.map((c) => c.externalId)));
  const [importing, setImporting] = useState(false);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function importSelected() {
    const toImport = candidates.filter((c) => selected.has(c.externalId));
    if (toImport.length === 0) return;
    setImporting(true);
    try {
      const res = await fetch("/api/import/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ games: toImport }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed.");
      const created = data.results.filter((r: { status: string }) => r.status === "created").length;
      const dup = data.results.filter((r: { status: string }) => r.status === "duplicate").length;
      const failed = data.results.filter((r: { status: string }) => r.status === "error").length;
      toast.success(
        `Imported ${created} game${created === 1 ? "" : "s"}` +
          (dup ? `, skipped ${dup} duplicate${dup === 1 ? "" : "s"}` : "") +
          (failed ? `, ${failed} failed` : "")
      );
      router.push("/");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-stone-600">{selected.size} of {candidates.length} selected</p>
        <Button size="sm" onClick={importSelected} disabled={importing || selected.size === 0}>
          {importing ? "Importing…" : `Import selected`}
        </Button>
      </div>
      <div className="flex flex-col gap-2">
        {candidates.map((c) => (
          <Card key={c.externalId}>
            <CardContent className="flex items-center gap-3 py-3">
              <Checkbox
                checked={selected.has(c.externalId)}
                onCheckedChange={() => toggle(c.externalId)}
              />
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">
                    {c.whitePlayer} vs {c.blackPlayer}
                  </span>
                  <Badge variant={resultBadgeVariant(c.result, c.userColor)}>
                    {formatResult(c.result, c.userColor)}
                  </Badge>
                  <Badge variant="outline">Played {c.userColor}</Badge>
                </div>
                <div className="text-sm text-stone-500">
                  {formatDate(c.playedAt)}
                  {c.timeControl ? ` · ${c.timeControl}` : ""}
                  {c.opening ? ` · ${c.opening}` : ""}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
