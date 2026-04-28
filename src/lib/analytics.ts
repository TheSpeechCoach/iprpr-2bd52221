import { supabase } from "@/integrations/supabase/client";

export type AnalyticsEvent =
  | "user_signed_up"
  | "prep_session_started"
  | "cv_uploaded"
  | "job_input_added"
  | "generation_started"
  | "generation_completed"
  | "results_viewed"
  | "question_10_reached"
  | "upgrade_prompt_seen"
  | "upgrade_clicked"
  | "subscription_started"
  | "pack_exported_pdf"
  | "pack_exported_docx"
  | "pack_export_blocked";

interface TrackOptions {
  userId?: string | null;
  plan?: string | null;
  sessionId?: string | null;
  workspaceId?: string | null;
  metadata?: Record<string, unknown>;
}

// In-memory dedupe so view-style events (results_viewed, question_10_reached,
// upgrade_prompt_seen) don't get spammed on re-render within a session.
const seenKeys = new Set<string>();

function readActiveWorkspaceId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("ipp.currentWorkspaceId");
}

/**
 * Fire-and-forget analytics tracker. Resolves the user id automatically if not
 * provided. Never throws — failures are logged to the console only.
 */
export async function track(event: AnalyticsEvent, opts: TrackOptions = {}): Promise<void> {
  try {
    let userId = opts.userId ?? null;
    if (userId === undefined || userId === null) {
      const { data } = await supabase.auth.getUser();
      userId = data.user?.id ?? null;
    }
    const workspaceId = opts.workspaceId ?? readActiveWorkspaceId();

    await supabase.from("analytics_events").insert([
      {
        event_name: event,
        user_id: userId,
        plan: opts.plan ?? null,
        session_id: opts.sessionId ?? null,
        workspace_id: workspaceId,
        metadata: (opts.metadata ?? {}) as never,
      },
    ]);
  } catch (err) {
    // Don't break the user flow on analytics errors.
    // eslint-disable-next-line no-console
    console.warn("[analytics] failed to record event", event, err);
  }
}

/**
 * Track an event at most once per browser session for a given key.
 * Useful for view-style events (e.g. upgrade_prompt_seen, results_viewed).
 */
export function trackOnce(
  event: AnalyticsEvent,
  dedupeKey: string,
  opts: TrackOptions = {},
): void {
  const key = `${event}:${dedupeKey}`;
  if (seenKeys.has(key)) return;
  seenKeys.add(key);
  void track(event, opts);
}
