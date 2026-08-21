import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/lib/db";
import { getStripe } from "@/server/stripe/client";
import { syncSubscriptionById } from "@/server/billing/sync";
import { HANDLED_EVENTS, subscriptionIdFor } from "@/server/billing/webhook-events";

/**
 * Stripe's event endpoint — how a payment actually becomes access.
 *
 * Four things here are load-bearing and easy to get wrong:
 *
 * 1. This route is PUBLIC. Stripe carries no Supabase cookie, so it must be
 *    listed in PUBLIC_PREFIXES in src/proxy.ts or every event 401s and
 *    subscriptions silently never provision. The signature check below is
 *    what authenticates the caller instead.
 * 2. The body must be read RAW, with req.text(). Signature verification
 *    hashes the exact bytes Stripe sent; the req.json() idiom used elsewhere
 *    in this app re-serializes and would fail every time.
 * 3. A bad signature is a 400, never a 500. Stripe retries 5xx for three
 *    days, so answering "your request was malformed" with a server error
 *    buys days of pointless redelivery.
 * 4. Events are deduplicated on Stripe's own event id. Retries and
 *    out-of-order delivery are normal operation, not an error case.
 */

// The Stripe SDK's signature verification needs Node's crypto, not the edge
// runtime's subset.
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[billing] STRIPE_WEBHOOK_SECRET is not set — refusing to trust any event.");
    return NextResponse.json({ error: "Webhook not configured." }, { status: 503 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature." }, { status: 400 });
  }

  // Raw bytes, exactly as sent. See note 2 above.
  const raw = await req.text();

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(raw, signature, secret);
  } catch (err) {
    console.warn("[billing] Rejected a webhook with a bad signature:", err);
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  // Claim the event before doing any work. The unique primary key is what
  // makes a redelivery a no-op: if this insert loses the race, another
  // delivery of the same event is already being handled.
  try {
    await prisma.stripeEvent.create({ data: { id: event.id, type: event.type } });
  } catch {
    return NextResponse.json({ received: true, duplicate: true });
  }

  if (!HANDLED_EVENTS.has(event.type)) {
    return NextResponse.json({ received: true, ignored: event.type });
  }

  try {
    const subscriptionId = subscriptionIdFor(event);
    if (!subscriptionId) {
      // A one-off invoice with no subscription, for instance. Nothing to do.
      return NextResponse.json({ received: true, ignored: "no subscription" });
    }
    // Re-fetch rather than trusting the payload — see syncSubscriptionById.
    await syncSubscriptionById(subscriptionId);
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error(`[billing] Failed to handle ${event.type} (${event.id}):`, err);
    // Release the claim so Stripe's retry can have another go — otherwise a
    // transient failure would be permanently deduplicated away.
    await prisma.stripeEvent.delete({ where: { id: event.id } }).catch(() => {});
    return NextResponse.json({ error: "Handler failed." }, { status: 500 });
  }
}
