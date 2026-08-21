import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { User } from "@prisma/client";
import { planForStatus } from "@/lib/plans";

/**
 * Mirrors subscription state into a Supabase table, so billing can be queried
 * from the Supabase dashboard.
 *
 * This is a SECONDARY copy, and the whole module is built around that fact.
 * Stripe is the source of truth and the local Prisma `User` row is the
 * application's copy of it; this table is downstream of both. Three
 * consequences, all deliberate:
 *
 *  1. **It can never fail a webhook.** Every write is wrapped and swallowed.
 *     If provisioning depended on Supabase being reachable, a Supabase outage
 *     would mean paying customers silently don't get access — far worse than
 *     a stale reporting table.
 *  2. **It is time-bounded.** A hanging request can't hold the webhook
 *     response open until Stripe gives up and retries.
 *  3. **It is repairable.** Because drift is possible by construction, there
 *     is a reconcile script that rebuilds every row from the local database:
 *     `npx tsx scripts/reconcile-supabase-subscriptions.ts`
 *
 * Writes use the service-role key, which bypasses RLS. The anon key cannot
 * write this table and can only read the signed-in user's own row.
 */

const WRITE_TIMEOUT_MS = 3000;

let cached: SupabaseClient | null = null;
let warnedMissingKey = false;

/** True when the mirror is configured. Everything no-ops when it isn't. */
export function supabaseMirrorEnabled(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function client(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    // Logged once, not per event — a webhook storm shouldn't bury the log.
    if (!warnedMissingKey) {
      warnedMissingKey = true;
      console.warn(
        "[billing] SUPABASE_SERVICE_ROLE_KEY is not set — subscription mirroring is off. " +
          "The app is unaffected; the Supabase subscriptions table just won't be updated."
      );
    }
    return null;
  }
  return (cached ??= createClient(url, key, {
    // A server-to-server client: no cookie, no refresh, nothing to persist.
    auth: { persistSession: false, autoRefreshToken: false },
  }));
}

/** The row shape, derived entirely from the local user record. */
export function rowFor(user: User) {
  return {
    app_user_id: user.id,
    supabase_user_id: user.supabaseUserId,
    email: user.email,
    stripe_customer_id: user.stripeCustomerId,
    stripe_subscription_id: user.stripeSubscriptionId,
    status: user.subscriptionStatus,
    // Denormalised so a dashboard query doesn't have to re-implement the
    // access rule that src/lib/plans.ts owns.
    plan: planForStatus(user.subscriptionStatus),
    price_id: user.subscriptionPriceId,
    current_period_end: user.currentPeriodEnd ? user.currentPeriodEnd.toISOString() : null,
    cancel_at_period_end: user.cancelAtPeriodEnd,
    synced_at: new Date().toISOString(),
  };
}

/**
 * Upsert one user's subscription row. Returns whether it was written, and
 * never throws.
 *
 * Keyed on app_user_id, so a Stripe redelivery or a re-subscription updates
 * the same row instead of accumulating duplicates.
 */
export async function mirrorSubscription(user: User): Promise<boolean> {
  const supabase = client();
  if (!supabase) return false;

  try {
    const write = supabase
      .from("subscriptions")
      .upsert(rowFor(user), { onConflict: "app_user_id" });

    const { error } = (await Promise.race([
      write,
      new Promise<{ error: { message: string } }>((resolve) =>
        setTimeout(
          () => resolve({ error: { message: `timed out after ${WRITE_TIMEOUT_MS}ms` } }),
          WRITE_TIMEOUT_MS
        )
      ),
    ])) as { error: { message: string } | null };

    if (error) {
      console.error(`[billing] Supabase mirror failed for user ${user.id}: ${error.message}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[billing] Supabase mirror threw for user ${user.id}:`, err);
    return false;
  }
}
