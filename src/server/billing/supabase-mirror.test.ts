import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { User } from "@prisma/client";
import { mirrorSubscription, rowFor, supabaseMirrorEnabled } from "./supabase-mirror";

/**
 * The mirror is a secondary copy, and the property that matters most is a
 * negative one: it must be incapable of breaking anything. A reporting table
 * that takes the webhook down with it would mean a Supabase outage stops
 * paying customers from being provisioned — strictly worse than a stale table.
 */

function user(over: Partial<User> = {}): User {
  return {
    id: "usr_1",
    name: "Player",
    supabaseUserId: "11111111-1111-1111-1111-111111111111",
    email: "player@example.com",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    stripeCustomerId: "cus_1",
    stripeSubscriptionId: "sub_1",
    subscriptionStatus: "active",
    subscriptionPriceId: "price_pro",
    currentPeriodEnd: new Date("2026-09-21T05:49:38Z"),
    cancelAtPeriodEnd: false,
    ...over,
  } as User;
}

const KEY = "SUPABASE_SERVICE_ROLE_KEY";
let saved: string | undefined;
beforeEach(() => {
  saved = process.env[KEY];
  delete process.env[KEY];
});
afterEach(() => {
  if (saved === undefined) delete process.env[KEY];
  else process.env[KEY] = saved;
});

describe("rowFor", () => {
  it("maps the local row onto the mirror columns", () => {
    const row = rowFor(user());
    expect(row).toMatchObject({
      app_user_id: "usr_1",
      supabase_user_id: "11111111-1111-1111-1111-111111111111",
      email: "player@example.com",
      stripe_customer_id: "cus_1",
      stripe_subscription_id: "sub_1",
      status: "active",
      price_id: "price_pro",
      cancel_at_period_end: false,
    });
    // Dates go over the wire as ISO strings, not Date objects.
    expect(row.current_period_end).toBe("2026-09-21T05:49:38.000Z");
    expect(typeof row.synced_at).toBe("string");
  });

  it("denormalises the entitlement, not just the raw status", () => {
    expect(rowFor(user({ subscriptionStatus: "active" })).plan).toBe("pro");
    expect(rowFor(user({ subscriptionStatus: "past_due" })).plan).toBe("pro");
    expect(rowFor(user({ subscriptionStatus: "canceled" })).plan).toBe("free");
    expect(rowFor(user({ subscriptionStatus: null })).plan).toBe("free");
  });

  it("tolerates an account that never authenticated or never paid", () => {
    const row = rowFor(
      user({
        supabaseUserId: null,
        email: null,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        subscriptionStatus: null,
        subscriptionPriceId: null,
        currentPeriodEnd: null,
      })
    );
    expect(row.supabase_user_id).toBeNull();
    expect(row.current_period_end).toBeNull();
    expect(row.plan).toBe("free");
  });
});

describe("fail-safety", () => {
  it("reports itself disabled with no service-role key", () => {
    expect(supabaseMirrorEnabled()).toBe(false);
  });

  it("no-ops instead of throwing when unconfigured", async () => {
    // The whole point: applySubscription awaits this, so a throw here would
    // 500 the webhook and Stripe would retry a provisioning that already
    // succeeded locally.
    await expect(mirrorSubscription(user())).resolves.toBe(false);
  });

  it("does not throw when pointed at an unreachable project", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://nonexistent-project-xyz.supabase.co";
    process.env[KEY] = "not-a-real-key";
    await expect(mirrorSubscription(user())).resolves.toBe(false);
  }, 15000);
});
