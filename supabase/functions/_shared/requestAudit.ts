// Logs a single authenticated request to public.request_audit so the abuse
// detector can spot multi-IP usage. Best-effort: never throws.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function clientIp(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip");
}

export async function logRequest(req: Request, userId: string, route: string): Promise<void> {
  if (!userId) return;
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    await admin.from("request_audit").insert({
      user_id: userId,
      ip_address: clientIp(req),
      user_agent: req.headers.get("user-agent")?.slice(0, 300) ?? null,
      route,
    });
  } catch (err) {
    console.warn("[requestAudit] log failed", err);
  }
}
