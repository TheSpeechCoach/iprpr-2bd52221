import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { format } from "date-fns";

interface FeedbackRow {
  id: string;
  user_id: string;
  user_email: string | null;
  page_url: string | null;
  issue_type: string;
  message: string;
  status: string;
  admin_notes: string | null;
  created_at: string;
}

const STATUSES = ["new", "reviewing", "fixed", "ignored"] as const;
type Status = typeof STATUSES[number];

export default function AdminFeedback() {
  const [rows, setRows] = useState<FeedbackRow[] | null>(null);
  const [filter, setFilter] = useState<"all" | Status>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const load = async () => {
    setRows(null);
    const { data, error } = await supabase
      .from("beta_feedback")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) { toast.error(error.message); setRows([]); return; }
    setRows((data ?? []) as FeedbackRow[]);
  };

  useEffect(() => { load(); }, []);

  const updateRow = async (id: string, patch: Partial<FeedbackRow>) => {
    setBusyId(id);
    try {
      const { error } = await supabase
        .from("beta_feedback")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      setRows((prev) => prev?.map((r) => (r.id === id ? { ...r, ...patch } as FeedbackRow : r)) ?? null);
      toast.success("Updated");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally {
      setBusyId(null);
    }
  };

  const visible = (rows ?? []).filter((r) => filter === "all" || r.status === filter);

  return (
    <AdminLayout>
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold">Beta feedback</h1>
          <p className="text-sm text-muted-foreground">Triage submitted feedback. Add internal notes; mark as reviewing, fixed, or ignored.</p>
        </div>

        <div className="flex gap-1 flex-wrap">
          {(["all", ...STATUSES] as const).map((f) => (
            <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>
              {f}
            </Button>
          ))}
        </div>

        {rows === null ? (
          <Skeleton className="h-40 w-full rounded-md" />
        ) : visible.length === 0 ? (
          <div className="text-sm text-muted-foreground py-10 text-center border rounded-md">No feedback.</div>
        ) : (
          <div className="space-y-3">
            {visible.map((r) => (
              <div key={r.id} className="rounded-md border border-border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={r.status === "new" ? "destructive" : "secondary"}>{r.status}</Badge>
                      <Badge variant="outline">{r.issue_type}</Badge>
                      <span className="text-xs text-muted-foreground">{format(new Date(r.created_at), "d MMM yyyy HH:mm")}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 font-mono">
                      {r.user_email ?? r.user_id.slice(0, 8)}
                      {r.page_url && <span className="ml-2">· {r.page_url}</span>}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {STATUSES.map((s) => (
                      <Button
                        key={s}
                        size="sm"
                        variant={r.status === s ? "default" : "outline"}
                        disabled={busyId === r.id || r.status === s}
                        onClick={() => updateRow(r.id, { status: s })}
                      >
                        {s}
                      </Button>
                    ))}
                  </div>
                </div>
                <p className="mt-3 text-sm whitespace-pre-wrap">{r.message}</p>
                <div className="mt-3">
                  <Textarea
                    placeholder="Admin notes…"
                    rows={2}
                    value={drafts[r.id] ?? r.admin_notes ?? ""}
                    onChange={(e) => setDrafts((d) => ({ ...d, [r.id]: e.target.value }))}
                    className="text-sm"
                  />
                  <div className="flex justify-end mt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyId === r.id || (drafts[r.id] ?? r.admin_notes ?? "") === (r.admin_notes ?? "")}
                      onClick={() => updateRow(r.id, { admin_notes: drafts[r.id] ?? "" })}
                    >
                      Save note
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
