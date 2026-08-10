"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Set by the landing page's demo CTA. Signing up is the same one-field
  // flow either way — the flag only changes the framing, so someone who
  // clicked "Analyze a free demo game" lands on a page about that, not a
  // generic login box.
  const demo = searchParams.get("demo") === "1";
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not log in.");
      const next = searchParams.get("next") || "/";
      router.push(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not log in.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center px-6 py-16">
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-2xl">
            {demo ? "Analyze your first game free" : "Welcome to ReflectChess"}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-stone-600">
            {demo
              ? "Pick a name to create your account — no password. A fully analyzed demo game is waiting inside, so you can try the whole thing before importing anything of your own."
              : "Enter a name to continue. New name → new account; use the same name to come back to your games later. No password needed."}
          </p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="login-name">Your name</Label>
            <Input
              id="login-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="e.g. Jamie"
              autoFocus
            />
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button size="lg" onClick={submit} disabled={submitting || !name.trim()}>
            {submitting ? "Signing in…" : "Continue"}
          </Button>
          <p className="text-xs text-stone-400">
            New accounts start with one analyzed demo game — five key moments, waiting for your
            reasoning.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
