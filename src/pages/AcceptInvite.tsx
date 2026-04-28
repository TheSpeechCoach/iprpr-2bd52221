import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface InvitePreview {
  workspace_name: string;
  email: string;
  role: string;
  status: string;
  expires_at: string;
}

const AcceptInvite = () => {
  const { token } = useParams<{ token: string }>();
  const { user, loading: authLoading } = useAuth();
  const { refresh: refreshWorkspaces, setCurrentWorkspaceId } = useWorkspace();
  const navigate = useNavigate();
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    if (!token) return;
    (async () => {
      setLoading(true);
      const { data, error: err } = await supabase
        .from("workspace_invites")
        .select("email, role, status, expires_at, workspaces:workspace_id(name)")
        .eq("token", token)
        .maybeSingle();
      if (err || !data) {
        setError("Invite not found.");
      } else {
        setPreview({
          workspace_name: (data as any).workspaces?.name ?? "this workspace",
          email: (data as any).email,
          role: (data as any).role,
          status: (data as any).status,
          expires_at: (data as any).expires_at,
        });
      }
      setLoading(false);
    })();
  }, [token]);

  const handleAccept = async () => {
    if (!token) return;
    setAccepting(true);
    const { data, error: err } = await supabase.rpc("accept_workspace_invite", { _token: token });
    setAccepting(false);
    if (err) {
      toast({ title: "Couldn't accept invite", description: err.message, variant: "destructive" });
      return;
    }
    const wsId = (data as any)?.workspace_id as string | undefined;
    await refreshWorkspaces();
    if (wsId) setCurrentWorkspaceId(wsId);
    toast({ title: "Welcome to the workspace" });
    navigate("/dashboard");
  };

  if (loading || authLoading) {
    return (
      <div className="min-h-screen flex flex-col">
        <SiteHeader />
        <main className="container-tight py-16 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin" />
        </main>
      </div>
    );
  }

  if (error || !preview) {
    return (
      <div className="min-h-screen flex flex-col">
        <SiteHeader />
        <main className="container-tight py-16 max-w-md mx-auto text-center">
          <AlertCircle className="h-8 w-8 mx-auto text-destructive" />
          <h1 className="font-display text-2xl font-bold mt-3">Invite not available</h1>
          <p className="text-sm text-muted-foreground mt-2">{error ?? "This invite link is invalid."}</p>
          <Button variant="outline" className="mt-6" onClick={() => navigate("/")}>Go home</Button>
        </main>
      </div>
    );
  }

  const expired = new Date(preview.expires_at) < new Date();
  const blocked =
    preview.status === "revoked" ||
    preview.status === "expired" ||
    expired ||
    preview.status === "accepted";

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main className="container-tight py-16 max-w-md mx-auto text-center">
        <CheckCircle2 className="h-8 w-8 mx-auto text-primary" />
        <h1 className="font-display text-2xl font-bold mt-3">You've been invited</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Join <span className="font-medium text-foreground">{preview.workspace_name}</span> as{" "}
          <span className="font-medium text-foreground">{preview.role}</span>.
        </p>

        {blocked ? (
          <div className="mt-6 border border-border p-4 text-sm text-muted-foreground">
            {preview.status === "accepted"
              ? "This invite has already been used."
              : "This invite is no longer valid."}
          </div>
        ) : !user ? (
          <div className="mt-6 space-y-3">
            <p className="text-xs text-muted-foreground">Sign in or create an account to join.</p>
            <Button
              className="w-full"
              onClick={() => navigate(`/auth?redirect=/invite/${token}`)}
            >
              Sign in to accept
            </Button>
          </div>
        ) : (
          <Button className="mt-6 w-full" onClick={handleAccept} disabled={accepting}>
            {accepting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Join workspace
          </Button>
        )}
      </main>
    </div>
  );
};

export default AcceptInvite;
