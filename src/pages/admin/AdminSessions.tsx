import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { format } from "date-fns";

interface AdminSession {
  session_id: string;
  title: string;
  user_id: string;
  user_email: string | null;
  candidate_name: string | null;
  target_role: string | null;
  company_name: string | null;
  status: string;
  question_count: number;
  generation_status: string | null;
  generation_progress: number | null;
  created_at: string;
}

const STATUS_TONE: Record<string, string> = {
  ready: "default",
  initial_ready: "secondary",
  generating: "secondary",
  failed: "destructive",
  draft: "outline",
  blocked: "destructive",
};

export default function AdminSessions() {
  const [rows, setRows] = useState<AdminSession[] | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "incomplete" | "failed">("all");

  const load = async (q?: string) => {
    setRows(null);
    const { data, error } = await supabase.rpc("admin_list_sessions", {
      _limit: 300,
      _search: q && q.trim() ? q.trim() : null,
    });
    if (error) {
      toast.error(error.message);
      setRows([]);
      return;
    }
    setRows((data ?? []) as AdminSession[]);
  };

  useEffect(() => { load(); }, []);

  const visible = (rows ?? []).filter((r) => {
    if (filter === "failed") return r.status === "failed" || r.generation_status === "failed";
    if (filter === "incomplete") return r.status === "ready" && r.question_count < 50;
    return true;
  });

  return (
    <AdminLayout>
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold">Sessions</h1>
          <p className="text-sm text-muted-foreground">All prep sessions across the platform.</p>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <form
            className="flex gap-2"
            onSubmit={(e) => { e.preventDefault(); load(search); }}
          >
            <Input
              placeholder="Search title, role, company, email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-80"
            />
            <Button type="submit" variant="outline" size="sm">Search</Button>
            {search && (
              <Button type="button" variant="ghost" size="sm" onClick={() => { setSearch(""); load(); }}>Clear</Button>
            )}
          </form>
          <div className="flex gap-1 ml-auto">
            {(["all", "incomplete", "failed"] as const).map((f) => (
              <Button
                key={f}
                variant={filter === f ? "default" : "outline"}
                size="sm"
                onClick={() => setFilter(f)}
              >
                {f === "all" ? "All" : f === "incomplete" ? "Incomplete (<50)" : "Failed"}
              </Button>
            ))}
          </div>
        </div>

        <div className="rounded-md border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Candidate</TableHead>
                <TableHead>Target role</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Generation</TableHead>
                <TableHead className="text-right">Qs</TableHead>
                <TableHead>Created</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows === null ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}><TableCell colSpan={10}><Skeleton className="h-5 w-full" /></TableCell></TableRow>
                ))
              ) : visible.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-sm text-muted-foreground py-10">
                    No sessions match.
                  </TableCell>
                </TableRow>
              ) : (
                visible.map((s) => (
                  <TableRow key={s.session_id}>
                    <TableCell className="text-sm font-medium max-w-[220px] truncate">{s.title}</TableCell>
                    <TableCell className="font-mono text-xs">{s.user_email ?? "—"}</TableCell>
                    <TableCell className="text-sm">{s.candidate_name || "—"}</TableCell>
                    <TableCell className="text-sm">{s.target_role || "—"}</TableCell>
                    <TableCell className="text-sm">{s.company_name || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={(STATUS_TONE[s.status] ?? "secondary") as any}>{s.status}</Badge>
                    </TableCell>
                    <TableCell>
                      {s.generation_status ? (
                        <span className="text-xs">
                          <Badge variant={s.generation_status === "failed" ? "destructive" : "outline"}>
                            {s.generation_status}
                          </Badge>
                          {s.generation_progress != null && (
                            <span className="ml-1 text-muted-foreground">{s.generation_progress}%</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className={`text-right tabular-nums text-sm ${s.question_count < 50 && s.status === "ready" ? "text-destructive" : ""}`}>
                      {s.question_count}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {format(new Date(s.created_at), "d MMM HH:mm")}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="sm" variant="outline">
                        <Link to={`/admin/sessions/${s.session_id}`}>View</Link>
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
