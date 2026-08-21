import Stripe from "stripe";

/**
 * The Stripe SDK, created once and lazily.
 *
 * Deliberately NOT modelled on the Claude provider's silent-fallback
 * behaviour. When ANTHROPIC_API_KEY is missing, explanations quietly degrade
 * to a template and the product still works; when a billing key is missing
 * there is no safe degraded mode — a checkout that appears to succeed
 * without charging anyone is worse than one that visibly fails. So this
 * throws, loudly, and callers surface it.
 *
 * The pinned API version is whatever the installed SDK was generated
 * against. Worth knowing when reading subscription objects: from
 * 2025-04-30 onward `current_period_end` lives on the subscription's ITEMS,
 * not on the subscription (see src/server/billing/sync.ts).
 */

let cached: Stripe | null = null;

/** True when Stripe is configured. Lets the UI disable upgrade rather than 500. */
export function stripeEnabled(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID_PRO);
}

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "[billing] STRIPE_SECRET_KEY is not set — billing is disabled. " +
        "Set it in .env and restart the server (env is read at process start)."
    );
  }
  return (cached ??= new Stripe(key));
}

/** The recurring price for the Pro plan. */
export function proPriceId(): string {
  const priceId = process.env.STRIPE_PRICE_ID_PRO;
  if (!priceId) {
    throw new Error("[billing] STRIPE_PRICE_ID_PRO is not set — nothing to sell.");
  }
  return priceId;
}

/**
 * Absolute origin for Checkout return URLs. Stripe requires absolute URLs,
 * and a relative one fails at session creation rather than at redirect time.
 */
export function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "");
}
