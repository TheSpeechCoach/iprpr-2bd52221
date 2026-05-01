import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";

interface JobRow {
  id: string;
  prep_session_id: string;
  user_id: string;
  status: string;
  stage: string | null;
  progress: number;
  questions_generated: number;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  failed_at: string | null;
  created_at: string;
  updated_at: string;
}

type Filter = "all" | "failed" | "processing" | "completed" | "stuck" | "incomplete";

export default function AdminGenerationJobs() {
  const [rows, setRows] = useState<JobRow[] | null>(null);
  const [emails, setEmails] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("generation_jobs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) { setRows([]); return; }
      const list = (data ?? []) as JobRow[];
      setRows(list);
      const userIds = Array.from(new Set(list.map((r) => r.user_id)));
      if (userIds.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id,email")
          .in("id", userIds);
        const map: Record<string, string> = {};
        for (const p of profs ?? []) map[p.id] = p.email ?? "";
        setEmails(map);
      }
    })();
  }, []);

  const visible = useMemo(() => {
    if (!rows) return [];
    const now = Date.now();
    return rows.filter((r) => {
      switch (filter) {
        case "failed": return r.status === "failed";
        case "processing": return r.status === "processing";
        case "completed": return r.status === "completed";
        case "incomplete": return r.status === "completed" && r.questions_generated < 50;
        case "stuck":
          return r.status === "processing"
            && r.updated_at && now - new Date(r.updated_at).getTime() > 10 * 60 * 1000;
        default: return true;
      }
    });
  }, [rows, filter]);

  return (
    <AdminLayout>
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold">Generation jobs</h1>
          <p className="text-sm text-muted-foreground">All background generation jobs. Use filters to find failures or stuck jobs.</p>
        </div>

        <div className="flex gap-1 flex-wrap">
          {(["all", "processing", "stuck", "failed", "incomplete", "completed"] as Filter[]).map((f) => (
            <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>
              {f}
            </Button>
          ))}
        </div>

        <div className="rounded-md border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead className="text-right">Progress</TableHead>
                <TableHead className="text-right">Qs</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead>Error</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows === null ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}><TableCell colSpan={9}><Skeleton className="h-5 w-full" /></TableCell></TableRow>
                ))
              ) : visible.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-10">
                    No jobs match.
                  </TableCell>
                </TableRow>
              ) : (
                visible.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{emails[r.user_id] ?? r.user_id.slice(0, 8)}</TableCell>
                    <TableCell>
                      <Badge variant={r.status === "failed" ? "destructive" : r.status === "completed" ? "default" : "secondary"}>
                        {r.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{r.stage ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{r.progress}%</TableCell>
                    <TableCell className={`text-right tabular-nums text-sm ${r.status === "completed" && r.questions_generated < 50 ? "text-destructive" : ""}`}>
                      {r.questions_generated}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{format(new Date(r.created_at), "d MMM HH:mm")}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{format(new Date(r.updated_at), "d MMM HH:mm")}</TableCell>
                    <TableCell className="text-xs text-destructive max-w-[260px] truncate" title={r.error_message ?? undefined}>
                      {r.error_message ?? ""}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="sm" variant="outline">
                        <Link to={`/admin/sessions/${r.prep_session_id}`}>Session</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </AdminLayout>
  );
}
