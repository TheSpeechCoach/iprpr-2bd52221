import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useCandidates } from "@/hooks/useCandidates";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { Users, UserPlus, Loader2 } from "lucide-react";
import { InvitesManager } from "@/components/InvitesManager";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface MemberRow {
  user_id: string;
  role: "owner" | "admin" | "member";
  joined_at: string;
  email?: string | null;
  full_name?: string | null;
}

const WorkspacePage = () => {
  const { user } = useAuth();
  const { current, loading: wsLoading } = useWorkspace();
  const { candidates, refresh: refreshCandidates } = useCandidates();
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newCand, setNewCand] = useState({ full_name: "", email: "", linkedin_url: "", current_role_text: "", notes: "" });
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    if (!current) return;
    (async () => {
      setLoadingMembers(true);
      const { data } = await supabase
        .from("workspace_members")
        .select("user_id, role, joined_at, profiles:user_id(email, full_name)")
        .eq("workspace_id", current.id);
      const rows: MemberRow[] = ((data as any[]) ?? []).map((r) => ({
        user_id: r.user_id,
        role: r.role,
        joined_at: r.joined_at,
        email: r.profiles?.email ?? null,
        full_name: r.profiles?.full_name ?? null,
      }));
      setMembers(rows);
      setLoadingMembers(false);
    })();
  }, [current]);

  const handleCreateCandidate = async () => {
    if (!current || !user || !newCand.full_name.trim()) {
      toast({ title: "Name required", variant: "destructive" });
      return;
    }
    setCreating(true);
    const { error } = await supabase.from("candidates").insert({
      workspace_id: current.id,
      created_by: user.id,
      full_name: newCand.full_name.trim(),
      email: newCand.email.trim() || null,
      linkedin_url: newCand.linkedin_url.trim() || null,
      current_role_text: newCand.current_role_text.trim() || null,
      notes: newCand.notes.trim() || null,
    });
    setCreating(false);
    if (error) {
      toast({ title: "Couldn't create candidate", description: error.message, variant: "destructive" });
      return;
    }
    setNewCand({ full_name: "", email: "", linkedin_url: "", current_role_text: "", notes: "" });
    setDialogOpen(false);
    void refreshCandidates();
    toast({ title: "Candidate added" });
  };

  if (wsLoading || !current) {
    return (
      <div className="min-h-screen flex flex-col">
        <SiteHeader />
        <main className="container-tight py-12 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin" />
        </main>
      </div>
    );
  }

  const canManage = current.role === "owner" || current.role === "admin";

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main className="container-tight flex-1 py-12 max-w-5xl space-y-12">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Workspace</div>
          <h1 className="font-display text-3xl font-bold mt-1">{current.name}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {current.is_personal ? "Personal workspace" : `Team workspace · ${current.role}`} · Plan:{" "}
            <span className="font-medium">{current.plan}</span>
          </p>
        </div>

        {/* Members */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-xl font-semibold flex items-center gap-2">
              <Users className="h-4 w-4" /> Members
            </h2>
          </div>
          {loadingMembers ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : (
            <div className="border border-border divide-y divide-border">
              {members.map((m) => (
                <div key={m.user_id} className="flex items-center justify-between p-3">
                  <div>
                    <div className="text-sm font-medium">{m.full_name || m.email || m.user_id.slice(0, 8)}</div>
                    {m.email && <div className="text-xs text-muted-foreground">{m.email}</div>}
                  </div>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{m.role}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Invites */}
        {canManage && !current.is_personal && user && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-xl font-semibold flex items-center gap-2">
                <UserPlus className="h-4 w-4" /> Invites
              </h2>
            </div>
            <InvitesManager workspaceId={current.id} userId={user.id} inviterRole={current.role} />
          </section>
        )}

        {/* Candidates */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-xl font-semibold">Candidates</h2>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <UserPlus className="h-4 w-4 mr-1.5" /> New candidate
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add candidate</DialogTitle>
                  <DialogDescription>
                    A candidate profile groups all prep sessions for one named person.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="cn">Full name</Label>
                    <Input id="cn" value={newCand.full_name} onChange={(e) => setNewCand({ ...newCand, full_name: e.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="ce">Email</Label>
                    <Input id="ce" value={newCand.email} onChange={(e) => setNewCand({ ...newCand, email: e.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="cl">LinkedIn URL</Label>
                    <Input id="cl" value={newCand.linkedin_url} onChange={(e) => setNewCand({ ...newCand, linkedin_url: e.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="cr">Current role</Label>
                    <Input id="cr" value={newCand.current_role_text} onChange={(e) => setNewCand({ ...newCand, current_role_text: e.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="cnotes">Notes</Label>
                    <Textarea id="cnotes" value={newCand.notes} onChange={(e) => setNewCand({ ...newCand, notes: e.target.value })} />
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={handleCreateCandidate} disabled={creating}>
                    {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Add candidate
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          {candidates.length === 0 ? (
            <div className="border border-dashed border-border p-6 text-sm text-muted-foreground text-center">
              No candidates yet. Add one to start a prep session for them.
            </div>
          ) : (
            <div className="border border-border divide-y divide-border">
              {candidates.map((c) => (
                <div key={c.id} className="p-3">
                  <div className="text-sm font-medium">{c.full_name}</div>
                  {c.current_role_text && <div className="text-xs text-muted-foreground">{c.current_role_text}</div>}
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default WorkspacePage;
