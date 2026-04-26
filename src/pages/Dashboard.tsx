import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Plus, FileText, ArrowRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

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
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main className="container-tight flex-1 py-12">
        <div className="flex items-end justify-between flex-wrap gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground mb-2">Your prep</div>
            <h1 className="font-display text-4xl font-semibold">Sessions</h1>
          </div>
          <Link to="/prep/new">
            <Button className="bg-accent hover:bg-accent/90 text-accent-foreground">
              <Plus className="h-4 w-4 mr-2" /> New prep session
            </Button>
          </Link>
        </div>

        <div className="mt-10">
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : sessions.length === 0 ? (
            <div className="border border-dashed border-border p-16 text-center">
              <FileText className="h-8 w-8 mx-auto text-muted-foreground" strokeWidth={1.5} />
              <h3 className="mt-4 font-display text-xl">No sessions yet</h3>
              <p className="mt-1 text-sm text-muted-foreground">Create your first prep session to generate tailored questions.</p>
              <Link to="/prep/new" className="inline-block mt-6">
                <Button>Start preparing</Button>
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
                  <div>
                    <div className="font-display font-medium">{s.title}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {s.target_role ?? "Untitled role"}{s.company_name ? ` · ${s.company_name}` : ""} · {formatDistanceToNow(new Date(s.created_at), { addSuffix: true })}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-[10px] uppercase tracking-widest px-2 py-1 ${s.status === "ready" ? "bg-foreground text-background" : "bg-secondary text-muted-foreground"}`}>
                      {s.status}
                    </span>
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

export default Dashboard;
