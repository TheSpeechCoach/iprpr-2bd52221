import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePlan, FREE_SESSION_LIMIT } from "@/hooks/usePlan";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Plus, FileText, ArrowRight, Sparkles, Lock } from "lucide-react";
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
            <h1 className="font-display text-4xl font-semibold">Interview sessions</h1>
            <p className="mt-2 text-sm text-muted-foreground">All your generated packs in one place. Pick up where you left off, or start a new one.</p>
          </div>
          <Link to="/prep/new">
            <Button className="bg-accent hover:bg-accent/90 text-accent-foreground">
              <Plus className="h-4 w-4 mr-2" /> New session
            </Button>
          </Link>
        </div>

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
