import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";

interface AdminUser {
  user_id: string;
  email: string | null;
  full_name: string | null;
  signup_date: string;
  plan_sandbox: string;
  plan_live: string;
  override_plan: string | null;
  sessions_count: number;
  saved_answers_count: number;
  last_activity: string | null;
}

const PLAN_LABELS: Record<string, string> = {
  free: "Free",
  pro: "Pro",
  coach_plus: "Coach+",
};

export default function AdminUsers() {
  const [rows, setRows] = useState<AdminUser[] | null>(null);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async (q?: string) => {
    setRows(null);
    const { data, error } = await supabase.rpc("admin_list_users", {
      _limit: 200,
      _search: q && q.trim() ? q.trim() : null,
    });
    if (error) {
      toast.error(error.message);
      setRows([]);
      return;
    }
    setRows((data ?? []) as AdminUser[]);
  };

  useEffect(() => { load(); }, []);

  const setOverride = async (userId: string, plan: "free" | "pro" | "coach_plus" | "clear") => {
    setBusyId(userId);
    try {
      const body = plan === "clear"
        ? { action: "clear", user_id: userId }
        : { action: "set", user_id: userId, plan };
      const { error } = await supabase.functions.invoke("set-testing-plan-override", { body });
      if (error) throw error;
      toast.success(plan === "clear" ? "Override cleared" : `Set to ${PLAN_LABELS[plan]}`);
      await load(search);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold">Users</h1>
          <p className="text-sm text-muted-foreground">All registered users with plan, activity and quick override controls.</p>
        </div>

        <form
          className="flex gap-2"
          onSubmit={(e) => { e.preventDefault(); load(search); }}
        >
          <Input
            placeholder="Search by email or name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
          <Button type="submit" variant="outline" size="sm">Search</Button>
          {search && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => { setSearch(""); load(); }}
            >
              Clear
            </Button>
          )}
        </form>

        <div className="rounded-md border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Override</TableHead>
                <TableHead className="text-right">Sessions</TableHead>
                <TableHead className="text-right">Saved</TableHead>
                <TableHead>Signed up</TableHead>
                <TableHead>Last active</TableHead>
                <TableHead className="text-right">Set override</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows === null ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={9}><Skeleton className="h-5 w-full" /></TableCell>
                  </TableRow>
                ))
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-10">
                    No users found.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((u) => {
                  const effectivePlan = u.override_plan ?? (u.plan_live !== "free" ? u.plan_live : u.plan_sandbox);
                  return (
                    <TableRow key={u.user_id}>
                      <TableCell className="font-mono text-xs">{u.email ?? "—"}</TableCell>
                      <TableCell className="text-sm">{u.full_name || "—"}</TableCell>
                      <TableCell>
                        <Badge variant={effectivePlan === "free" ? "secondary" : "default"}>
                          {PLAN_LABELS[effectivePlan] ?? effectivePlan}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {u.override_plan ? (
                          <Badge variant="outline" className="border-amber-400 text-amber-700">
                            {PLAN_LABELS[u.override_plan]}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{u.sessions_count}</TableCell>
                      <TableCell className="text-right tabular-nums">{u.saved_answers_count}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {format(new Date(u.signup_date), "d MMM yyyy")}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {u.last_activity ? format(new Date(u.last_activity), "d MMM HH:mm") : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Select
                            disabled={busyId === u.user_id}
                            onValueChange={(v) => setOverride(u.user_id, v as any)}
                          >
                            <SelectTrigger className="h-7 w-[110px] text-xs">
                              <SelectValue placeholder="Set…" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="free">Free</SelectItem>
                              <SelectItem value="pro">Pro</SelectItem>
                              <SelectItem value="coach_plus">Coach+</SelectItem>
                              <SelectItem value="clear">Clear</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </AdminLayout>
  );
}
