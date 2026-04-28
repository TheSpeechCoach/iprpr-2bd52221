-- 1. request_audit table
CREATE TABLE public.request_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  ip_address text,
  user_agent text,
  route text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_request_audit_user_created ON public.request_audit (user_id, created_at DESC);
CREATE INDEX idx_request_audit_user_ip ON public.request_audit (user_id, ip_address);

ALTER TABLE public.request_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ra select own" ON public.request_audit
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "ra admin read" ON public.request_audit
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "ra service role manage" ON public.request_audit
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- 2. recent_abuse_signals
CREATE OR REPLACE FUNCTION public.recent_abuse_signals(_user_id uuid)
RETURNS TABLE (
  distinct_candidate_names integer,
  distinct_cv_names integer,
  distinct_target_industries integer,
  distinct_ips_24h integer,
  exports_24h integer,
  distinct_job_titles_7d integer
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (
      SELECT COUNT(DISTINCT lower(trim(full_name)))::int
      FROM public.prep_sessions
      WHERE user_id = _user_id
        AND coalesce(full_name, '') <> ''
        AND created_at >= now() - interval '30 days'
    ),
    (
      SELECT COUNT(DISTINCT lower(trim(substring(extracted_text from 1 for 200))))::int
      FROM public.uploaded_files
      WHERE user_id = _user_id
        AND kind = 'cv'
        AND extracted_text IS NOT NULL
        AND created_at >= now() - interval '30 days'
    ),
    (
      SELECT COUNT(DISTINCT lower(trim(target_industry)))::int
      FROM public.prep_sessions
      WHERE user_id = _user_id
        AND coalesce(target_industry, '') <> ''
        AND created_at >= now() - interval '30 days'
    ),
    (
      SELECT COUNT(DISTINCT ip_address)::int
      FROM public.request_audit
      WHERE user_id = _user_id
        AND ip_address IS NOT NULL
        AND created_at >= now() - interval '24 hours'
    ),
    (
      SELECT COUNT(*)::int
      FROM public.analytics_events
      WHERE user_id = _user_id
        AND event_name IN ('pack_exported_pdf','pack_exported_docx')
        AND created_at >= now() - interval '24 hours'
    ),
    (
      SELECT COUNT(DISTINCT lower(trim(job_title)))::int
      FROM public.prep_sessions
      WHERE user_id = _user_id
        AND coalesce(job_title, '') <> ''
        AND created_at >= now() - interval '7 days'
    );
$$;

-- 3. score_account_abuse
CREATE OR REPLACE FUNCTION public.score_account_abuse(_user_id uuid)
RETURNS TABLE (score integer, reasons jsonb)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s record;
  pts integer := 0;
  reasons jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO s FROM public.recent_abuse_signals(_user_id);

  -- Hard signals (weight 2)
  IF s.distinct_candidate_names > 3 THEN
    pts := pts + 2;
    reasons := reasons || jsonb_build_object('rule','distinct_candidate_names','weight',2,'value',s.distinct_candidate_names);
  END IF;
  IF s.distinct_cv_names > 3 THEN
    pts := pts + 2;
    reasons := reasons || jsonb_build_object('rule','distinct_cv_names','weight',2,'value',s.distinct_cv_names);
  END IF;

  -- Soft signals (weight 1)
  IF s.distinct_target_industries >= 3 THEN
    pts := pts + 1;
    reasons := reasons || jsonb_build_object('rule','distinct_target_industries','weight',1,'value',s.distinct_target_industries);
  END IF;
  IF s.distinct_ips_24h >= 3 THEN
    pts := pts + 1;
    reasons := reasons || jsonb_build_object('rule','distinct_ips_24h','weight',1,'value',s.distinct_ips_24h);
  END IF;
  IF s.exports_24h > 20 THEN
    pts := pts + 1;
    reasons := reasons || jsonb_build_object('rule','exports_24h','weight',1,'value',s.exports_24h);
  END IF;
  IF s.distinct_job_titles_7d >= 3 THEN
    pts := pts + 1;
    reasons := reasons || jsonb_build_object('rule','distinct_job_titles_7d','weight',1,'value',s.distinct_job_titles_7d);
  END IF;

  RETURN QUERY SELECT pts, reasons;
END;
$$;