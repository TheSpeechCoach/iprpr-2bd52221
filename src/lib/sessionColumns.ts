/**
 * Canonical column names for the two tables that link to a prep session.
 *
 * `interview_questions.session_id` and `generation_jobs.prep_session_id`
 * both reference `prep_sessions.id` and are semantically identical. We
 * deliberately did NOT rename `interview_questions.session_id` during the
 * stabilisation pass to avoid breaking Practice, Results, exports, and the
 * dashboard. Use these constants to make the intent explicit at every call
 * site so the two never get crossed in a single query.
 *
 * Rule of thumb:
 *   - counting / reading questions  → use QUESTION_SESSION_COLUMN
 *   - reading job rows by session   → use GENERATION_JOB_SESSION_COLUMN
 */
export const QUESTION_SESSION_COLUMN = "session_id" as const;
export const GENERATION_JOB_SESSION_COLUMN = "prep_session_id" as const;

/** Allowed values for `prep_sessions.status`. */
export type PrepSessionStatus =
  | "draft"
  | "generating"
  | "initial_ready"
  | "ready"
  | "failed"
  | "blocked";

/** How many questions must be visible before we auto-redirect to Results. */
export const INITIAL_READY_THRESHOLD = 10;
