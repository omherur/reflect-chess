import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for browser code (the sign-in and sign-up forms).
 *
 * Both values are public by design — they're compiled into the client
 * bundle, which is what NEXT_PUBLIC_ means. The publishable key is not a
 * secret; it identifies the project and is constrained by Supabase's own
 * policies, not by being hidden.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
}
