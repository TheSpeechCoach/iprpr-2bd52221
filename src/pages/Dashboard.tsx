import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePlan, FREE_SESSION_LIMIT } from "@/hooks/usePlan";
import { SiteHeader } from "@/components/SiteHeader";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { Plus, FileText, ArrowRight, Sparkles, Lock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { track } from "@/lib/analytics";
import { SoftUrgencyNote } from "@/components/SoftUrgencyNote";
import { IntroOfferCallout } from "@/components/IntroOfferCallout";
import { useProIntroOfferEligibility } from "@/hooks/useProIntroOfferEligibility";

interface Session {
  id: string;
  title: string;
  target_role: string | null;
  company_name: string | null;
  status: string;
  created_at: string;
}

const Dashboard = () => {
  const { user } = useAuth();
  const {
    plan,
    sessionsUsed,
    canCreateSession,
    loading: planLoading,
    pastDue,
    cancelAtPeriodEnd,
    currentPeriodEnd,
    refresh: refreshPlan,
  } = usePlan();
  const { eligible: introEligible } = useProIntroOfferEligibility();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("prep_sessions")
        .select("id, title, target_role, company_name, status, created_at")
        .order("created_at", { ascending: false });
      setSessions(data ?? []);
      setLoading(false);
    };
    if (user) load();
  }, [user]);

  // Handle return from Stripe checkout
  useEffect(() => {
    if (searchParams.get("checkout") === "success") {
      void track("subscription_started", {
        plan,
        metadata: { stripe_checkout_session_id: searchParams.get("session_id") },
      });
      toast({
        title: "Payment received",
        description: "Welcome to the paid plan. Your access is unlocking now.",
      });
      // Webhook may take a beat — refetch a few times.
      void refreshPlan();
      const t1 = setTimeout(() => refreshPlan(), 2000);
      const t2 = setTimeout(() => refreshPlan(), 5000);
      searchParams.delete("checkout");
      searchParams.delete("session_id");
      setSearchParams(searchParams, { replace: true });
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
  }, [searchParams, setSearchParams, refreshPlan]);

  const planLabel = plan === "coach_plus" ? "Coach+" : plan === "pro" ? "Pro" : "Free";
  const periodEndLabel = currentPeriodEnd
    ? new Date(currentPeriodEnd).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

  return (
    <div className="min-h-screen flex flex-col">
      <PaymentTestModeBanner />
      <SiteHeader />
      <main className="container-tight flex-1 py-12">
        <div className="flex items-end justify-between flex-wrap gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground mb-2">Your prep</div>
            <h1 className="font-display text-4xl font-semibold">Interview sessions</h1>
            <p className="mt-2 text-sm text-muted-foreground">All your generated packs in one place. Pick up where you left off, or start a new one.</p>
          </div>
          {canCreateSession ? (
            <Link to="/prep/new">
              <Button className="bg-accent hover:bg-accent/90 text-accent-foreground">
                <Plus className="h-4 w-4 mr-2" /> New session
              </Button>
            </Link>
          ) : (
            <Link
              to="/upgrade"
              onClick={() => track("upgrade_clicked", { plan, metadata: { surface: "dashboard_session_limit" } })}
            >
              <Button className="bg-accent hover:bg-accent/90 text-accent-foreground">
                <Sparkles className="h-4 w-4 mr-2" /> Upgrade for more sessions
              </Button>
            </Link>
          )}
        </div>

        {/* Past-due banner */}
        {!planLoading && pastDue && (
          <div className="mt-8 border border-accent/40 bg-accent/5 p-5 flex flex-col md:flex-row md:items-center gap-4">
            <div className="flex-1 text-sm">
              <div className="text-[10px] uppercase tracking-[0.2em] text-accent mb-1">Payment issue</div>
              Your last payment didn't go through. Update your card to keep your {planLabel} access.
            </div>
            <Link to="/upgrade">
              <Button variant="outline">Update payment</Button>
            </Link>
          </div>
        )}

        {/* Cancellation notice */}
        {!planLoading && cancelAtPeriodEnd && periodEndLabel && (
          <div className="mt-8 border border-border bg-secondary/40 p-5 text-sm">
            <span className="text-muted-foreground">Your {planLabel} plan ends on </span>
            <span className="font-medium">{periodEndLabel}</span>
            <span className="text-muted-foreground">. You'll keep full access until then.</span>
          </div>
        )}

        {/* Free plan banner */}
        {!planLoading && plan === "free" && (
          <>
            <div className="mt-8 border border-border bg-secondary/40 p-5 flex flex-col md:flex-row md:items-center gap-4 md:gap-6">
              <div className="flex-1">
                <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-1">Free plan</div>
                <div className="text-sm">
                  <span className="font-medium">{Math.min(sessionsUsed, FREE_SESSION_LIMIT)} of {FREE_SESSION_LIMIT}</span>
                  <span className="text-muted-foreground"> session used · 10 questions visible per pack</span>
                </div>
                <SoftUrgencyNote className="mt-3" showSocialProof={false} />
              </div>
              <Link
                to={introEligible ? "/upgrade?offer=intro" : "/upgrade"}
                onClick={() => track("upgrade_clicked", { plan, metadata: { surface: "dashboard_free_banner", intro_offer: introEligible } })}
              >
                <Button variant="outline" className="gap-2">
                  <Sparkles className="h-3.5 w-3.5 text-accent" /> Upgrade to Pro
                </Button>
              </Link>
            </div>
            {introEligible && (
              <div className="mt-4">
                <IntroOfferCallout variant="dashboard" />
              </div>
            )}
          </>
        )}

        <div className="mt-10">
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading your sessions…</div>
          ) : sessions.length === 0 ? (
            <div className="border border-dashed border-border p-16 text-center">
              <FileText className="h-8 w-8 mx-auto text-muted-foreground" strokeWidth={1.5} />
              <h3 className="mt-4 font-display text-xl">Nothing here yet</h3>
              <p className="mt-1 text-sm text-muted-foreground max-w-sm mx-auto">
                Create your first session and we'll generate a tailored interview pack from your CV and the role.
              </p>
              <Link to="/prep/new" className="inline-block mt-6">
                <Button>Start your first session</Button>
              </Link>
            </div>
          ) : (
            <div className="border border-border divide-y divide-border">
              {sessions.map((s) => (
                <Link
                  key={s.id}
                  to={`/prep/${s.id}/results`}
                  className="flex items-center justify-between p-5 hover:bg-secondary/40 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="font-display font-medium truncate">{s.title}</div>
                    <div className="text-xs text-muted-foreground mt-1 truncate">
                      {s.target_role ?? "Role not set"}{s.company_name ? ` · ${s.company_name}` : ""} · Created {formatDistanceToNow(new Date(s.created_at), { addSuffix: true })}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <StatusBadge status={s.status} />
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  generating: "Generating…",
  ready: "Ready",
  failed: "Needs retry",
};

const StatusBadge = ({ status }: { status: string }) => {
  const label = STATUS_LABEL[status] ?? status;
  const cls =
    status === "ready"
      ? "bg-foreground text-background"
      : status === "failed"
      ? "bg-accent/10 text-accent"
      : status === "generating"
      ? "bg-secondary text-foreground"
      : "bg-secondary text-muted-foreground";
  return (
    <span className={`text-[10px] uppercase tracking-widest px-2 py-1 ${cls}`}>{label}</span>
  );
};

export default Dashboard;
