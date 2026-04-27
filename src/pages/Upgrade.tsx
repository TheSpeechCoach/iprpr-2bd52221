import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { usePlan, type Plan } from "@/hooks/usePlan";
import { SiteHeader } from "@/components/SiteHeader";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";
import { StripeEmbeddedCheckout } from "@/components/StripeEmbeddedCheckout";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { getStripeEnvironment } from "@/lib/stripe";
import { ArrowLeft, Check, Sparkles } from "lucide-react";

interface Tier {
  key: Plan;
  name: string;
  price: string;
  tagline: string;
  priceId?: string;
  features: string[];
  highlight?: boolean;
}

const TIERS: Tier[] = [
  {
    key: "free",
    name: "Free",
    price: "$0",
    tagline: "Start preparing",
    features: [
      "1 prep session",
      "First 10 questions visible",
      "No answer tiers",
      "No saved answers",
      "No exports",
    ],
  },
  {
    key: "pro",
    name: "Pro",
    price: "$29",
    tagline: "Prepare properly",
    priceId: "pro_monthly",
    highlight: true,
    features: [
      "Unlimited prep sessions",
      "Full 100 questions per pack",
      "All three answer tiers",
      "Save written answers",
      "Progress tracking",
      "PDF & DOCX exports",
    ],
  },
  {
    key: "coach_plus",
    name: "Coach+",
    price: "$79",
    tagline: "Prepare like it matters",
    priceId: "coach_plus_monthly",
    features: [
      "Everything in Pro",
      "Enhanced answer guidance",
      "Reality Check on every answer",
      "Priority AI generation",
      "Live coaching integration (coming soon)",
    ],
  },
];

const Upgrade = () => {
  const { user } = useAuth();
  const { plan, isPaid, refresh } = usePlan();
  const nav = useNavigate();
  const [checkoutPriceId, setCheckoutPriceId] = useState<string | null>(null);
  const [portalBusy, setPortalBusy] = useState(false);

  const openPortal = async () => {
    setPortalBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-portal-session", {
        body: {
          environment: getStripeEnvironment(),
          returnUrl: `${window.location.origin}/upgrade`,
        },
      });
      if (error || !data?.url) throw new Error(error?.message || "Couldn't open portal");
      window.open(data.url, "_blank");
    } catch (e: any) {
      toast({
        title: "Couldn't open billing",
        description: e?.message ?? "Please try again.",
        variant: "destructive",
      });
    } finally {
      setPortalBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <PaymentTestModeBanner />
      <SiteHeader />
      <main className="container-tight flex-1 py-12 max-w-5xl">
        <Link
          to="/dashboard"
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-6"
        >
          <ArrowLeft className="h-3 w-3" /> Back to dashboard
        </Link>

        <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground mb-2 inline-flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-accent" /> Pricing
        </div>
        <h1 className="font-display text-4xl font-semibold leading-tight">
          Choose how seriously you want to prepare
        </h1>
        <p className="mt-3 text-muted-foreground max-w-xl">
          Plain pricing. Cancel anytime. Your access continues until the end of the period you've
          paid for.
        </p>

        {isPaid && (
          <div className="mt-8 border border-border bg-secondary/40 p-5 flex items-center justify-between gap-4 flex-wrap">
            <div className="text-sm">
              <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground block mb-1">
                Current plan
              </span>
              {plan === "coach_plus" ? "Coach+" : "Pro"} — manage billing, invoices, or cancel
              from the Stripe customer portal.
            </div>
            <Button variant="outline" onClick={openPortal} disabled={portalBusy}>
              {portalBusy ? "Opening…" : "Manage billing"}
            </Button>
          </div>
        )}

        <div className="grid md:grid-cols-3 gap-px bg-border border border-border mt-10">
          {TIERS.map((tier) => {
            const isCurrent = tier.key === plan;
            return (
              <div
                key={tier.key}
                className={`bg-background p-8 relative ${
                  tier.highlight ? "border-l border-r border-accent/40 md:border-l-0" : ""
                }`}
              >
                {tier.highlight && (
                  <div className="absolute top-0 right-0 bg-accent text-accent-foreground text-[10px] uppercase tracking-[0.2em] px-2 py-1">
                    Most popular
                  </div>
                )}
                <div
                  className={`text-[10px] uppercase tracking-[0.22em] mb-2 ${
                    tier.highlight ? "text-accent" : "text-muted-foreground"
                  }`}
                >
                  {tier.name}
                </div>
                <div className="font-display text-3xl font-semibold">
                  {tier.price}
                  {tier.key !== "free" && (
                    <span className="text-base text-muted-foreground font-normal"> / month</span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-1">{tier.tagline}</div>

                <ul className="mt-6 space-y-2.5 text-sm">
                  {tier.features.map((f) => (
                    <li key={f} className="flex gap-2.5 items-start">
                      <Check
                        className={`h-4 w-4 mt-0.5 shrink-0 ${
                          tier.highlight ? "text-accent" : "text-foreground"
                        }`}
                        strokeWidth={2}
                      />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-7">
                  {tier.key === "free" ? (
                    <Button variant="outline" className="w-full" disabled>
                      {plan === "free" ? "Current plan" : "Free tier"}
                    </Button>
                  ) : isCurrent ? (
                    <Button variant="outline" className="w-full" disabled>
                      Current plan
                    </Button>
                  ) : (
                    <Button
                      onClick={() => {
                        if (!user) {
                          nav("/auth?next=/upgrade");
                          return;
                        }
                        setCheckoutPriceId(tier.priceId!);
                      }}
                      className={`w-full ${
                        tier.highlight
                          ? "bg-accent hover:bg-accent/90 text-accent-foreground"
                          : ""
                      }`}
                      variant={tier.highlight ? "default" : "secondary"}
                    >
                      {plan === "pro" && tier.key === "coach_plus"
                        ? "Upgrade to Coach+"
                        : `Get ${tier.name}`}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <p className="mt-6 text-xs text-muted-foreground">
          Plan changes take effect immediately and are prorated. Cancellations take effect at the
          end of the current billing period.
        </p>
      </main>

      <Dialog
        open={!!checkoutPriceId}
        onOpenChange={(o) => {
          if (!o) {
            setCheckoutPriceId(null);
            // Refresh plan when modal closes — webhook may have already updated.
            void refresh();
          }
        }}
      >
        <DialogContent className="max-w-2xl p-0 overflow-hidden">
          <DialogHeader className="p-6 pb-0">
            <DialogTitle className="font-display text-2xl">Complete your purchase</DialogTitle>
          </DialogHeader>
          <div className="p-6">
            {checkoutPriceId && (
              <StripeEmbeddedCheckout
                priceId={checkoutPriceId}
                returnUrl={`${window.location.origin}/dashboard?checkout=success&session_id={CHECKOUT_SESSION_ID}`}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Upgrade;
