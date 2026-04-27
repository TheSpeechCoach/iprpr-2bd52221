-- 1. Add content hash column for CV dedupe
ALTER TABLE public.uploaded_files
ADD COLUMN IF NOT EXISTS cv_content_hash text;

CREATE INDEX IF NOT EXISTS idx_uploaded_files_user_hash
ON public.uploaded_files(user_id, cv_content_hash)
WHERE kind = 'cv' AND cv_content_hash IS NOT NULL;

-- Helpful indexes for usage counting
CREATE INDEX IF NOT EXISTS idx_prep_sessions_user_created
ON public.prep_sessions(user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_job_inputs_user_created
ON public.job_inputs(user_id, created_at);

-- 2. Period bounds: use Stripe billing period when available, else rolling 30d
CREATE OR REPLACE FUNCTION public.pro_period_bounds(_user_id uuid)
RETURNS TABLE(period_start timestamptz, period_end timestamptz)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(s.current_period_start, now() - interval '30 days') AS period_start,
    COALESCE(s.current_period_end,   now() + interval '30 days') AS period_end
  FROM (
    SELECT current_period_start, current_period_end
    FROM public.subscriptions
    WHERE user_id = _user_id
      AND status IN ('active','trialing','past_due')
      AND price_id IN ('pro_monthly','coach_plus_monthly')
    ORDER BY created_at DESC
    LIMIT 1
  ) s
  RIGHT JOIN (SELECT 1) x ON true;
$$;

-- 3. Usage counts within the current period
CREATE OR REPLACE FUNCTION public.pro_usage_counts(_user_id uuid)
RETURNS TABLE(
  period_start timestamptz,
  period_end timestamptz,
  distinct_roles integer,
  distinct_cvs integer,
  job_specs integer
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
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
    -- distinct (target_role, company_name) tuples in non-draft sessions
    (
      SELECT COUNT(*)::int FROM (
        SELECT DISTINCT
          lower(trim(coalesce(target_role, ''))) AS r,
          lower(trim(coalesce(company_name, ''))) AS c
        FROM public.prep_sessions
        WHERE user_id = _user_id
          AND status <> 'draft'
          AND created_at >= p_start
          AND created_at <  p_end
          AND coalesce(target_role, '') <> ''
      ) t
    ) AS distinct_roles,
    -- distinct CV content hashes uploaded in period
    (
      SELECT COUNT(DISTINCT cv_content_hash)::int
      FROM public.uploaded_files
      WHERE user_id = _user_id
        AND kind = 'cv'
        AND cv_content_hash IS NOT NULL
        AND created_at >= p_start
        AND created_at <  p_end
    ) AS distinct_cvs,
    -- job specs submitted in period
    (
      SELECT COUNT(*)::int
      FROM public.job_inputs
      WHERE user_id = _user_id
        AND created_at >= p_start
        AND created_at <  p_end
    ) AS job_specs;
END;
$$;

GRANT EXECUTE ON FUNCTION public.pro_period_bounds(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pro_usage_counts(uuid) TO authenticated;