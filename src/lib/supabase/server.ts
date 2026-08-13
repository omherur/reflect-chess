import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Supabase client for server components and route handlers, reading the
 * session from cookies.
 *
 * The setAll try/catch is deliberate and load-bearing: server components
 * can't write cookies, and Supabase attempts to refresh an expiring token
 * whenever the session is read. Swallowing that write is safe *because*
 * src/proxy.ts runs the same refresh on every request and can set cookies,
 * so the refreshed token still reaches the browser.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a server component — the proxy handles the refresh.
          }
        },
      },
    }
  );
}
