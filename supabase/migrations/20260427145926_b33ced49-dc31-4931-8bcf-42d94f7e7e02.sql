-- Analytics events table
CREATE TABLE public.analytics_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  event_name TEXT NOT NULL,
  plan TEXT,
  session_id UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_analytics_events_user_id ON public.analytics_events(user_id);
CREATE INDEX idx_analytics_events_event_name ON public.analytics_events(event_name);
CREATE INDEX idx_analytics_events_created_at ON public.analytics_events(created_at DESC);
CREATE INDEX idx_analytics_events_session_id ON public.analytics_events(session_id);

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

-- Users insert own events (allow null user_id for pre-auth events like signup)
CREATE POLICY "ae insert own"
ON public.analytics_events
FOR INSERT
WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- Users view own events
CREATE POLICY "ae select own"
ON public.analytics_events
FOR SELECT
USING (auth.uid() = user_id);

-- Admins view all events
CREATE POLICY "ae admin read"
ON public.analytics_events
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Service role full management
CREATE POLICY "ae service role manage"
ON public.analytics_events
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Funnel summary view: per-day counts and results->upgrade conversion
CREATE OR REPLACE VIEW public.analytics_funnel_summary AS
SELECT
  date_trunc('day', created_at)::date AS day,
  COUNT(DISTINCT user_id) FILTER (WHERE event_name = 'results_viewed') AS results_viewed_users,
  COUNT(DISTINCT user_id) FILTER (WHERE event_name = 'upgrade_prompt_seen') AS upgrade_prompt_users,
  COUNT(DISTINCT user_id) FILTER (WHERE event_name = 'upgrade_clicked') AS upgrade_clicked_users,
  COUNT(DISTINCT user_id) FILTER (WHERE event_name = 'subscription_started') AS subscription_started_users,
  COUNT(DISTINCT user_id) FILTER (WHERE event_name = 'question_10_reached') AS reached_q10_users,
  CASE
    WHEN COUNT(DISTINCT user_id) FILTER (WHERE event_name = 'results_viewed') > 0
    THEN ROUND(
      100.0 * COUNT(DISTINCT user_id) FILTER (WHERE event_name = 'upgrade_clicked')
      / COUNT(DISTINCT user_id) FILTER (WHERE event_name = 'results_viewed'),
      2
    )
    ELSE 0
  END AS results_to_upgrade_pct
FROM public.analytics_events
GROUP BY day
ORDER BY day DESC;

-- Wizard drop-off view: distinct users at each step
CREATE OR REPLACE VIEW public.analytics_wizard_dropoff AS
WITH steps AS (
  SELECT 'prep_session_started'::text AS event_name, 1 AS step_order
  UNION ALL SELECT 'cv_uploaded', 2
  UNION ALL SELECT 'job_input_added', 3
  UNION ALL SELECT 'generation_started', 4
  UNION ALL SELECT 'generation_completed', 5
  UNION ALL SELECT 'results_viewed', 6
)
SELECT
  s.step_order,
  s.event_name,
  COUNT(DISTINCT e.user_id) AS users_reached
FROM steps s
LEFT JOIN public.analytics_events e ON e.event_name = s.event_name
GROUP BY s.step_order, s.event_name
ORDER BY s.step_order;