"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * The two buttons that hand a person over to Stripe.
 *
 * Both routes return a URL rather than redirecting, so a failure can be
 * shown here instead of navigating the user into an error page. The pending
 * state is never cleared on success: the browser is leaving for Stripe, and
 * flipping the label back to "Upgrade" during that beat looks like the click
 * didn't register.
 */
function useStripeRedirect(endpoint: string, failureMessage: string) {
  const [pending, setPending] = useState(false);

  async function go() {
    setPending(true);
    try {
      const res = await fetch(endpoint, { method: "POST" });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.url) {
        toast.error(body?.error ?? failureMessage);
        setPending(false);
        return;
      }
      window.location.href = body.url;
    } catch {
      toast.error(failureMessage);
      setPending(false);
    }
  }

  return { pending, go };
}

export function UpgradeButton({
  label = "Upgrade to Pro — $8/month",
  size = "default",
  className,
  disabled = false,
}: {
  label?: string;
  size?: "sm" | "default" | "lg";
  className?: string;
  disabled?: boolean;
}) {
  const { pending, go } = useStripeRedirect(
    "/api/billing/checkout",
    "Couldn't start checkout. Try again."
  );

  return (
    <Button onClick={go} disabled={pending || disabled} size={size} className={className}>
      {pending ? "Opening checkout…" : label}
    </Button>
  );
}

export function ManageSubscriptionButton({ className }: { className?: string }) {
  const { pending, go } = useStripeRedirect(
    "/api/billing/portal",
    "Couldn't open the billing portal. Try again."
  );

  return (
    <Button onClick={go} disabled={pending} variant="outline" className={className}>
      {pending ? "Opening…" : "Manage subscription"}
    </Button>
  );
}
