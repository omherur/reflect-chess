import type Stripe from "stripe";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getStripe } from "@/server/stripe/client";
import { mirrorSubscription } from "@/server/billing/supabase-mirror";

/**
 * Keeping the local User row in step with Stripe.
 *
 * Stripe is the source of truth. These functions never decide anything about
 * a subscription — they read what Stripe says and mirror it, so that
 * rendering a page costs a local query instead of an API call.
 */

/**
 * The end of the current paid period.
 *
 * This is fiddlier than it looks. As of API version 2025-04-30, Stripe
 * REMOVED `current_period_end` from the Subscription object and moved it
 * onto each subscription ITEM, because a subscription's items can now bill
 * on different cadences. Reading `subscription.current_period_end` against a
 * modern API version yields `undefined`, which becomes an Invalid Date and
 * then a row that claims the plan expired in 1970.
 *
 * A single-price subscription has exactly one item, but taking the latest
 * across all of them is correct for any shape: access lasts until the last
 * paid-for period ends.
 */
export function periodEndFrom(subscription: Stripe.Subscription): Date | null {
  const ends = (subscription.items?.data ?? [])
    .map((item) => item.current_period_end)
    .filter((v): v is number => typeof v === "number");
  if (ends.length === 0) return null;
  return new Date(Math.max(...ends) * 1000);
}

/** The price the subscription is on, for display and for plan-change detection. */
export function priceIdFrom(subscription: Stripe.Subscription): string | null {
  return subscription.items?.data?.[0]?.price?.id ?? null;
}

/** Stripe puts the customer id on the subscription as an id or an expanded object. */
function customerIdFrom(subscription: Stripe.Subscription): string | null {
  const c = subscription.customer;
  if (!c) return null;
  return typeof c === "string" ? c : c.id;
}

/**
 * Find the local user a subscription belongs to.
 *
 * Two routes, because either can be the one that's available. Normally the
 * customer id is already on the row (we write it before Checkout starts).
 * The metadata fallback covers a subscription created outside this app — in
 * the Stripe Dashboard, say — where nothing wrote the mapping locally first.
 */
async function resolveUser(subscription: Stripe.Subscription): Promise<User | null> {
  const customerId = customerIdFrom(subscription);
  if (customerId) {
    const byCustomer = await prisma.user.findUnique({ where: { stripeCustomerId: customerId } });
    if (byCustomer) return byCustomer;
  }

  const appUserId = subscription.metadata?.appUserId;
  if (appUserId) {
    const byMetadata = await prisma.user.findUnique({ where: { id: appUserId } });
    if (byMetadata) return byMetadata;
  }

  return null;
}

/**
 * Write a subscription's current state onto its user's row.
 *
 * Takes the Subscription object rather than fetching it, so it can be unit
 * tested without a Stripe client. Callers that hold only an id should use
 * syncSubscriptionById, which re-fetches — see the note there about ordering.
 */
export async function applySubscription(subscription: Stripe.Subscription): Promise<User | null> {
  const user = await resolveUser(subscription);
  if (!user) {
    console.warn(
      `[billing] Subscription ${subscription.id} has no matching local user — ignoring.`
    );
    return null;
  }

  const customerId = customerIdFrom(subscription);

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      ...(customerId ? { stripeCustomerId: customerId } : {}),
      stripeSubscriptionId: subscription.id,
      subscriptionStatus: subscription.status,
      subscriptionPriceId: priceIdFrom(subscription),
      currentPeriodEnd: periodEndFrom(subscription),
      cancelAtPeriodEnd: subscription.cancel_at_period_end ?? false,
    },
  });

  // Mirror to Supabase for reporting — strictly after the local write, and
  // strictly non-fatal. mirrorSubscription never throws and is time-bounded,
  // so a Supabase outage degrades a dashboard table rather than stopping a
  // paying customer from being provisioned. This is the single write path for
  // subscription state, which is why the mirror hangs off it rather than off
  // each webhook event type.
  await mirrorSubscription(updated);

  return updated;
}

/**
 * Re-fetch a subscription from Stripe by id, then mirror it.
 *
 * Re-fetching rather than trusting the event payload is what makes webhook
 * ordering irrelevant. Stripe retries for up to three days and makes no
 * ordering guarantee, so a stale `customer.subscription.updated` can arrive
 * after the `deleted` that superseded it. Acting on the payload would
 * resurrect a cancelled subscription; re-reading current truth means a late
 * event simply writes what's already there.
 */
export async function syncSubscriptionById(subscriptionId: string): Promise<User | null> {
  const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
  return applySubscription(subscription);
}

/**
 * The Stripe Customer for this user, created if they don't have one.
 *
 * Persisted immediately rather than waiting for the webhook, so the
 * customer -> user mapping exists before Checkout can possibly complete.
 * Without that, a fast webhook arrives with a customer nobody recognises.
 */
export async function getOrCreateStripeCustomer(user: User): Promise<string> {
  if (user.stripeCustomerId) return user.stripeCustomerId;

  const customer = await getStripe().customers.create({
    email: user.email ?? undefined,
    name: user.name,
    // The backstop for resolveUser when the local row somehow lacks the id.
    metadata: { appUserId: user.id },
  });

  await prisma.user.update({
    where: { id: user.id },
    data: { stripeCustomerId: customer.id },
  });

  return customer.id;
}
