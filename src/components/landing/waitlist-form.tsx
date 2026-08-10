"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check } from "lucide-react";
import { isValidEmail } from "@/lib/email";

type Status = "idle" | "submitting" | "joined" | "already";

/**
 * Waitlist capture. Validation runs client-side purely to catch typos before
 * a round trip — the API route re-validates with the same `isValidEmail`,
 * since nothing arriving from a browser can be trusted.
 *
 * Being on the list already is treated as success, not as an error: someone
 * re-entering their address wants reassurance, not a red box.
 */
export function WaitlistForm({ source = "landing" }: { source?: string }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const submitting = status === "submitting";
  const done = status === "joined" || status === "already";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    if (!email.trim()) {
      setError("Enter your email to join the waitlist.");
      return;
    }
    if (!isValidEmail(email)) {
      setError("That doesn't look like a valid email address.");
      return;
    }

    setStatus("submitting");
    setError(null);
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not join the waitlist.");
      setStatus(data.alreadyOnList ? "already" : "joined");
    } catch (err) {
      setStatus("idle");
      setError(err instanceof Error ? err.message : "Could not join the waitlist.");
    }
  }

  if (done) {
    return (
      <div
        role="status"
        className="flex w-full max-w-md items-start gap-3 rounded-lg border border-[var(--success)]/30 bg-[var(--success)]/8 px-4 py-3 text-left"
      >
        <Check className="mt-0.5 size-4 shrink-0 text-[var(--success)]" />
        <p className="text-sm text-foreground">
          {status === "already"
            ? "You're already on the list — no need to sign up twice. We'll be in touch."
            : "You're on the list. We'll email you once it's ready — nothing else."}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex w-full max-w-md flex-col gap-2" noValidate>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          type="email"
          name="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (error) setError(null);
          }}
          placeholder="you@example.com"
          aria-label="Email address"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "waitlist-error" : undefined}
          disabled={submitting}
          className="sm:flex-1"
        />
        {/* Deliberately not disabled on an empty field — a greyed-out CTA is
            the first thing a visitor sees here, and it reads as broken. An
            empty submit gets a written reason instead. */}
        <Button type="submit" size="lg" disabled={submitting}>
          {submitting ? "Joining…" : "Join the waitlist"}
        </Button>
      </div>
      {error ? (
        <p id="waitlist-error" className="text-sm text-destructive">
          {error}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          One email when it&apos;s ready. No newsletter, no sharing your address.
        </p>
      )}
    </form>
  );
}
