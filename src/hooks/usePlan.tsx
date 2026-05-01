import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getStripeEnvironment } from "@/lib/stripe";
import { PLAN_LIMITS, type Plan } from "@/lib/planLimits";

export const FREE_SESSION_LIMIT = PLAN_LIMITS.free.maxPrepSessions;
export const FREE_QUESTION_LIMIT = PLAN_LIMITS.free.visibleQuestions;

export type { Plan };

interface PlanState {
  plan: Plan;
  loading: boolean;
  sessionsUsed: number;
  sessionLimit: number;
  questionLimit: number;
  canCreateSession: boolean;
  canSeeAnswerTiers: boolean;
  canSaveAnswers: boolean;
  canExport: boolean;
  hasEnhancedGuidance: boolean;
  isPaid: boolean;
  pastDue: boolean;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  refresh: () => Promise<void>;
}

const PRICE_TO_PLAN: Record<string, Plan> = {
  pro_monthly: "pro",
  coach_plus_monthly: "coach_plus",
};

export const usePlan = (): PlanState => {
  const { user } = useAuth();
  const [plan, setPlan] = useState<Plan>("free");
  const [sessionsUsed, setSessionsUsed] = useState(0);
  const [pastDue, setPastDue] = useState(false);
  const [cancelAtPeriodEnd, setCancelAtPeriodEnd] = useState(false);
  const [currentPeriodEnd, setCurrentPeriodEnd] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [testingMode, setTestingMode] = useState(false);

  const load = async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const env = getStripeEnvironment();

    const { data: subs } = await supabase
      .from("subscriptions")
      .select("plan, status, price_id, environment, current_period_end, cancel_at_period_end")
      .eq("user_id", user.id);

    let resolved: Plan = "free";
    let pd = false;
    let cape = false;
    let cpe: string | null = null;
    const now = Date.now();

    for (const s of subs ?? []) {
      // Filter by env when env column populated; tolerate legacy rows.
      if (s.environment && s.environment !== env) continue;

      const periodEnd = s.current_period_end ? new Date(s.current_period_end).getTime() : null;
      const stillEntitled =
        (["active", "trialing", "past_due"].includes(s.status) &&
          (periodEnd === null || periodEnd > now)) ||
        (s.status === "canceled" && periodEnd !== null && periodEnd > now);
      if (!stillEntitled) continue;

      const candidate: Plan = (PRICE_TO_PLAN[s.price_id ?? ""] ??
        (s.plan === "coach_plus" ? "coach_plus" : s.plan === "pro" ? "pro" : "free")) as Plan;
      // Pick highest tier (coach_plus > pro > free)
      const rank = (p: Plan) => (p === "coach_plus" ? 2 : p === "pro" ? 1 : 0);
      if (rank(candidate) > rank(resolved)) {
        resolved = candidate;
        pd = s.status === "past_due";
        cape = !!s.cancel_at_period_end;
        cpe = s.current_period_end ?? null;
      }
    }

    // Honour testing-mode plan override (admin-set, server-enforced).
    // We read both the flag and the override row; if either is missing we
    // fall back silently to the real plan.
    try {
      const { data: setting } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "testing_mode")
        .maybeSingle();
      const testingOn = setting?.value === true || (setting?.value as any) === "true";
      setTestingMode(testingOn);
      if (testingOn) {
        const { data: override } = await supabase
          .from("testing_plan_overrides")
          .select("override_plan")
          .eq("user_id", user.id)
          .maybeSingle();
        const op = override?.override_plan as Plan | undefined;
        if (op === "free" || op === "pro" || op === "coach_plus") {
          resolved = op;
        }
      }
    } catch {
      /* non-fatal — keep real plan */
    }

    setPlan(resolved);
    setPastDue(pd);
    setCancelAtPeriodEnd(cape);
    setCurrentPeriodEnd(cpe);

    // Count Free's monthly session usage by calendar month (UTC).
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
    const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
    const { count } = await supabase
      .from("prep_sessions")
      .select("id", { count: "exact", head: true })
      .neq("status", "draft")
      .gte("created_at", monthStart)
      .lt("created_at", monthEnd);
    setSessionsUsed(count ?? 0);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const isPaid = plan === "pro" || plan === "coach_plus";
  const limits = PLAN_LIMITS[plan];
  const sessionLimit = limits.maxPrepSessions;
  const questionLimit = limits.visibleQuestions;

  return {
    plan,
    loading,
    sessionsUsed,
    sessionLimit,
    questionLimit,
    canCreateSession: testingMode || sessionsUsed < limits.maxPrepSessions,
    canSeeAnswerTiers: limits.answerTiers,
    canSaveAnswers: limits.savedAnswers,
    canExport: testingMode || limits.exports,
    hasEnhancedGuidance: limits.realityCheck,
    isPaid,
    pastDue,
    cancelAtPeriodEnd,
    currentPeriodEnd,
    refresh: load,
  };
};
