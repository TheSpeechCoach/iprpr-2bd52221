// Canonical product & schema decisions registry.
// Single source of truth referenced by frontend code; mirrors mem://product/decision-registry.md.

export const PRODUCT_DECISIONS = {
  generationJobs: {
    canonicalSessionColumn: "prep_session_id",
    canonicalStageColumn: "stage",
    canonicalProgressColumn: "progress",
    useEnumStatus: true,
    allowLegacyAliases: false,
  },
  build: {
    sequence: "data_model_first_billing_second",
  },
  usage: {
    reset: "billing_period",
  },
  exports: {
    counting: "distinct_sessions_only",
  },
  cvCounting: "distinct_content_hash",
  abuse: {
    model: "composite_score",
    execution: "inline_and_cron",
  },
  team: {
    pricing: "tiered_seat_bundles",
    roles: ["owner", "admin", "member"],
  },
  invites: {
    method: "email_plus_link",
  },
} as const;

export type ProductDecisions = typeof PRODUCT_DECISIONS;
