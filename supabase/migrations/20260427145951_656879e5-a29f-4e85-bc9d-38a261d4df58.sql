DROP VIEW IF EXISTS public.analytics_funnel_summary;
DROP VIEW IF EXISTS public.analytics_wizard_dropoff;

CREATE VIEW public.analytics_funnel_summary
WITH (security_invoker=on) AS
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

CREATE VIEW public.analytics_wizard_dropoff
WITH (security_invoker=on) AS
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