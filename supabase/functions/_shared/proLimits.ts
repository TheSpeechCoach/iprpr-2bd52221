// Shared Pro plan limit checks for edge functions.
// Caller is expected to pass an admin (service-role) Supabase client.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export const PRO_LIMITS = {
  distinctRolesPerPeriod: 3,
  distinctCvsPerPeriod: 3,
  jobSpecsPerPeriod: 5,
} as const;

/** Per-plan distinct CV upload caps within the current billing period. */
export const CV_DISTINCT_LIMITS: Record<"free" | "pro" | "coach_plus", number> = {
  free: 0,            // free tier handled separately (session cap)
  pro: 3,
  coach_plus: 8,
};

/**
 * Normalise extracted CV text for stable content hashing:
 * lowercase, trim, collapse whitespace. Minor punctuation/formatting
 * tweaks therefore still match the same hash.
 */
export function normaliseCvText(input: string): string {
  return input
    .toLowerCase()
    .replace(/\r\n?/g, "\n")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Hash the normalised extracted CV text. Falls back to hashing raw file
 * bytes if extraction produced nothing usable.
 */
export async function hashCvContent(
  extractedText: string | null | undefined,
  rawBytes: Uint8Array,
): Promise<{ hash: string; source: "text" | "bytes" }> {
  const normalised = normaliseCvText(extractedText ?? "");
  if (normalised.length >= 50) {
    const enc = new TextEncoder().encode(normalised);
    return { hash: await sha256Hex(enc), source: "text" };
  }
  return { hash: await sha256Hex(rawBytes), source: "bytes" };
}

export interface ProUsageRow {
  period_start: string;
  period_end: string;
  distinct_roles: number;
  distinct_cvs: number;
  job_specs: number;
}

/**
 * Returns the user's plan via the get_user_plan helper.
 * Falls back to "free" on any error.
 */
export async function getUserPlan(
  admin: SupabaseClient,
  userId: string,
  env: "sandbox" | "live",
): Promise<"free" | "pro" | "coach_plus"> {
  const { data } = await admin.rpc("get_user_plan", { _user_id: userId, _env: env });
  return ((data as any) ?? "free") as "free" | "pro" | "coach_plus";
}

export async function getProUsage(
  admin: SupabaseClient,
  userId: string,
): Promise<ProUsageRow | null> {
  const { data, error } = await admin.rpc("pro_usage_counts", { _user_id: userId });
  if (error || !data) return null;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    period_start: row.period_start,
    period_end: row.period_end,
    distinct_roles: Number(row.distinct_roles ?? 0),
    distinct_cvs: Number(row.distinct_cvs ?? 0),
    job_specs: Number(row.job_specs ?? 0),
  };
}

/**
 * SHA-256 hex digest. Used to identify duplicate CV uploads by content.
 */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface LimitBlock {
  error: "PRO_LIMIT_REACHED";
  limit_key: "distinctRolesPerPeriod" | "distinctCvsPerPeriod" | "jobSpecsPerPeriod";
  used: number;
  limit: number;
  period_end: string;
  message: string;
}

export function buildLimitBlock(
  key: LimitBlock["limit_key"],
  used: number,
  periodEnd: string,
): LimitBlock {
  const limit = PRO_LIMITS[key];
  const labels: Record<LimitBlock["limit_key"], string> = {
    distinctRolesPerPeriod: "target roles",
    distinctCvsPerPeriod: "CV uploads",
    jobSpecsPerPeriod: "job specs",
  };
  const reset = new Date(periodEnd).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return {
    error: "PRO_LIMIT_REACHED",
    limit_key: key,
    used,
    limit,
    period_end: periodEnd,
    message:
      `You've reached your Pro plan allowance of ${limit} ${labels[key]} this period. ` +
      `Your allowance resets on ${reset}.`,
  };
}
