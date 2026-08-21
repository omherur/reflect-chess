import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { appUrl, getStripe, stripeEnabled } from "@/server/stripe/client";

/**
 * Open the Stripe Customer Portal, where people update a card, download
 * invoices, or cancel — none of which this app has to build or hold data for.
 *
 * The portal must be activated once in the Stripe Dashboard (Settings ->
 * Billing -> Customer portal). Until it is, session creation fails with a
 * configuration error rather than anything to do with this code.
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

  // Never subscribed, so there is nothing to manage. 404 rather than 403,
  // matching how the rest of the app answers "not yours / not there".
  if (!user.stripeCustomerId) {
    return NextResponse.json({ error: "No billing account to manage yet." }, { status: 404 });
  }

  try {
    const session = await getStripe().billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${appUrl()}/billing`,
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[billing] Portal session creation failed:", err);
    return NextResponse.json(
      { error: stripeErrorMessage(err, "Couldn't open the billing portal. Try again.") },
      { status: 502 }
    );
  }
}
