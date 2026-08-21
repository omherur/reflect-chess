import { describe, it, expect } from "vitest";
import {
  PLANS,
  planForStatus,
  isEntitled,
  needsPaymentAttention,
  formatPlanPrice,
} from "./plans";

/**
 * The status -> plan mapping is the entire paywall in one function, so the
 * cases that matter are the ones where getting it wrong costs real money or
 * real goodwill: cutting someone off mid-retry, or serving Pro to a
 * subscription that never paid.
 */

describe("plan definitions", () => {
  it("matches what the pricing page promises", () => {
    expect(PLANS.free.monthlyGames).toBe(5);
    expect(PLANS.pro.monthlyGames).toBe(30);
    expect(PLANS.pro.priceCents).toBe(800);
  });

  it("formats price without a stray .00", () => {
    expect(formatPlanPrice(PLANS.pro)).toBe("$8/month");
    expect(formatPlanPrice(PLANS.free)).toBe("Free");
  });
});

describe("planForStatus", () => {
  it("grants pro while the subscription is good", () => {
    expect(planForStatus("active")).toBe("pro");
    expect(planForStatus("trialing")).toBe("pro");
  });

  it("keeps pro during past_due, while Stripe is still retrying the card", () => {
    // Cutting access at the first decline would punish someone for a card
    // that's about to be retried successfully.
    expect(planForStatus("past_due")).toBe("pro");
    expect(needsPaymentAttention("past_due")).toBe(true);
  });

  it("revokes once payment has been retried to exhaustion", () => {
    expect(planForStatus("canceled")).toBe("free");
    expect(planForStatus("unpaid")).toBe("free");
  });

  it("does not grant pro to a subscription that never completed its first payment", () => {
    expect(planForStatus("incomplete")).toBe("free");
    expect(planForStatus("incomplete_expired")).toBe("free");
    expect(planForStatus("paused")).toBe("free");
  });

  it("fails closed on anything unrecognised", () => {
    expect(planForStatus(null)).toBe("free");
    expect(planForStatus(undefined)).toBe("free");
    expect(planForStatus("")).toBe("free");
    expect(planForStatus("ACTIVE")).toBe("free"); // Stripe sends lowercase
    expect(planForStatus("a_status_stripe_adds_in_2027")).toBe("free");
  });

  it("isEntitled agrees with planForStatus", () => {
    expect(isEntitled("active")).toBe(true);
    expect(isEntitled("canceled")).toBe(false);
  });

  it("only past_due asks for attention", () => {
    expect(needsPaymentAttention("active")).toBe(false);
    expect(needsPaymentAttention("canceled")).toBe(false);
    expect(needsPaymentAttention(null)).toBe(false);
  });
});
