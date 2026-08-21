"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

/**
 * Says something when someone lands back from Stripe.
 *
 * The success case is deliberately hedged. Access is granted by the webhook,
 * which is asynchronous — the browser can easily arrive here before the
 * event does, so claiming "you're on Pro" outright would sometimes be
 * contradicted by the plan card rendered directly beneath it.
 *
 * The ref guards against firing twice under React's development
 * double-invoked effects.
 */
export function CheckoutToast({ status }: { status?: string }) {
  const fired = useRef(false);

  useEffect(() => {
    if (!status || fired.current) return;
    fired.current = true;

    if (status === "success") {
      toast.success("Payment received — setting up your subscription.", {
        description: "This can take a few seconds. Refresh if the plan below still says Free.",
      });
    } else if (status === "cancelled") {
      toast("Checkout cancelled. Nothing was charged.");
    }
  }, [status]);

  return null;
}
