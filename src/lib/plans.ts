/**
 * The two subscription tiers, and the one question they answer: how many
 * games may this account analyze this calendar month.
 *
 * Analysis is metered rather than import because that's where the money
 * goes — a depth-10 scan of every position plus depth-16 multi-PV on each
 * key moment, and a Claude call per reflection afterwards. Importing is a
 * PGN parse and a few row writes, and Chess.com sync runs automatically on
 * every dashboard load, so metering imports would drain an allowance for
 * simply opening the app.
 *
 * Kept deliberately pure and dependency-free (no Prisma, no Stripe) so the
 * numbers have exactly one home and can be unit-tested on their own.
 */

export type PlanId = "free" | "pro";

export interface Plan {
  id: PlanId;
  label: string;
  /** Games that may be analyzed per calendar month (UTC). */
  monthlyGames: number;
  /** In cents, so there's no floating-point money anywhere. */
  priceCents: number;
}

export const PLANS: Record<PlanId, Plan> = {
  free: { id: "free", label: "Free", monthlyGames: 5, priceCents: 0 },
  pro: { id: "pro", label: "Pro", monthlyGames: 30, priceCents: 800 },
};

/**
 * Stripe subscription statuses that entitle the Pro allowance.
 *
 * "past_due" is deliberately included. It means a renewal payment failed and
 * Stripe is still retrying the card — cutting access at the first decline
 * would punish people for an expired card that's about to be retried
 * successfully. Stripe's own guidance is to revoke on "canceled" and
 * "unpaid", since by the time a subscription reaches either, payment has
 * already been attempted and retried to exhaustion.
 *
 * "incomplete" is excluded: that's a subscription whose very first payment
 * hasn't succeeded yet, so it has never been paid for at all.
 */
const ENTITLED_STATUSES: ReadonlySet<string> = new Set(["active", "trialing", "past_due"]);

/**
 * Which plan a subscription status buys.
 *
 * Fails closed by construction: anything unrecognised — null, an empty
 * string, a status Stripe adds after this was written — reads as Free. A
 * status we don't understand must never be worth more than one we do.
 */
export function planForStatus(status: string | null | undefined): PlanId {
  return status && ENTITLED_STATUSES.has(status) ? "pro" : "free";
}

/** True while a subscription still entitles Pro. */
export function isEntitled(status: string | null | undefined): boolean {
  return planForStatus(status) === "pro";
}

/**
 * True when the subscription is in trouble and the user should be told —
 * they still have access, but a payment is failing and it won't last.
 */
export function needsPaymentAttention(status: string | null | undefined): boolean {
  return status === "past_due";
}

/** "$8/month", "Free" — one formatting rule, used by every surface. */
export function formatPlanPrice(plan: Plan): string {
  if (plan.priceCents === 0) return "Free";
  const dollars = plan.priceCents / 100;
  const amount = Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
  return `${amount}/month`;
}

/**
 * The price expressed per analyzed game — "27¢" rather than "$8".
 *
 * Anchoring a subscription against its unit of value is the honest version
 * of a pricing tactic: $8/month is an abstract commitment, 27¢ a game is
 * comparable to something the reader already understands. Derived from the
 * real numbers, so it can't drift out of step with what's charged.
 */
export function formatPerGamePrice(plan: Plan): string {
  if (plan.priceCents === 0 || plan.monthlyGames === 0) return "Free";
  return `${Math.round(plan.priceCents / plan.monthlyGames)}¢`;
}

/**
 * The allowance as it crosses the wire.
 *
 * A separate shape from the server-side Quota because that one carries a
 * Date, and Dates become strings the moment they're JSON-serialized — a
 * client typed against the server shape would think it had a Date and call
 * methods that aren't there. The pre-rendered label lives here too so the
 * date is formatted in UTC once, on the server, rather than in whatever
 * timezone each visitor's browser happens to be in.
 */
export interface QuotaView {
  plan: PlanId;
  planLabel: string;
  limit: number;
  used: number;
  remaining: number;
  /** ISO 8601. */
  resetsAt: string;
  /** Already formatted for prose, e.g. "1 September". */
  resetsAtLabel: string;
}
