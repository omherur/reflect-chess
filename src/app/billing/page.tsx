import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/server/auth";
import { getQuota, toQuotaView } from "@/server/billing/quota";
import { stripeEnabled } from "@/server/stripe/client";
import { PLANS, formatPlanPrice, isEntitled, needsPaymentAttention } from "@/lib/plans";
import { UsageMeter } from "@/components/billing/usage-meter";
import { ManageSubscriptionButton } from "@/components/billing/billing-actions";
import { PlanComparison } from "@/components/billing/plan-comparison";
import { CheckoutToast } from "@/components/billing/checkout-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

/** "1 September 2026" — a period end is far enough off to want the year. */
function formatLongDate(date: Date): string {
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { checkout } = await searchParams;
  const quota = toQuotaView(await getQuota(user));
  const subscribed = isEntitled(user.subscriptionStatus);
  const paymentTrouble = needsPaymentAttention(user.subscriptionStatus);
  const configured = stripeEnabled();

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      <CheckoutToast status={checkout} />

      <h1 className="font-heading text-3xl font-semibold tracking-tight">Plan &amp; billing</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Analysis is what costs us — a full engine scan of every position, then a written
        explanation for each key moment. Importing and syncing games is always free and
        unlimited.
      </p>

      {/* A failing renewal is the one thing worth interrupting for: access is
          still on, but it won't be unless a card gets fixed. */}
      {paymentTrouble && (
        <div className="mt-6 rounded-md border border-severity-mistake/40 bg-severity-mistake/10 p-4">
          <p className="text-sm font-medium">Your last payment didn&apos;t go through.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            You still have Pro for now while the card is retried. Update your payment method to
            avoid losing it.
          </p>
        </div>
      )}

      <Card className="mt-6">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="font-heading text-xl">
              {subscribed ? PLANS.pro.label : PLANS.free.label} plan
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {subscribed
                ? `${formatPlanPrice(PLANS.pro)} · ${PLANS.pro.monthlyGames} games analyzed per month`
                : `Free · ${PLANS.free.monthlyGames} games analyzed per month`}
            </p>
          </div>
          {subscribed && (
            <Badge variant={paymentTrouble ? "secondary" : "success"}>
              {paymentTrouble ? "Payment failing" : "Active"}
            </Badge>
          )}
        </CardHeader>

        <CardContent className="space-y-5">
          <UsageMeter quota={quota} />

          {subscribed && user.currentPeriodEnd && (
            <p className="text-sm text-muted-foreground">
              {user.cancelAtPeriodEnd
                ? `Your subscription ends on ${formatLongDate(user.currentPeriodEnd)}. You keep Pro until then, and drop to ${PLANS.free.monthlyGames} games a month afterwards.`
                : `Renews on ${formatLongDate(user.currentPeriodEnd)}.`}
            </p>
          )}

          {/* Only subscribers get an action here. For a free account the
              single call to action lives in the comparison below — two
              upgrade buttons on one page compete with each other and make
              neither feel like the obvious next step. */}
          <div className="flex flex-wrap items-center gap-3">
            {subscribed && <ManageSubscriptionButton />}
            <Link href="/">
              <Button variant="ghost">Back to dashboard</Button>
            </Link>
          </div>

          {!configured && !subscribed && (
            <p className="text-sm text-destructive">
              Billing isn&apos;t configured on this server yet — STRIPE_SECRET_KEY and
              STRIPE_PRICE_ID_PRO need to be set, and the server restarted.
            </p>
          )}
        </CardContent>
      </Card>

      {!subscribed && <PlanComparison quota={quota} configured={configured} />}
    </div>
  );
}
