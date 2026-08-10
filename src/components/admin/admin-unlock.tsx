"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Lock } from "lucide-react";

/**
 * The admin key is checked server-side only — nothing here validates it, so
 * there's no shape to infer from the client bundle.
 */
export function AdminUnlock({ configured }: { configured: boolean }) {
  const router = useRouter();
  const [key, setKey] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!key || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not unlock.");
      setKey("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not unlock.");
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-16">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <Lock className="size-4 text-stone-500" />
            Admin
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {configured ? (
            <>
              <p className="text-sm text-stone-600">
                Enter the admin key to view signups. Signing in as a particular name isn&apos;t
                enough — names aren&apos;t passwords here.
              </p>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="admin-key">Admin key</Label>
                <Input
                  id="admin-key"
                  type="password"
                  value={key}
                  onChange={(e) => {
                    setKey(e.target.value);
                    if (error) setError(null);
                  }}
                  onKeyDown={(e) => e.key === "Enter" && submit()}
                  autoFocus
                  autoComplete="off"
                />
              </div>
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <Button onClick={submit} disabled={submitting || !key}>
                {submitting ? "Checking…" : "Unlock"}
              </Button>
            </>
          ) : (
            <Alert>
              <AlertDescription>
                No <code className="font-mono text-xs">ADMIN_KEY</code> is set on this server, so
                the admin area is locked for everyone. Set one in <code className="font-mono text-xs">.env</code> and restart.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
