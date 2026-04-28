// Calls score_account_abuse and, when score >= 3, opens an account_flags row.
// Idempotent: if an `open` flag already exists in the last 24h, it updates it
// rather than spamming new rows.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FLAG_THRESHOLD = 3;

export async function evaluateAccount(userId: string): Promise<{ score: number; flagged: boolean }> {
  if (!userId) return { score: 0, flagged: false };
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  try {
    const { data, error } = await admin.rpc("score_account_abuse", { _user_id: userId });
    if (error || !data || !data[0]) return { score: 0, flagged: false };
    const score: number = data[0].score ?? 0;
    const reasons = data[0].reasons ?? [];

    if (score < FLAG_THRESHOLD) return { score, flagged: false };

    // Look for a recent open flag.
    const { data: existing } = await admin
      .from("account_flags")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "open")
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .maybeSingle();

    const evidence = { score, threshold: FLAG_THRESHOLD, reasons, evaluated_at: new Date().toISOString() };

    if (existing?.id) {
      await admin.from("account_flags").update({ evidence, updated_at: new Date().toISOString() }).eq("id", existing.id);
    } else {
      await admin.from("account_flags").insert({
        user_id: userId,
        reason: "automated_abuse_score",
        evidence,
        status: "open",
      });
      await admin.from("admin_logs").insert({
        event: "account_flagged_automatic",
        metadata: { user_id: userId, score, reasons },
      });
    }
    return { score, flagged: true };
  } catch (err) {
    console.warn("[abuseDetector] evaluate failed", err);
    return { score: 0, flagged: false };
  }
}
