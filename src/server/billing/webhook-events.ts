import type Stripe from "stripe";

/**
 * Deciding which subscription a webhook event is about.
 *
 * Split out of the route so it can be tested without a signed request or a
 * Stripe client: the event shapes are the fiddly part, not the plumbing.
 */

/** Events worth acting on. Everything else is acknowledged and ignored. */
export const HANDLED_EVENTS: ReadonlySet<string> = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
]);

/**
 * The subscription an invoice belongs to.
 *
 * On current API versions an Invoice has no top-level `subscription` field —
 * it hangs off `parent.subscription_details.subscription`. The legacy field
 * is still checked second, so pinning an older API version doesn't break
 * this.
 */
export function subscriptionIdFromInvoice(invoice: Stripe.Invoice): string | null {
  const fromParent = invoice.parent?.subscription_details?.subscription;
  if (fromParent) return typeof fromParent === "string" ? fromParent : fromParent.id;

  const legacy = (invoice as unknown as { subscription?: string | { id: string } }).subscription;
  if (legacy) return typeof legacy === "string" ? legacy : legacy.id;

  return null;
}

/** Pull the subscription id out of whichever object this event carries. */
export function subscriptionIdFor(event: Stripe.Event): string | null {
  switch (event.type) {
    case "checkout.session.completed": {
      const sub = event.data.object.subscription;
      return typeof sub === "string" ? sub : (sub?.id ?? null);
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      return event.data.object.id;
    case "invoice.paid":
    case "invoice.payment_failed":
      return subscriptionIdFromInvoice(event.data.object);
    default:
      return null;
  }
}
