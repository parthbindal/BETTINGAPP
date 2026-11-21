"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PLANS, TIER_ORDER, type Tier } from "@/lib/subscriptions/plans";

/**
 * Plan call-to-action. Never starts a charge unless Stripe is configured; an
 * existing Stripe subscriber is sent to the billing portal to change plans.
 */
export function CheckoutButton({ tier, configured, signedIn, currentTier, hasStripeSubscription = false, label }: { tier: Tier; configured: boolean; signedIn: boolean; currentTier?: Tier; hasStripeSubscription?: boolean; label?: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const isCurrent = currentTier === tier;
  const isDowngrade = currentTier ? TIER_ORDER.indexOf(tier) < TIER_ORDER.indexOf(currentTier) : false;

  async function go() {
    if (!signedIn) {
      router.push(`/sign-up?next=${encodeURIComponent("/pricing")}`);
      return;
    }
    if (tier === "free" && !hasStripeSubscription) {
      router.push("/overview");
      return;
    }
    if (!configured) {
      toast.info("Billing is not configured on this deployment yet. No charge can occur.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(hasStripeSubscription ? "/api/stripe/portal" : "/api/stripe/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tier }) });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? "Checkout failed");
      window.location.href = data.url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Checkout failed");
    } finally {
      setLoading(false);
    }
  }

  const text = isCurrent
    ? "Current plan"
    : label ??
      (tier === "free"
        ? signedIn
          ? hasStripeSubscription
            ? "Downgrade in billing portal"
            : "Go to dashboard"
          : "Start free"
        : !configured
          ? `${isDowngrade ? "Switch" : "Upgrade"} to ${PLANS[tier].name} (billing not configured)`
          : hasStripeSubscription
            ? `${isDowngrade ? "Downgrade" : "Upgrade"} to ${PLANS[tier].name} in billing portal`
            : `Upgrade to ${PLANS[tier].name}`);

  return (
    <Button onClick={go} disabled={loading || isCurrent} className="w-full" variant={tier === "pro" ? "default" : "outline"}>
      {loading ? "Redirecting…" : text}
    </Button>
  );
}
