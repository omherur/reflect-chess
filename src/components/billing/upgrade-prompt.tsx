import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { UsageMeter } from "@/components/billing/usage-meter";
import { PRIMARY_CTA_CLASS } from "@/lib/cta";
import { PLANS, formatPerGamePrice, formatPlanPrice, type QuotaView } from "@/lib/plans";
import { cn } from "@/lib/utils";
import { Sparkles } from "lucide-react";

/**
 * The dashboard's upgrade prompt, which escalates with how much allowance is
 * actually left.
 *
 * The escalation is the whole design. A permanent hard sell on a tool you're
 * trying to think inside of is the fastest way to make someone resent it, and
 * it clashes with a product whose entire visual language is "an old chess
 * book". So this stays a quiet status line while there's plenty of room, and
 * only becomes an actual pitch as the limit approaches — at the point where
 * the offer is genuinely useful rather than an interruption.
 *
 * Everything it claims is derived from real numbers: the count, the reset
 * date, the per-game price. There is no invented social proof, no fake
 * urgency and no countdown, because the moment one number here is theatre the
 * others stop being believed too.
 *
 * Subscribers see the meter and nothing else. Nobody should be sold something
 * they already bought.
 */
export function UpgradePrompt({ quota }: { quota: QuotaView }) {
  if (quota.plan === "pro") {
    return (
      <Card className="mb-6">
        <CardContent>
          <UsageMeter quota={quota} />
        </CardContent>
      </Card>
    );
  }

  const spent = quota.remaining === 0;
  const running_low = !spent && quota.remaining <= 2;

  // Calm: a status line with an unobtrusive way through to the offer.
  if (!spent && !running_low) {
    return (
      <Card className="mb-6">
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <UsageMeter quota={quota} className="flex-1" />
          <Link href="/billing" className="shrink-0">
            <Button variant="outline" size="sm">
              Get {PLANS.pro.monthlyGames} a month
            </Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className={cn(
        "mb-6 border-l-4",
        spent ? "border-l-destructive" : "border-l-severity-mistake"
      )}
    >
      <CardContent className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex-1 space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 shrink-0 text-primary" />
            <h2 className="font-heading text-lg font-semibold tracking-tight">
              {spent
                ? `You've analyzed all ${quota.limit} games included this month`
                : `${quota.remaining} game${quota.remaining === 1 ? "" : "s"} left this month`}
            </h2>
          </div>

          <p className="max-w-prose text-sm text-muted-foreground">
            {spent ? (
              <>
                Your free allowance resets on {quota.resetsAtLabel}.{" "}
                <span className="text-foreground">
                  Pro would give you {PLANS.pro.monthlyGames - quota.limit} more games right now
                </span>{" "}
                — every one with the same written explanation for each key moment.
              </>
            ) : (
              <>
                Pro raises that to {PLANS.pro.monthlyGames} games a month —{" "}
                <span className="text-foreground">
                  {formatPlanPrice(PLANS.pro)}, about {formatPerGamePrice(PLANS.pro)} a game
                </span>{" "}
                — which is roughly a game a day, every day.
              </>
            )}
          </p>

          <UsageMeter quota={quota} showReset={false} className="max-w-sm" />
        </div>

        <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
          <Link href="/billing">
            <Button size="lg" className={PRIMARY_CTA_CLASS}>
              Upgrade to Pro
            </Button>
          </Link>
          {/* Risk reversal, and it's true — cancelling is one click in the
              Stripe portal, and access runs to the end of the period. */}
          <p className="text-center text-xs text-stone-500 sm:text-right">
            Cancel any time · keep Pro till the period ends
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
