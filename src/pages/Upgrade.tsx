import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePlan } from "@/hooks/usePlan";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, Check, Sparkles } from "lucide-react";
import { useState } from "react";

const PRO_FEATURES = [
  "Unlimited prep sessions",
  "Full set of 100+ tailored questions",
  "All categories unlocked",
  "PDF and DOCX export",
  "Priority generation",
];

const Upgrade = () => {
  const { user } = useAuth();
  const { plan, refresh } = usePlan();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);

  // Placeholder upgrade — no Stripe yet.
  const simulateUpgrade = async () => {
    if (!user) return;
    setBusy(true);
    try {
      // Insert/upsert a pro subscription row for this user.
      const { data: existing } = await supabase
        .from("subscriptions")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (existing) {
        await supabase
          .from("subscriptions")
          .update({ plan: "pro", status: "active", provider: "placeholder" })
          .eq("id", existing.id);
      } else {
        await supabase.from("subscriptions").insert({
          user_id: user.id,
          plan: "pro",
          status: "active",
          provider: "placeholder",
        });
      }
      await refresh();
      toast({
        title: "You're on Pro",
        description: "All sessions and questions are now unlocked. (Billing not yet wired up.)",
      });
      nav("/dashboard");
    } catch (e: any) {
      toast({
        title: "Couldn't upgrade",
        description: e?.message ?? "Please try again.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main className="container-tight flex-1 py-12 max-w-3xl">
        <Link
          to="/dashboard"
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-6"
        >
          <ArrowLeft className="h-3 w-3" /> Back to dashboard
        </Link>

        <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground mb-2 inline-flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-accent" /> Upgrade
        </div>
        <h1 className="font-display text-4xl font-semibold leading-tight">
          Unlock the full interview pack
        </h1>
        <p className="mt-3 text-muted-foreground max-w-xl">
          You're on the Free tier. Pro removes the session and question limits and gives you the
          complete coaching pack.
        </p>

        <div className="grid md:grid-cols-2 gap-px bg-border border border-border mt-10">
          {/* Free */}
          <div className="bg-background p-8">
            <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-2">
              Free
            </div>
            <div className="font-display text-3xl font-semibold">£0</div>
            <div className="text-xs text-muted-foreground mt-1">Try it out</div>
            <ul className="mt-6 space-y-2.5 text-sm">
              <Bullet>1 prep session</Bullet>
              <Bullet>First 25 questions</Bullet>
              <Bullet muted>Remaining questions blurred</Bullet>
              <Bullet muted>Export disabled</Bullet>
            </ul>
            {plan === "free" && (
              <div className="mt-6 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                Current plan
              </div>
            )}
          </div>

          {/* Pro */}
          <div className="bg-background p-8 relative border-l border-accent/40">
            <div className="absolute top-0 right-0 bg-accent text-accent-foreground text-[10px] uppercase tracking-[0.2em] px-2 py-1">
              Recommended
            </div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-accent mb-2">Pro</div>
            <div className="font-display text-3xl font-semibold">
              £19<span className="text-base text-muted-foreground font-normal"> / month</span>
            </div>
            <div className="text-xs text-muted-foreground mt-1">Cancel anytime</div>
            <ul className="mt-6 space-y-2.5 text-sm">
              {PRO_FEATURES.map((f) => (
                <Bullet key={f} accent>
                  {f}
                </Bullet>
              ))}
            </ul>
            <Button
              onClick={simulateUpgrade}
              disabled={busy || plan === "pro"}
              className="mt-7 w-full bg-accent hover:bg-accent/90 text-accent-foreground"
            >
              {plan === "pro"
                ? "You're on Pro"
                : busy
                ? "Upgrading…"
                : "Upgrade to Pro"}
            </Button>
            <p className="mt-3 text-[11px] text-muted-foreground leading-relaxed">
              Billing isn't wired up yet — this is a placeholder that flips your account to Pro
              instantly so you can preview the unlocked experience.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
};

const Bullet = ({
  children,
  muted,
  accent,
}: {
  children: React.ReactNode;
  muted?: boolean;
  accent?: boolean;
}) => (
  <li
    className={`flex gap-2.5 items-start ${
      muted ? "text-muted-foreground" : ""
    }`}
  >
    <Check
      className={`h-4 w-4 mt-0.5 shrink-0 ${
        accent ? "text-accent" : muted ? "text-muted-foreground" : "text-foreground"
      }`}
      strokeWidth={2}
    />
    <span>{children}</span>
  </li>
);

export default Upgrade;
