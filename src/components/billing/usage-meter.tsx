import { cn } from "@/lib/utils";
import type { QuotaView } from "@/lib/plans";

/**
 * "3 of 5 games analyzed this month", with a bar.
 *
 * Shared by the billing page and the dashboard so the number a person sees
 * in two places is rendered by one piece of code. Presentational only — it
 * takes the already-computed allowance and draws it.
 *
 * The bar warms from walnut to ochre to oxblood as the allowance runs out,
 * reusing the severity palette the rest of the app already reads as
 * "attention" rather than inventing a new colour language for billing.
 * Oxblood is --destructive rather than a severity-blunder token, because
 * BLUNDER deliberately shares --destructive (see globals.css) and both have
 * dedicated dark-mode values, so this stays WCAG-AA in either theme.
 */
export function UsageMeter({
  quota,
  className,
  showReset = true,
}: {
  quota: QuotaView;
  className?: string;
  showReset?: boolean;
}) {
  const pct = quota.limit === 0 ? 0 : Math.min(100, Math.round((quota.used / quota.limit) * 100));
  const spent = quota.remaining === 0;
  const nearlySpent = !spent && quota.remaining <= Math.max(1, Math.floor(quota.limit * 0.2));

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium">
          <span className="tabular-nums">{quota.used}</span> of{" "}
          <span className="tabular-nums">{quota.limit}</span> games analyzed this month
        </span>
        <span
          className={cn(
            "tabular-nums text-xs",
            spent ? "font-medium text-destructive" : "text-stone-500"
          )}
        >
          {spent ? "none left" : `${quota.remaining} left`}
        </span>
      </div>

      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={quota.used}
        aria-valuemin={0}
        aria-valuemax={quota.limit}
        aria-label="Games analyzed this month"
      >
        <div
          className={cn(
            "h-full rounded-full transition-all",
            spent
              ? "bg-destructive"
              : nearlySpent
                ? "bg-severity-mistake"
                : "bg-primary"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>

      {showReset && (
        <p className="text-xs text-stone-500">
          {spent ? "Resets" : "Allowance resets"} on {quota.resetsAtLabel}.
        </p>
      )}
    </div>
  );
}
