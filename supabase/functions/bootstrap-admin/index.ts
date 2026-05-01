import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  // Admin bootstrap is for private beta only. Disable TESTING_MODE before production.
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const TESTING_MODE_RAW = Deno.env.get("TESTING_MODE") ?? "false";
  const TESTING_MODE = TESTING_MODE_RAW.trim().toLowerCase() === "true";
  const OWNER_ADMIN_EMAIL_RAW = Deno.env.get("OWNER_ADMIN_EMAIL") ?? "";
  const OWNER_ADMIN_EMAIL = OWNER_ADMIN_EMAIL_RAW.trim().toLowerCase();

  console.log("[bootstrap-admin] TESTING_MODE raw:", JSON.stringify(TESTING_MODE_RAW), "parsed:", TESTING_MODE);
  console.log("[bootstrap-admin] OWNER_ADMIN_EMAIL raw:", JSON.stringify(OWNER_ADMIN_EMAIL_RAW), "normalized:", JSON.stringify(OWNER_ADMIN_EMAIL));

  if (!TESTING_MODE) {
    return json({ error: "Bootstrap is disabled (TESTING_MODE is not 'true' on the edge function secrets)" }, 403);
  }
  if (!OWNER_ADMIN_EMAIL) return json({ error: "OWNER_ADMIN_EMAIL is not configured" }, 500);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user?.id) return json({ error: "Unauthorized" }, 401);

  const userId = userData.user.id;
  const userEmailRaw = userData.user.email ?? "";
  const userEmail = userEmailRaw.trim().toLowerCase();

  console.log("[bootstrap-admin] user.email raw:", JSON.stringify(userEmailRaw), "normalized:", JSON.stringify(userEmail));
  console.log("[bootstrap-admin] comparing:", JSON.stringify(userEmail), "===", JSON.stringify(OWNER_ADMIN_EMAIL), "→", userEmail === OWNER_ADMIN_EMAIL);

  if (!userEmail || userEmail !== OWNER_ADMIN_EMAIL) {
    await admin.from("admin_logs").insert({
      user_id: userId,
      action: "admin_bootstrap_denied",
      event: "admin_bootstrap_denied",
      metadata: { actor: userId, email: userEmail || null, expected: OWNER_ADMIN_EMAIL },
    });
    return json({
      error: `Forbidden: signed-in email (${userEmail || "none"}) does not match OWNER_ADMIN_EMAIL secret.`,
      debug: {
        testing_mode: TESTING_MODE,
        user_email_raw: userEmailRaw,
        user_email_normalized: userEmail,
        owner_email_raw: OWNER_ADMIN_EMAIL_RAW,
        owner_email_normalized: OWNER_ADMIN_EMAIL,
        user_email_length: userEmail.length,
        owner_email_length: OWNER_ADMIN_EMAIL.length,
        match: userEmail === OWNER_ADMIN_EMAIL,
      },
    }, 403);
  }

  const { error: profileErr } = await admin
    .from("profiles")
    .update({ role: "platform_admin" })
    .eq("id", userId);
  if (profileErr) return json({ error: profileErr.message }, 500);

  const { error: roleErr } = await admin
    .from("user_roles")
    .upsert({ user_id: userId, role: "admin" }, { onConflict: "user_id,role" });
  if (roleErr) return json({ error: roleErr.message }, 500);

  await admin.from("admin_logs").insert({
    user_id: userId,
    action: "admin_bootstrap_enabled",
    event: "admin_bootstrap_enabled",
    metadata: { actor: userId, email: userEmail },
  });

  return json({ ok: true, promoted: true });
});
