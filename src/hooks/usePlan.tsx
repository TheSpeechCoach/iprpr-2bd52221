import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const FREE_SESSION_LIMIT = 1;
export const FREE_QUESTION_LIMIT = 25;

export type Plan = "free" | "pro";

interface PlanState {
  plan: Plan;
  loading: boolean;
  sessionsUsed: number;
  sessionLimit: number;
  questionLimit: number;
  canCreateSession: boolean;
  refresh: () => Promise<void>;
}

export const usePlan = (): PlanState => {
  const { user } = useAuth();
  const [plan, setPlan] = useState<Plan>("free");
  const [sessionsUsed, setSessionsUsed] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);

    // Subscription row → highest precedence
    const { data: subs } = await supabase
      .from("subscriptions")
      .select("plan, status")
      .eq("user_id", user.id);
    const isPro = (subs ?? []).some(
      (s) => s.plan === "pro" && (s.status === "active" || s.status === "trialing"),
    );
    setPlan(isPro ? "pro" : "free");

    // Sessions used (anything not draft counts toward the quota)
    const { count } = await supabase
      .from("prep_sessions")
      .select("id", { count: "exact", head: true })
      .neq("status", "draft");
    setSessionsUsed(count ?? 0);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const sessionLimit = plan === "pro" ? Infinity : FREE_SESSION_LIMIT;
  const questionLimit = plan === "pro" ? Infinity : FREE_QUESTION_LIMIT;

  return {
    plan,
    loading,
    sessionsUsed,
    sessionLimit,
    questionLimit,
    canCreateSession: plan === "pro" || sessionsUsed < FREE_SESSION_LIMIT,
    refresh: load,
  };
};
