import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Copy, Loader2, Mail, MailCheck, UserPlus, X } from "lucide-react";
import {
  canAssignInviteRole,
  isInviteExpired,
  type WorkspaceRole,
} from "@/lib/workspaceRoles";

interface InviteRow {
  id: string;
  email: string;
  role: "admin" | "member";
  token: string;
  status: "pending" | "accepted" | "revoked" | "expired";
  expires_at: string;
  created_at: string;
}

interface Props {
  workspaceId: string;
  userId: string;
  inviterRole: WorkspaceRole;
}

const generateToken = () => {
  const arr = new Uint8Array(24);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

const acceptUrl = (token: string) =>
  `${window.location.origin}/invite/${token}`;

export const InvitesManager = ({ workspaceId, userId, inviterRole }: Props) => {
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "member">("member");
  const [creating, setCreating] = useState(false);

  // Post-create result state (shown inside modal)
  const [createdInvite, setCreatedInvite] = useState<{ token: string; email: string; emailed: boolean } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("workspace_invites")
      .select("id, email, role, token, status, expires_at, created_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });
    if (!error && data) setInvites(data as InviteRow[]);
    setLoading(false);
  }, [workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const resetModal = () => {
    setEmail("");
    setRole("member");
    setCreatedInvite(null);
  };

  const handleCreate = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !/^\S+@\S+\.\S+$/.test(trimmed)) {
      toast({ title: "Enter a valid email", variant: "destructive" });
      return;
    }
    if (!canAssignInviteRole(inviterRole, role)) {
      toast({ title: "You cannot assign that role", variant: "destructive" });
      return;
    }
    setCreating(true);
    const token = generateToken();
    const { data, error } = await supabase
      .from("workspace_invites")
      .insert({
        workspace_id: workspaceId,
        email: trimmed,
        role,
        token,
        invited_by: userId,
      })
      .select("id, token, email")
      .single();

    if (error || !data) {
      setCreating(false);
      toast({
        title: "Couldn't create invite",
        description: error?.message,
        variant: "destructive",
      });
      return;
    }

    // Best-effort email send
    let emailed = false;
    try {
      const { data: res } = await supabase.functions.invoke("send-workspace-invite", {
        body: { inviteId: data.id },
      });
      emailed = !!(res && (res as { sent?: boolean }).sent);
    } catch {
      emailed = false;
    }

    setCreatedInvite({ token: data.token, email: data.email, emailed });
    setCreating(false);
    void load();
  };

  const handleRevoke = async (id: string) => {
    const { error } = await supabase.rpc("revoke_workspace_invite", { _invite_id: id });
    if (error) {
      toast({ title: "Couldn't revoke", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Invite revoked" });
    void load();
  };

  const handleCopy = async (token: string) => {
    await navigator.clipboard.writeText(acceptUrl(token));
    toast({ title: "Link copied" });
  };

  const pending = invites.filter(
    (i) => i.status === "pending" && !isInviteExpired(i.expires_at),
  );
  const history = invites.filter(
    (i) => !(i.status === "pending" && !isInviteExpired(i.expires_at)),
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog
          open={modalOpen}
          onOpenChange={(open) => {
            setModalOpen(open);
            if (!open) resetModal();
          }}
        >
          <Button onClick={() => setModalOpen(true)} size="sm">
            <UserPlus className="h-4 w-4 mr-1.5" /> Invite member
          </Button>
          <DialogContent>
            {!createdInvite ? (
              <>
                <DialogHeader>
                  <DialogTitle>Invite a teammate</DialogTitle>
                  <DialogDescription>
                    They'll receive a single-use link valid for 72 hours.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="invite-email">Email address</Label>
                    <Input
                      id="invite-email"
                      type="email"
                      placeholder="teammate@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Role</Label>
                    <Select value={role} onValueChange={(v) => setRole(v as "admin" | "member")}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="member">Member</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button>
                  <Button onClick={handleCreate} disabled={creating}>
                    {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Mail className="h-4 w-4 mr-2" />}
                    Send invite
                  </Button>
                </DialogFooter>
              </>
            ) : (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <MailCheck className="h-5 w-5 text-primary" />
                    Invite sent
                  </DialogTitle>
                  <DialogDescription>
                    {createdInvite.emailed
                      ? `We've emailed an invite link to ${createdInvite.email}.`
                      : `Invite created for ${createdInvite.email}. Email sending isn't set up yet — share the link below instead.`}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-2">
                  <Label className="text-xs">Copyable invite link (fallback)</Label>
                  <div className="flex gap-2">
                    <Input readOnly value={acceptUrl(createdInvite.token)} className="font-mono text-xs" />
                    <Button variant="outline" size="icon" onClick={() => handleCopy(createdInvite.token)}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Single-use · expires in 72 hours · invitee must sign in to join.
                  </p>
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => { resetModal(); }}>
                    Send another
                  </Button>
                  <Button onClick={() => setModalOpen(false)}>Done</Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {/* Pending invites */}
      <div>
        <h3 className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
          Pending invites
        </h3>
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : pending.length === 0 ? (
          <div className="border border-dashed border-border p-4 text-sm text-muted-foreground text-center">
            No pending invites.
          </div>
        ) : (
          <div className="border border-border divide-y divide-border">
            {pending.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{inv.email}</div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {inv.role} · expires {new Date(inv.expires_at).toLocaleDateString("en-GB")}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" onClick={() => handleCopy(inv.token)}>
                    <Copy className="h-3.5 w-3.5 mr-1" /> Copy link
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleRevoke(inv.id)}
                    aria-label="Revoke invite"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* History */}
      {history.length > 0 && (
        <div>
          <h3 className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
            History
          </h3>
          <div className="border border-border divide-y divide-border">
            {history.slice(0, 8).map((inv) => {
              const expired = isInviteExpired(inv.expires_at);
              const status = inv.status === "pending" && expired ? "expired" : inv.status;
              return (
                <div key={inv.id} className="flex items-center justify-between p-3">
                  <div className="min-w-0">
                    <div className="text-sm truncate">{inv.email}</div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {inv.role} · {status}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
