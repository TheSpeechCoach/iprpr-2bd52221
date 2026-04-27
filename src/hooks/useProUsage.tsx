import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePlan } from "@/hooks/usePlan";
import { PRO_LIMITS, utilisationStatus } from "@/lib/proLimits";

interface ProUsageState {
  loading: boolean;
  periodStart: string | null;
  periodEnd: string | null;
  distinctRoles: number;
  distinctCvs: number;
  jobSpecs: number;
  rolesStatus: "ok" | "warn" | "block";
  cvsStatus: "ok" | "warn" | "block";
  jobSpecsStatus: "ok" | "warn" | "block";
  hasAnyWarning: boolean;
  hasAnyBlock: boolean;
  refresh: () => Promise<void>;
}

const empty: Omit<ProUsageState, "refresh"> = {
  loading: true,
  periodStart: null,
  periodEnd: null,
  distinctRoles: 0,
  distinctCvs: 0,
  jobSpecs: 0,
  rolesStatus: "ok",
  cvsStatus: "ok",
  jobSpecsStatus: "ok",
  hasAnyWarning: false,
  hasAnyBlock: false,
};

export const useProUsage = (): ProUsageState => {
  const { user } = useAuth();
  const { plan } = usePlan();
  const [state, setState] = useState(empty);

  const load = useCallback(async () => {
    if (!user || plan !== "pro") {
      setState({ ...empty, loading: false });
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    const { data, error } = await supabase.rpc("pro_usage_counts", { _user_id: user.id });
    if (error || !data || (Array.isArray(data) && data.length === 0)) {
      setState({ ...empty, loading: false });
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    const distinctRoles = Number(row.distinct_roles ?? 0);
    const distinctCvs = Number(row.distinct_cvs ?? 0);
    const jobSpecs = Number(row.job_specs ?? 0);
    const rolesStatus = utilisationStatus(distinctRoles, PRO_LIMITS.distinctRolesPerPeriod);
    const cvsStatus = utilisationStatus(distinctCvs, PRO_LIMITS.distinctCvsPerPeriod);
    const jobSpecsStatus = utilisationStatus(jobSpecs, PRO_LIMITS.jobSpecsPerPeriod);
    setState({
      loading: false,
      periodStart: row.period_start ?? null,
      periodEnd: row.period_end ?? null,
      distinctRoles,
      distinctCvs,
      jobSpecs,
      rolesStatus,
      cvsStatus,
      jobSpecsStatus,
      hasAnyWarning: [rolesStatus, cvsStatus, jobSpecsStatus].some((s) => s === "warn"),
      hasAnyBlock: [rolesStatus, cvsStatus, jobSpecsStatus].some((s) => s === "block"),
    });
  }, [user, plan]);

  useEffect(() => {
    void load();
  }, [load]);

  return { ...state, refresh: load };
};
