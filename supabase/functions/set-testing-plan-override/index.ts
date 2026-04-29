// Admin-only edge function to set or clear a testing plan override.
// Refuses to operate when testing_mode is off in app_settings.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const VALID_PLANS = new Set(["free", "pro", "coach_plus"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: uErr } = await userClient.auth.getUser();
    if (uErr || !userData?.user?.id) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const callerId = userData.user.id;

    // Verify caller is platform admin
    const { data: isAdmin } = await admin.rpc("has_role", {
      _user_id: callerId, _role: "admin",
    });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden: admin required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify testing mode is on
    const { data: testingOn } = await admin.rpc("testing_mode_enabled");
    if (!testingOn) {
      return new Response(
        JSON.stringify({ error: "Testing mode is not enabled" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = await req.json().catch(() => ({}));
    const targetUserId: string = body.user_id ?? callerId;
    const action: "set" | "clear" = body.action === "clear" ? "clear" : "set";
    const plan: string | null = body.plan ?? null;

    if (action === "clear") {
      await admin.from("testing_plan_overrides").delete().eq("user_id", targetUserId);
      await admin.from("admin_logs").insert({
        event: "testing_plan_override_cleared",
        metadata: { actor: callerId, target_user: targetUserId },
      });
      return new Response(
        JSON.stringify({ ok: true, cleared: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!plan || !VALID_PLANS.has(plan)) {
      return new Response(
        JSON.stringify({ error: "plan must be one of: free, pro, coach_plus" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data, error } = await admin
      .from("testing_plan_overrides")
      .upsert(
        { user_id: targetUserId, override_plan: plan, created_by: callerId },
        { onConflict: "user_id" },
      )
      .select()
      .single();
    if (error) throw error;

    await admin.from("admin_logs").insert({
      event: "testing_plan_override_set",
      metadata: { actor: callerId, target_user: targetUserId, plan },
    });

    return new Response(
      JSON.stringify({ ok: true, override: data }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("set-testing-plan-override error:", e?.message ?? e);
    return new Response(
      JSON.stringify({ error: e?.message ?? String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
