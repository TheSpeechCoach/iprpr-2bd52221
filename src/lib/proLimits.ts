/**
 * Pro plan monthly caps.
 *
 * Counted within the user's current Stripe billing period (or a rolling
 * 30-day window if no period exists). Soft warning at 80% utilisation,
 * hard block at 100%. Coach+ has no caps.
 */
export const PRO_LIMITS = {
  distinctRolesPerPeriod: 3,
  distinctCvsPerPeriod: 3,
  jobSpecsPerPeriod: 5,
} as const;

/** Per-plan distinct CV upload caps within the current billing period. */
export const CV_DISTINCT_LIMITS: Record<"free" | "pro" | "coach_plus", number> = {
  free: 0,
  pro: 3,
  coach_plus: 8,
};

/**
 * Per-plan export caps within the current billing period.
 * Counted as distinct prep sessions exported (re-exports of the same pack
 * in the same period don't count again). PDF and DOCX share this budget.
 */
export const EXPORT_DISTINCT_LIMITS: Record<"free" | "pro" | "coach_plus", number> = {
  free: 0,
  pro: 3,
  coach_plus: 10,
};

export type ProLimitKey = keyof typeof PRO_LIMITS;

export const PRO_LIMIT_LABEL: Record<ProLimitKey, string> = {
  distinctRolesPerPeriod: "target roles",
  distinctCvsPerPeriod: "CV uploads",
  jobSpecsPerPeriod: "job specs",
};

/** Soft-warn threshold (inclusive). At/above this, surface a warning banner. */
export const SOFT_WARN_RATIO = 0.8;

export function utilisationStatus(used: number, limit: number): "ok" | "warn" | "block" {
  if (limit <= 0) return "ok";
  const ratio = used / limit;
  if (ratio >= 1) return "block";
  if (ratio >= SOFT_WARN_RATIO) return "warn";
  return "ok";
}

/** Format the period end as a friendly UK date string. */
export function formatResetDate(iso: string | null): string {
  if (!iso) return "the end of your billing period";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
