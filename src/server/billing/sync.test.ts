import { describe, it, expect } from "vitest";
import type Stripe from "stripe";
import { prisma } from "@/lib/db";
import { applySubscription, periodEndFrom, priceIdFrom } from "./sync";

/**
 * The mirror. The field that has actually broken integrations here is
 * `current_period_end`: Stripe moved it off the Subscription and onto its
 * items in API version 2025-04-30, so the obvious reading silently yields
 * undefined and stamps an Invalid Date onto the row.
 */

let counter = 0;
function fakeSubscription(over: Record<string, unknown> = {}): Stripe.Subscription {
  return {
    id: `sub_${++counter}`,
    object: "subscription",
    customer: "cus_test",
    status: "active",
    cancel_at_period_end: false,
    metadata: {},
    items: {
      object: "list",
      data: [
        {
          id: "si_1",
          object: "subscription_item",
          price: { id: "price_pro" },
          current_period_end: 1793491200, // 2026-11-01T00:00:00Z
        },
      ],
    },
    ...over,
  } as unknown as Stripe.Subscription;
}

describe("periodEndFrom", () => {
  it("reads the period end off the subscription ITEM, not the subscription", () => {
    expect(periodEndFrom(fakeSubscription())?.toISOString()).toBe("2026-11-01T00:00:00.000Z");
  });

  it("ignores a legacy top-level current_period_end", () => {
    // A subscription-level value must not win over the item's — that's the
    // field modern API versions no longer send.
    const sub = fakeSubscription({ current_period_end: 1 });
    expect(periodEndFrom(sub)?.toISOString()).toBe("2026-11-01T00:00:00.000Z");
  });

  it("takes the latest across multiple items", () => {
    const sub = fakeSubscription({
      items: {
        object: "list",
        data: [
          { id: "si_1", price: { id: "a" }, current_period_end: 1793491200 },
          { id: "si_2", price: { id: "b" }, current_period_end: 1796169600 },
        ],
      },
    });
    expect(periodEndFrom(sub)?.toISOString()).toBe("2026-12-02T00:00:00.000Z");
  });

  it("returns null rather than an Invalid Date when there is nothing to read", () => {
    expect(periodEndFrom(fakeSubscription({ items: { object: "list", data: [] } }))).toBeNull();
  });
});

describe("priceIdFrom", () => {
  it("reads the price off the first item", () => {
    expect(priceIdFrom(fakeSubscription())).toBe("price_pro");
  });
});

describe("applySubscription", () => {
  async function freshUser(data: Record<string, unknown> = {}) {
    return prisma.user.create({
      data: { name: `sync-${Date.now()}-${++counter}`, ...data },
    });
  }

  it("mirrors status, price, period end and cancel flag onto the user", async () => {
    const user = await freshUser({ stripeCustomerId: `cus_${counter}_a` });
    const sub = fakeSubscription({ customer: user.stripeCustomerId, status: "active" });

    const updated = await applySubscription(sub);
    expect(updated?.id).toBe(user.id);
    expect(updated?.subscriptionStatus).toBe("active");
    expect(updated?.subscriptionPriceId).toBe("price_pro");
    expect(updated?.currentPeriodEnd?.toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(updated?.cancelAtPeriodEnd).toBe(false);
    expect(updated?.stripeSubscriptionId).toBe(sub.id);
  });

  it("resolves by metadata.appUserId when the customer id isn't on the row yet", async () => {
    const user = await freshUser();
    const orphanCustomerId = `cus_orphan_${user.id}`;
    const sub = fakeSubscription({
      customer: orphanCustomerId,
      metadata: { appUserId: user.id },
    });

    const updated = await applySubscription(sub);
    expect(updated?.id).toBe(user.id);
    // and it backfills the customer id it just learned
    expect(updated?.stripeCustomerId).toBe(orphanCustomerId);
  });

  it("records a cancellation scheduled for the period end", async () => {
    const user = await freshUser({ stripeCustomerId: `cus_${counter}_b` });
    const updated = await applySubscription(
      fakeSubscription({ customer: user.stripeCustomerId, cancel_at_period_end: true })
    );
    expect(updated?.cancelAtPeriodEnd).toBe(true);
    // Still active until the period actually ends.
    expect(updated?.subscriptionStatus).toBe("active");
  });

  it("records a deletion as canceled", async () => {
    const user = await freshUser({ stripeCustomerId: `cus_${counter}_c` });
    const updated = await applySubscription(
      fakeSubscription({ customer: user.stripeCustomerId, status: "canceled" })
    );
    expect(updated?.subscriptionStatus).toBe("canceled");
  });

  it("is a no-op for a customer nobody local owns", async () => {
    const result = await applySubscription(
      fakeSubscription({ customer: "cus_nobody_at_all", metadata: {} })
    );
    expect(result).toBeNull();
  });
});
