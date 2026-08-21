import { Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UpgradeButton } from "@/components/billing/billing-actions";
import { PRIMARY_CTA_CLASS } from "@/lib/cta";
import { PLANS, formatPerGamePrice, formatPlanPrice, type QuotaView } from "@/lib/plans";

/**
 * Free versus Pro, side by side.
 *
 * The decision someone is actually making is 5 games against 30, so the two
 * plans sit next to each other and answer it in a glance rather than making
 * anyone hold one page in their head while reading another. Pro carries all
 * the visual weight — tint, ring, the recommended tag, and the only filled
 * button on the page — because a comparison with two equally-styled options
 * is a quiz, not an offer.
 *
 * Every claim is checked against PLANS, including the multiplier and the
 * per-game price, so the marketing copy cannot drift away from what is
 * actually charged and enforced.
 */
export function PlanComparison({
  quota,
  configured,
}: {
  quota: QuotaView;
  configured: boolean;
}) {
  const multiplier = PLANS.pro.monthlyGames / PLANS.free.monthlyGames;

  return (
    <>
        {/* A two-column comparison rather than a lone feature list: the
            point people are actually deciding is 5 versus 30, and putting
            the plans side by side answers that in one glance. Pro carries
            the visual weight — ring, tint, and the only filled button on
            the page — so there's never a question which one is on offer. */}
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Card className="opacity-80">
            <CardHeader>
              <p className="text-xs font-medium uppercase tracking-wide text-stone-500">
                Your plan
              </p>
              <CardTitle className="font-heading text-2xl">Free</CardTitle>
              <p className="text-sm text-muted-foreground">
                {PLANS.free.monthlyGames} games analyzed a month
              </p>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <PlanPoint>{PLANS.free.monthlyGames} games a month</PlanPoint>
                <PlanPoint>Written explanation for every key moment</PlanPoint>
                <PlanPoint>Unlimited importing and Chess.com sync</PlanPoint>
              </ul>
            </CardContent>
          </Card>

          <Card className="border-primary/40 bg-primary/[0.04] ring-2 ring-primary/20">
            <CardHeader>
              {/* In the normal flow, not absolutely positioned: the Card
                  primitive sets overflow-hidden, so a negatively-offset
                  badge gets clipped in half. */}
              <div className="flex items-center gap-2">
                <p className="text-xs font-medium uppercase tracking-wide text-primary">Upgrade</p>
                <span className="rounded-4xl bg-primary px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-primary-foreground">
                  Recommended
                </span>
              </div>
              <CardTitle className="font-heading text-2xl">
                Pro{" "}
                <span className="text-base font-normal text-muted-foreground">
                  · {formatPlanPrice(PLANS.pro)}
                </span>
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {PLANS.pro.monthlyGames} games a month — about{" "}
                <span className="font-medium text-foreground">
                  {formatPerGamePrice(PLANS.pro)} a game
                </span>
              </p>
            </CardHeader>
            <CardContent className="space-y-5">
              <ul className="space-y-2 text-sm text-muted-foreground">
                <PlanPoint strong>
                  {PLANS.pro.monthlyGames} games a month — {multiplier}×
                  the free allowance, roughly a game a day
                </PlanPoint>
                <PlanPoint>Written explanation for every key moment</PlanPoint>
                <PlanPoint>Unlimited importing and Chess.com sync</PlanPoint>
                <PlanPoint>Cancel any time — you keep Pro till the period ends</PlanPoint>
              </ul>

              <div className="space-y-2">
                <UpgradeButton
                  disabled={!configured}
                  size="lg"
                  className={PRIMARY_CTA_CLASS}
                  label={`Upgrade to Pro — ${formatPlanPrice(PLANS.pro)}`}
                />
                <p className="text-xs text-stone-500">
                  Secure checkout by Stripe. We never see your card details.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
            You&apos;ve analyzed {quota.used} game{quota.used === 1 ? "" : "s"} this month.{" "}
            <span className="text-foreground">
              On Pro you&apos;d still have {PLANS.pro.monthlyGames - quota.used} left.
            </span>
        </p>
    </>
  );
}

/** One line of a plan's feature list. */
function PlanPoint({ children, strong = false }: { children: React.ReactNode; strong?: boolean }) {
  return (
    <li className="flex items-start gap-2">
      <Check className="mt-0.5 size-4 shrink-0 text-success" />
      <span className={strong ? "font-medium text-foreground" : undefined}>{children}</span>
    </li>
  );
}
