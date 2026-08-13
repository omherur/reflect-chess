"use client";

import { Button } from "@/components/ui/button";

/**
 * Google's four-colour "G". Kept as fixed brand colours rather than theme
 * tokens — it's someone else's mark, and recolouring it to match the
 * parchment palette would misrepresent it.
 */
function GoogleMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 18 18" aria-hidden focusable="false">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.34A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.41 5.41 0 0 1 0-3.44V4.94H.96a9 9 0 0 0 0 8.12l3.01-2.34Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.94l3.01 2.34C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

/**
 * Starts the Google OAuth redirect. There's no local loading state to clear
 * on success because the browser navigates away to Google — only a failure
 * returns control here.
 */
export function GoogleButton({
  onStart,
  onError,
  disabled,
  pending,
  label,
}: {
  onStart: () => void;
  onError: (message: string) => void;
  disabled?: boolean;
  pending?: boolean;
  label: string;
}) {
  async function click() {
    onStart();
    try {
      // Imported lazily so the Supabase browser client isn't pulled into the
      // initial bundle for a button most visitors won't press.
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const next = new URLSearchParams(window.location.search).get("next") ?? "/";
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        },
      });
      if (error) throw error;
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not start Google sign-in.");
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="lg"
      onClick={click}
      disabled={disabled}
      className="w-full gap-2.5"
    >
      <GoogleMark className="size-[1.125rem]" />
      {pending ? "Redirecting to Google…" : label}
    </Button>
  );
}
