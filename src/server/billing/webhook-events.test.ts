import { describe, it, expect } from "vitest";
import type Stripe from "stripe";
import { prisma } from "@/lib/db";
import { HANDLED_EVENTS, subscriptionIdFor, subscriptionIdFromInvoice } from "./webhook-events";

/**
 * Reading a webhook. Getting the subscription id wrong doesn't throw — it
 * just means the event quietly does nothing, and someone who paid never gets
 * access. So the shapes are pinned here, including the one Stripe changed:
 * an invoice no longer carries a top-level `subscription`.
 */

function event(type: string, object: unknown): Stripe.Event {
  return { id: `evt_${type}`, type, data: { object } } as unknown as Stripe.Event;
}

describe("subscriptionIdFor", () => {
  it("reads a completed checkout session (subscription as an id)", () => {
    expect(subscriptionIdFor(event("checkout.session.completed", { subscription: "sub_1" }))).toBe(
      "sub_1"
    );
  });

  it("reads a completed checkout session (subscription expanded)", () => {
    expect(
      subscriptionIdFor(event("checkout.session.completed", { subscription: { id: "sub_2" } }))
    ).toBe("sub_2");
  });

  it("returns null for a one-off payment session with no subscription", () => {
    expect(subscriptionIdFor(event("checkout.session.completed", { subscription: null }))).toBeNull();
  });

  it("reads the subscription's own id on subscription events", () => {
    for (const type of [
      "customer.subscription.created",
      "customer.subscription.updated",
      "customer.subscription.deleted",
    ]) {
      expect(subscriptionIdFor(event(type, { id: "sub_3" }))).toBe("sub_3");
    }
  });

  it("reads an invoice through parent.subscription_details, not a top-level field", () => {
    // The shape current API versions actually send.
    const invoice = { parent: { subscription_details: { subscription: "sub_4" } } };
    expect(subscriptionIdFor(event("invoice.paid", invoice))).toBe("sub_4");
    expect(subscriptionIdFor(event("invoice.payment_failed", invoice))).toBe("sub_4");
  });

  it("still reads the legacy top-level invoice.subscription", () => {
    expect(subscriptionIdFor(event("invoice.paid", { subscription: "sub_5" }))).toBe("sub_5");
  });

  it("returns null for an invoice with no subscription at all", () => {
    expect(subscriptionIdFor(event("invoice.paid", { parent: null }))).toBeNull();
    expect(subscriptionIdFromInvoice({} as Stripe.Invoice)).toBeNull();
  });

  it("ignores event types we don't handle", () => {
    expect(subscriptionIdFor(event("charge.succeeded", { id: "ch_1" }))).toBeNull();
    expect(HANDLED_EVENTS.has("charge.succeeded")).toBe(false);
  });

  it("handles exactly the events that provision or revoke access", () => {
    expect([...HANDLED_EVENTS].sort()).toEqual([
      "checkout.session.completed",
      "customer.subscription.created",
      "customer.subscription.deleted",
      "customer.subscription.updated",
      "invoice.paid",
      "invoice.payment_failed",
    ]);
  });
});

describe("event deduplication", () => {
  /**
   * Stripe retries for up to three days, so the same event id arriving twice
   * is routine. The webhook route claims an event by inserting its id and
   * treats a collision as "already handled" — this pins that the constraint
   * is really there to be collided with.
   */
  it("rejects a second insert of the same event id", async () => {
    const id = `evt_dedupe_${Date.now()}`;
    await prisma.stripeEvent.create({ data: { id, type: "invoice.paid" } });
    await expect(
      prisma.stripeEvent.create({ data: { id, type: "invoice.paid" } })
    ).rejects.toBeTruthy();
    expect(await prisma.stripeEvent.count({ where: { id } })).toBe(1);
  });
});
