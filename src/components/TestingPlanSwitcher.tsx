import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePlan, type Plan } from "@/hooks/usePlan";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Beaker } from "lucide-react";

/**
 * Dev-only plan switcher. Renders nothing unless:
 *  - testing_mode = true in app_settings, AND
 *  - the current user has the platform admin role.
 * Writes go through the set-testing-plan-override edge function so
 * server-side enforcement honours the override on the next request.
 */
export const TestingPlanSwitcher = () => {
  const { user } = useAuth();
  const { plan, refresh } = usePlan();
  const [enabled, setEnabled] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) return;
      const [{ data: setting }, { data: roleRow }] = await Promise.all([
        supabase.from("app_settings").select("value").eq("key", "testing_mode").maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle(),
      ]);
      if (cancelled) return;
      setEnabled(setting?.value === true || (setting?.value as unknown) === "true");
      setIsAdmin(!!roleRow);
    })();
    return () => { cancelled = true; };
  }, [user]);

  if (!user || !enabled || !isAdmin) return null;

  const change = async (next: Plan | "clear") => {
    setBusy(true);
    try {
      const body = next === "clear"
        ? { action: "clear", user_id: user.id }
        : { action: "set", user_id: user.id, plan: next };
      const { error } = await supabase.functions.invoke("set-testing-plan-override", { body });
      if (error) throw error;
      try { localStorage.setItem("testing_plan_override", next); } catch { /* ignore storage errors (private mode, quota) */ }
      await refresh();
      toast.success(next === "clear" ? "Testing override cleared" : `Testing plan: ${next}`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to update testing plan");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-900">
      <Beaker className="h-3.5 w-3.5" />
      <span className="font-medium">Test plan:</span>
      <Select value={plan} onValueChange={(v) => change(v as Plan)} disabled={busy}>
        <SelectTrigger className="h-7 w-[110px] border-amber-300 bg-background text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="free">Free</SelectItem>
          <SelectItem value="pro">Pro</SelectItem>
          <SelectItem value="coach_plus">Coach+</SelectItem>
        </SelectContent>
      </Select>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-xs hover:bg-amber-100"
        onClick={() => change("clear")}
        disabled={busy}
      >
        Clear
      </Button>
    </div>
  );
};
