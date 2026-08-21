import Link from "next/link";
import { cn } from "@/lib/utils";
import type { QuotaView } from "@/lib/plans";

/**
 * The always-visible plan chip in the header.
 *
 * Its job is to answer "which plan am I on, and how much have I got left"
 * without anyone having to go looking — the previous version of this had the
 * answer buried two clicks away on a page most people would never open, which
 * is the actual reason upgrading felt hidden.
 *
 * For free accounts it doubles as the standing entry point to the offer, and
 * it shows the real remaining count. That count is honest scarcity: it's the
 * same number the server enforces, so it earns attention as it drops instead
 * of manufacturing it.
 *
 * Subscribers get a plain "Pro" chip with no number and nothing to click
 * through to — a paying customer shouldn't be shown a running meter of what
 * they're allowed.
 */
export function PlanBadge({ quota }: { quota: QuotaView }) {
  if (quota.plan === "pro") {
    return (
      <span className="hidden items-center rounded-4xl border border-success/30 bg-success/10 px-2 py-0.5 text-xs font-medium text-success sm:inline-flex">
        Pro
      </span>
    );
  }

  const spent = quota.remaining === 0;

  return (
    <Link
      href="/billing"
      className={cn(
        "hidden items-center gap-1.5 rounded-4xl border px-2.5 py-0.5 text-xs font-medium transition-colors sm:inline-flex",
        spent
          ? "border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20"
          : "border-primary/30 bg-primary/5 text-primary hover:bg-primary/15"
      )}
      title={
        spent
          ? `You've analyzed all ${quota.limit} games included this month. Resets on ${quota.resetsAtLabel}.`
          : `${quota.remaining} of ${quota.limit} games left this month. Resets on ${quota.resetsAtLabel}.`
      }
    >
      <span>Free</span>
      <span aria-hidden className="opacity-40">
        ·
      </span>
      <span className="tabular-nums">
        {spent ? "0 left" : `${quota.remaining} left`}
      </span>
    </Link>
  );
}
