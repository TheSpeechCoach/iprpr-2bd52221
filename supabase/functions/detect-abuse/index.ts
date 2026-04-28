// Scheduled abuse detector. Iterates over recently-active users and
// evaluates their composite abuse score. Designed to be triggered by pg_cron
// every 15 minutes. Returns counts for observability.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { evaluateAccount } from "../_shared/abuseDetector.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Active users in the last 24h: anyone who created a session, uploaded a CV,
  // or hit a tracked analytics event. Union via three queries.
  const userIds = new Set<string>();

  const [{ data: a }, { data: b }, { data: c }] = await Promise.all([
    admin.from("prep_sessions").select("user_id").gte("created_at", since),
    admin.from("uploaded_files").select("user_id").gte("created_at", since),
    admin.from("request_audit").select("user_id").gte("created_at", since),
  ]);
  for (const row of [...(a ?? []), ...(b ?? []), ...(c ?? [])]) {
    if (row.user_id) userIds.add(row.user_id);
  }

  let evaluated = 0, flagged = 0;
  for (const uid of userIds) {
    const result = await evaluateAccount(uid);
    evaluated++;
    if (result.flagged) flagged++;
  }

  return new Response(JSON.stringify({ evaluated, flagged }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: 200,
  });
});
