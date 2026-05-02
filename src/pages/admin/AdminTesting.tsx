import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { MetricCard } from "@/components/admin/MetricCard";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ExternalLink } from "lucide-react";

interface OverrideRow {
  user_id: string;
  override_plan: string;
  email: string | null;
  created_at: string;
}

export default function AdminTesting() {
  const [testingMode, setTestingMode] = useState<boolean | null>(null);
  const [overrides, setOverrides] = useState<OverrideRow[] | null>(null);
  const [staleSessions, setStaleSessions] = useState<number | null>(null);
  const [failedJobs, setFailedJobs] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      const [setting, ovr, stale, failed] = await Promise.all([
        supabase.from("app_settings").select("value").eq("key", "testing_mode").maybeSingle(),
        supabase.from("testing_plan_overrides").select("user_id,override_plan,created_at").order("created_at", { ascending: false }),
        supabase.from("prep_sessions").select("id", { count: "exact", head: true })
          .eq("status", "ready")
          .lt("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
        supabase.from("generation_jobs").select("id", { count: "exact", head: true }).eq("status", "failed"),
      ]);
      setTestingMode(setting.data?.value === true || (setting.data?.value as any) === "true");

      const ovrList = (ovr.data ?? []) as Array<{ user_id: string; override_plan: string; created_at: string }>;
      const userIds = ovrList.map((o) => o.user_id);
      const emails: Record<string, string> = {};
      if (userIds.length) {
        const { data: profs } = await supabase.from("profiles").select("id,email").in("id", userIds);
        for (const p of profs ?? []) emails[p.id] = p.email ?? "";
      }
      setOverrides(ovrList.map((o) => ({ ...o, email: emails[o.user_id] ?? null })));

      setStaleSessions(stale.count ?? 0);
      setFailedJobs(failed.count ?? 0);
    })();
  }, []);

  const backendUsersUrl = (import.meta.env.VITE_BACKEND_USERS_PANEL_URL as string | undefined) ?? null;

  return (
    <AdminLayout>
      <div className="space-y-5">
        <div>
          <h1 className="text-xl font-semibold">Testing</h1>
          <p className="text-sm text-muted-foreground">
            Plan overrides, testing-mode status, and shortcuts for managing test accounts.
          </p>
        </div>

        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard
            label="Testing mode"
            value={testingMode === null ? "…" : testingMode ? "ON" : "OFF"}
            tone={testingMode ? "good" : "default"}
          />
          <MetricCard label="Active overrides" value={overrides?.length ?? "…"} />
          <MetricCard
            label="Stale sessions (>7d ready)"
            value={staleSessions ?? "…"}
          />
          <MetricCard
            label="Failed generation jobs"
            value={failedJobs ?? "…"}
            tone={failedJobs && failedJobs > 0 ? "bad" : "default"}
          />
        </section>

        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm">Active plan overrides</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-sm">
            {overrides === null ? (
              <Skeleton className="h-20 w-full" />
            ) : overrides.length === 0 ? (
              <p className="text-muted-foreground">No overrides set. Use the Users page to assign one.</p>
            ) : (
              <ul className="divide-y divide-border">
                {overrides.map((o) => (
                  <li key={o.user_id} className="py-2 flex items-center justify-between">
                    <span className="font-mono text-xs">{o.email ?? o.user_id.slice(0, 8)}</span>
                    <span className="text-xs uppercase tracking-wider">{o.override_plan}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3 flex gap-2">
              <Button asChild size="sm" variant="outline">
                <Link to="/admin/users">Manage in Users</Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm">Reusing test accounts</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-sm space-y-3">
            <p className="text-muted-foreground">
              To reuse a test email, delete the test user from the backend Users panel. Do not delete auth users from app code.
            </p>
            {backendUsersUrl ? (
              <Button asChild size="sm" variant="outline">
                <a href={backendUsersUrl} target="_blank" rel="noreferrer">
                  Open Users panel <ExternalLink className="h-3 w-3 ml-1" />
                </a>
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">
                Set <code className="font-mono">VITE_BACKEND_USERS_PANEL_URL</code> to add a one-click shortcut here.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
