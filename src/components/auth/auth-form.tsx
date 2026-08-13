"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { isValidEmail } from "@/lib/email";
import { GoogleButton } from "@/components/auth/google-button";

/** Supabase's own default floor is 6; 8 is a more defensible baseline. */
const MIN_PASSWORD_LENGTH = 8;

type Mode = "signin" | "signup";

/**
 * Sign in and sign up are the same three fields and the same failure modes,
 * so they're one component with two labels rather than two near-identical
 * pages that drift apart.
 *
 * Auth calls go directly from the browser to Supabase, which sets the
 * session cookies; router.refresh() then re-renders the server components so
 * the header and dashboard see the new session.
 */
export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isSignUp = mode === "signup";
  // Set by the landing page's demo CTA, so someone who clicked "Analyze a
  // free demo game" lands on a page about that rather than a generic form.
  const demo = searchParams.get("demo") === "1";
  const next = searchParams.get("next") || "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [googlePending, setGooglePending] = useState(false);
  // A failed OAuth round trip comes back as ?error= from /auth/callback,
  // since there's no component state left to put it in after the redirect.
  const [error, setError] = useState<string | null>(searchParams.get("error"));
  const [checkEmail, setCheckEmail] = useState(false);

  const busy = submitting || googlePending;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;

    if (!isValidEmail(email)) {
      setError("Enter a valid email address.");
      return;
    }
    if (isSignUp && password.length < MIN_PASSWORD_LENGTH) {
      setError(`Use at least ${MIN_PASSWORD_LENGTH} characters for your password.`);
      return;
    }
    if (!password) {
      setError("Enter your password.");
      return;
    }

    setSubmitting(true);
    setError(null);
    const supabase = createClient();

    try {
      if (isSignUp) {
        const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
        if (signUpError) throw signUpError;
        // With email confirmations enabled on the project, sign-up returns a
        // user but no session — there's nothing to redirect to yet.
        if (!data.session) {
          setCheckEmail(true);
          setSubmitting(false);
          return;
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
      }

      router.push(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
      setSubmitting(false);
    }
  }

  if (checkEmail) {
    return (
      <AuthCard title="Check your email">
        <p className="text-sm text-stone-600">
          We sent a confirmation link to <span className="font-medium">{email}</span>. Open it to
          finish creating your account, then come back and sign in.
        </p>
      </AuthCard>
    );
  }

  const title = isSignUp
    ? demo
      ? "Analyze your first game free"
      : "Create your account"
    : "Welcome back";

  return (
    <AuthCard title={title}>
      <p className="text-sm text-stone-600">
        {isSignUp
          ? demo
            ? "Sign up with Google or an email and password. A fully analyzed demo game is waiting inside, so you can try the whole thing before importing anything of your own."
            : "Sign up with Google or an email and password. A fully analyzed demo game is waiting inside to get you started."
          : "Sign in to get back to your games."}
      </p>

      {/* Above both methods on purpose — it may describe a failed Google
          round trip as easily as a rejected password. */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <GoogleButton
        label={isSignUp ? "Sign up with Google" : "Continue with Google"}
        pending={googlePending}
        disabled={busy}
        onStart={() => {
          setGooglePending(true);
          setError(null);
        }}
        onError={(message) => {
          setGooglePending(false);
          setError(message);
        }}
      />

      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs text-stone-400">or</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="auth-email">Email</Label>
          <Input
            id="auth-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (error) setError(null);
            }}
            placeholder="you@example.com"
            autoFocus
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="auth-password">Password</Label>
          <Input
            id="auth-password"
            type="password"
            autoComplete={isSignUp ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (error) setError(null);
            }}
          />
          {isSignUp && (
            <p className="text-xs text-stone-400">
              At least {MIN_PASSWORD_LENGTH} characters.
            </p>
          )}
        </div>

        <Button type="submit" size="lg" disabled={busy}>
          {submitting
            ? isSignUp
              ? "Creating account…"
              : "Signing in…"
            : isSignUp
              ? "Create account"
              : "Sign in"}
        </Button>
      </form>

      <p className="text-sm text-stone-500">
        {isSignUp ? (
          <>
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-primary hover:underline">
              Sign in
            </Link>
          </>
        ) : (
          <>
            New here?{" "}
            <Link href="/signup" className="font-medium text-primary hover:underline">
              Create an account
            </Link>
          </>
        )}
      </p>
    </AuthCard>
  );
}

function AuthCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-16">
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-2xl">{title}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">{children}</CardContent>
      </Card>
    </div>
  );
}
