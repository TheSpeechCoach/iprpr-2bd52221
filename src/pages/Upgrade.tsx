import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { usePlan, type Plan } from "@/hooks/usePlan";
import { useProIntroOfferEligibility } from "@/hooks/useProIntroOfferEligibility";
import { SiteHeader } from "@/components/SiteHeader";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";
import { StripeEmbeddedCheckout } from "@/components/StripeEmbeddedCheckout";
import { IntroOfferCallout } from "@/components/IntroOfferCallout";
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
import { track } from "@/lib/analytics";
import { SoftUrgencyNote } from "@/components/SoftUrgencyNote";
import { copy } from "@/lib/copy";
import { PRICING } from "@/lib/pricing";
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
    name: PRICING.free.name,
    price: `$${PRICING.free.price}`,
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
    name: PRICING.pro.name,
    price: `$${PRICING.pro.price}`,
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
    name: PRICING.coach_plus.name,
    price: `$${PRICING.coach_plus.price}`,
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
  const { eligible: introEligible } = useProIntroOfferEligibility();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [checkoutPriceId, setCheckoutPriceId] = useState<string | null>(null);
  const [checkoutWithIntro, setCheckoutWithIntro] = useState(false);
  const [portalBusy, setPortalBusy] = useState(false);

  // Did the user arrive via the question-10 wall? Surface the intro offer
  // prominently and pre-arm Pro checkout with the discount.
  const showIntroOffer = introEligible && (params.get("offer") === "intro" || plan === "free");

  // Track when the upgrade page is viewed.
  useEffect(() => {
    void track("upgrade_prompt_seen", { plan, metadata: { surface: "upgrade_page" } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

        {plan === "free" && (
          <div className="mt-6 border-l-2 border-accent/40 pl-4 max-w-xl">
            <SoftUrgencyNote />
          </div>
        )}

        {showIntroOffer && (
          <div className="mt-8 max-w-2xl">
            <IntroOfferCallout variant="wall" ctaHref="#pricing" />
          </div>
        )}

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
                  {showIntroOffer && tier.key === "pro" ? (
                    <>
                      {copy.upgrade.proIntroPrice}
                      <span className="text-base text-muted-foreground font-normal">
                        {" "}first month
                      </span>
                    </>
                  ) : (
                    <>
                      {tier.price}
                      {tier.key !== "free" && (
                        <span className="text-base text-muted-foreground font-normal">
                          {" "}/ month
                        </span>
                      )}
                    </>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {showIntroOffer && tier.key === "pro"
                    ? `Then ${copy.upgrade.proPrice}/month. Cancel anytime.`
                    : tier.tagline}
                </div>

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
                        const useIntro = showIntroOffer && tier.key === "pro";
                        void track("upgrade_clicked", {
                          plan,
                          metadata: {
                            surface: "upgrade_page",
                            target_plan: tier.key,
                            price_id: tier.priceId,
                            intro_offer: useIntro,
                          },
                        });
                        setCheckoutWithIntro(useIntro);
                        setCheckoutPriceId(tier.priceId!);
                      }}
                      className={`w-full ${
                        tier.highlight
                          ? "bg-accent hover:bg-accent/90 text-accent-foreground"
                          : ""
                      }`}
                      variant={tier.highlight ? "default" : "secondary"}
                    >
                      {showIntroOffer && tier.key === "pro"
                        ? copy.upgrade.intro.buttonCta
                        : plan === "pro" && tier.key === "coach_plus"
                          ? "Upgrade to Coach+"
                          : `Get ${tier.name}`}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {showIntroOffer && (
          <p className="mt-3 text-xs text-muted-foreground">
            {copy.upgrade.intro.smallPrint}
          </p>
        )}

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
            setCheckoutWithIntro(false);
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
                introOffer={checkoutWithIntro}
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
