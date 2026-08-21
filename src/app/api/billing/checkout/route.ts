import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { getOrCreateStripeCustomer } from "@/server/billing/sync";
import { appUrl, getStripe, proPriceId, stripeEnabled } from "@/server/stripe/client";
import { isEntitled } from "@/lib/plans";

/**
 * Start a Stripe-hosted Checkout for the Pro plan and hand back the URL to
 * redirect to.
 *
 * Hosted Checkout rather than an embedded form: Stripe then owns the card
 * fields, SCA, wallets and PCI scope, and this app never sees a card number.
 * The response is a URL rather than a redirect so the client can surface an
 * error inline instead of navigating away into one.
 */
/**
 * What to tell the caller when Stripe rejects a request.
 *
 * Stripe's own message for a misconfiguration is specific and actionable
 * ("the product tax code is missing", "the customer portal is not
 * configured") — and swallowing it behind a generic retry prompt is exactly
 * what turns a five-minute dashboard fix into an unexplained dead button.
 * But those messages name account internals, so they're only surfaced
 * outside production; real users still get the plain sentence.
 */
function stripeErrorMessage(err: unknown, fallback: string): string {
  if (process.env.NODE_ENV === "production") return fallback;
  const message = err instanceof Error ? err.message : "";
  return message ? `${fallback} Stripe said: ${message}` : fallback;
}

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  if (!stripeEnabled()) {
    return NextResponse.json(
      { error: "Billing isn't configured on this server yet." },
      { status: 503 }
    );
  }

  // Don't sell a second subscription to someone who already has one — send
  // them to the portal to change it instead.
  if (isEntitled(user.subscriptionStatus)) {
    return NextResponse.json(
      { error: "You're already subscribed. Manage your plan from the billing page." },
      { status: 409 }
    );
  }

  try {
    const customerId = await getOrCreateStripeCustomer(user);

    const session = await getStripe().checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: proPriceId(), quantity: 1 }],
      // Both are belt and braces for reconciliation: client_reference_id ties
      // the session back to this account, and the subscription metadata
      // survives onto the Subscription object itself, which is what the
      // webhook resolves against if the customer id mapping is ever missing.
      client_reference_id: user.id,
      subscription_data: { metadata: { appUserId: user.id } },
      allow_promotion_codes: true,
      success_url: `${appUrl()}/billing?checkout=success`,
      cancel_url: `${appUrl()}/billing?checkout=cancelled`,
    });

    if (!session.url) {
      return NextResponse.json({ error: "Stripe didn't return a checkout URL." }, { status: 502 });
    }
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[billing] Checkout session creation failed:", err);
    return NextResponse.json(
      { error: stripeErrorMessage(err, "Couldn't start checkout. Try again.") },
      { status: 502 }
    );
  }
}
