-- RPC: count distinct prep sessions exported by user in current pro period.
-- Counted via analytics_events where event_name in ('pack_exported_pdf','pack_exported_docx').
-- An export of the same session_id (in the same period) counts only once.
CREATE OR REPLACE FUNCTION public.pack_export_usage(_user_id uuid)
RETURNS TABLE(
  period_start timestamptz,
  period_end timestamptz,
  distinct_sessions_exported integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p_start timestamptz;
  p_end   timestamptz;
BEGIN
  SELECT b.period_start, b.period_end INTO p_start, p_end
  FROM public.pro_period_bounds(_user_id) b;

  RETURN QUERY
  SELECT
    p_start,
    p_end,
    (
      SELECT COUNT(DISTINCT session_id)::int
      FROM public.analytics_events
      WHERE user_id = _user_id
        AND session_id IS NOT NULL
        AND event_name IN ('pack_exported_pdf','pack_exported_docx')
        AND created_at >= p_start
        AND created_at <  p_end
    ) AS distinct_sessions_exported;
END;
$$;

-- Helper: has the user already exported this specific session in the current period?
CREATE OR REPLACE FUNCTION public.has_exported_session_in_period(_user_id uuid, _session_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH bounds AS (
    SELECT period_start, period_end FROM public.pro_period_bounds(_user_id)
  )
  SELECT EXISTS (
    SELECT 1
    FROM public.analytics_events ae, bounds b
    WHERE ae.user_id = _user_id
      AND ae.session_id = _session_id
      AND ae.event_name IN ('pack_exported_pdf','pack_exported_docx')
      AND ae.created_at >= b.period_start
      AND ae.created_at <  b.period_end
  );
$$;