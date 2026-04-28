// Send a workspace invite email.
// Best-effort: if no email infrastructure is configured for this project, it
// returns { sent: false, reason: "email_not_configured" } so the UI can fall
// back to the copyable invite link without surfacing an error.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Body {
  inviteId: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "unauthenticated" }, 401);
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Caller (RLS) — used only to confirm the user can read the invite
    const callerClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes } = await callerClient.auth.getUser();
    if (!userRes?.user) return json({ error: "unauthenticated" }, 401);

    const { inviteId }: Body = await req.json();
    if (!inviteId) return json({ error: "inviteId required" }, 400);

    // Service-role read (we already authorised via RLS above on caller client)
    const admin = createClient(supabaseUrl, serviceKey);
    const { data: invite, error: invErr } = await admin
      .from("workspace_invites")
      .select("id, email, role, token, expires_at, workspace_id, workspaces:workspace_id(name)")
      .eq("id", inviteId)
      .maybeSingle();
    if (invErr || !invite) return json({ error: "invite_not_found" }, 404);

    // Confirm caller is owner/admin of that workspace
    const { data: roleRow } = await admin
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", invite.workspace_id)
      .eq("user_id", userRes.user.id)
      .maybeSingle();
    if (!roleRow || (roleRow.role !== "owner" && roleRow.role !== "admin")) {
      return json({ error: "forbidden" }, 403);
    }

    const origin = req.headers.get("origin") ?? "";
    const acceptUrl = `${origin}/invite/${invite.token}`;

    // Best-effort send — if send-transactional-email isn't deployed, treat as not configured
    try {
      const { data: sendData, error: sendErr } = await admin.functions.invoke(
        "send-transactional-email",
        {
          body: {
            templateName: "workspace-invite",
            recipientEmail: invite.email,
            idempotencyKey: `workspace-invite-${invite.id}`,
            templateData: {
              workspaceName: (invite as any).workspaces?.name ?? "your workspace",
              role: invite.role,
              acceptUrl,
            },
          },
        },
      );
      if (sendErr) {
        const msg = String(sendErr.message ?? "");
        if (/Function not found|404|not configured/i.test(msg)) {
          return json({ sent: false, reason: "email_not_configured", acceptUrl });
        }
        return json({ sent: false, reason: "send_failed", message: msg, acceptUrl });
      }
      return json({ sent: true, acceptUrl, sendData });
    } catch (e) {
      return json({ sent: false, reason: "email_not_configured", acceptUrl });
    }
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
