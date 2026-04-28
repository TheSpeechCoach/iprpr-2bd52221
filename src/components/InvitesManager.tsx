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
import { toast } from "@/hooks/use-toast";
import { Copy, Loader2, Mail, X } from "lucide-react";
import { isInviteExpired } from "@/lib/workspaceRoles";

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

export const InvitesManager = ({ workspaceId, userId }: Props) => {
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "member">("member");
  const [creating, setCreating] = useState(false);

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

  const handleCreate = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !/^\S+@\S+\.\S+$/.test(trimmed)) {
      toast({ title: "Enter a valid email", variant: "destructive" });
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
      .select("id, token")
      .single();
    setCreating(false);
    if (error || !data) {
      toast({
        title: "Couldn't create invite",
        description: error?.message,
        variant: "destructive",
      });
      return;
    }
    await navigator.clipboard.writeText(acceptUrl(data.token)).catch(() => {});
    toast({ title: "Invite created", description: "Link copied to clipboard." });
    setEmail("");
    setRole("member");
    void load();
  };

  const handleRevoke = async (id: string) => {
    const { error } = await supabase.rpc("revoke_workspace_invite", { _invite_id: id });
    if (error) {
      toast({ title: "Couldn't revoke", description: error.message, variant: "destructive" });
      return;
    }
    void load();
  };

  const handleCopy = async (token: string) => {
    await navigator.clipboard.writeText(acceptUrl(token));
    toast({ title: "Link copied" });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
        <div className="flex-1">
          <Label htmlFor="invite-email" className="text-xs">Invite email</Label>
          <Input
            id="invite-email"
            type="email"
            placeholder="teammate@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="w-full sm:w-32">
          <Label className="text-xs">Role</Label>
          <Select value={role} onValueChange={(v) => setRole(v as "admin" | "member")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="member">Member</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={handleCreate} disabled={creating}>
          {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Mail className="h-4 w-4 mr-2" />}
          Create invite
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        We'll generate a single-use link valid for 72 hours. Share it with your teammate — they'll sign in and auto-join.
      </p>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading invites…</div>
      ) : invites.length === 0 ? (
        <div className="border border-dashed border-border p-4 text-sm text-muted-foreground text-center">
          No invites yet.
        </div>
      ) : (
        <div className="border border-border divide-y divide-border">
          {invites.map((inv) => {
            const expired = isInviteExpired(inv.expires_at);
            const effectiveStatus = inv.status === "pending" && expired ? "expired" : inv.status;
            return (
              <div key={inv.id} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{inv.email}</div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {inv.role} · {effectiveStatus}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {effectiveStatus === "pending" && (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => handleCopy(inv.token)}>
                        <Copy className="h-3.5 w-3.5 mr-1" /> Copy link
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleRevoke(inv.id)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
