import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { MetricCard } from "@/components/admin/MetricCard";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";

interface Metrics {
  total_users: number;
  new_users_7d: number;
  active_users_7d: number;
  total_prep_sessions: number;
  sessions_ready: number;
  sessions_failed: number;
  generations_succeeded: number;
  generations_failed: number;
  generations_processing: number;
  total_questions: number;
  saved_answers: number;
  beta_feedback_total: number;
  beta_feedback_new: number;
  free_users: number;
  pro_users: number;
  coach_plus_users: number;
  testing_mode: boolean;
  testing_overrides: number;
}

export default function AdminOverview() {
  const [m, setM] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.rpc("admin_overview_metrics");
      if (error) setError(error.message);
      else setM(data as unknown as Metrics);
    })();
  }, []);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold">Overview</h1>
          <p className="text-sm text-muted-foreground">Private beta health at a glance.</p>
        </div>

        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {!m && !error ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-md" />
            ))}
          </div>
        ) : m ? (
          <>
            <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <MetricCard label="Total users" value={m.total_users} hint={`+${m.new_users_7d} this week`} />
              <MetricCard label="Active (7d)" value={m.active_users_7d} />
              <MetricCard label="Prep sessions" value={m.total_prep_sessions} hint={`${m.sessions_ready} ready`} />
              <MetricCard label="Questions generated" value={m.total_questions} />
              <MetricCard label="Generations OK" value={m.generations_succeeded} tone="good" />
              <MetricCard
                label="Generations failed"
                value={m.generations_failed}
                tone={m.generations_failed > 0 ? "bad" : "default"}
              />
              <MetricCard label="Processing" value={m.generations_processing} />
              <MetricCard label="Saved answers" value={m.saved_answers} />
            </section>

            <section>
              <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground mb-2">
                Plans
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <MetricCard label="Free" value={m.free_users} />
                <MetricCard label="Pro" value={m.pro_users} />
                <MetricCard label="Coach+" value={m.coach_plus_users} />
                <MetricCard label="Testing overrides" value={m.testing_overrides} hint={m.testing_mode ? "Testing mode ON" : "Testing mode off"} />
              </div>
            </section>

            <section>
              <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground mb-2">
                Feedback
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <MetricCard label="Beta feedback total" value={m.beta_feedback_total} />
                <MetricCard
                  label="New / unread"
                  value={m.beta_feedback_new}
                  tone={m.beta_feedback_new > 0 ? "bad" : "default"}
                />
              </div>
            </section>
          </>
        ) : null}
      </div>
    </AdminLayout>
  );
}
