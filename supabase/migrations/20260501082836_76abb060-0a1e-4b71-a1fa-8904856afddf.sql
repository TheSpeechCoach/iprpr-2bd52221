
-- Beta feedback: triage fields
ALTER TABLE public.beta_feedback
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS admin_notes text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP POLICY IF EXISTS "bf admin update" ON public.beta_feedback;
CREATE POLICY "bf admin update" ON public.beta_feedback
  FOR UPDATE TO public
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Admin read policies on remaining tables (idempotent)
DROP POLICY IF EXISTS "iq admin read" ON public.interview_questions;
CREATE POLICY "iq admin read" ON public.interview_questions
  FOR SELECT TO public USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "sa admin read" ON public.saved_answers;
CREATE POLICY "sa admin read" ON public.saved_answers
  FOR SELECT TO public USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "pa admin read" ON public.practice_attempts;
CREATE POLICY "pa admin read" ON public.practice_attempts
  FOR SELECT TO public USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "uf admin read" ON public.uploaded_files;
CREATE POLICY "uf admin read" ON public.uploaded_files
  FOR SELECT TO public USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "ji admin read" ON public.job_inputs;
CREATE POLICY "ji admin read" ON public.job_inputs
  FOR SELECT TO public USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "ejs admin read" ON public.extracted_job_specs;
CREATE POLICY "ejs admin read" ON public.extracted_job_specs
  FOR SELECT TO public USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "ci admin read" ON public.candidate_inputs;
CREATE POLICY "ci admin read" ON public.candidate_inputs
  FOR SELECT TO public USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "cand admin read" ON public.candidates;
CREATE POLICY "cand admin read" ON public.candidates
  FOR SELECT TO public USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "ws admin read" ON public.workspaces;
CREATE POLICY "ws admin read" ON public.workspaces
  FOR SELECT TO public USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "wm admin read" ON public.workspace_members;
CREATE POLICY "wm admin read" ON public.workspace_members
  FOR SELECT TO public USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "profiles admin read" ON public.profiles;
CREATE POLICY "profiles admin read" ON public.profiles
  FOR SELECT TO public USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "tpo admin read all" ON public.testing_plan_overrides;
-- already has tpo admin read

-- Overview metrics RPC, admin only
CREATE OR REPLACE FUNCTION public.admin_overview_metrics()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'total_users', (SELECT COUNT(*) FROM public.profiles),
    'new_users_7d', (SELECT COUNT(*) FROM public.profiles WHERE created_at >= now() - interval '7 days'),
    'active_users_7d', (
      SELECT COUNT(DISTINCT user_id) FROM public.analytics_events
      WHERE created_at >= now() - interval '7 days' AND user_id IS NOT NULL
    ),
    'total_prep_sessions', (SELECT COUNT(*) FROM public.prep_sessions),
    'sessions_ready', (SELECT COUNT(*) FROM public.prep_sessions WHERE status = 'ready'),
    'sessions_failed', (SELECT COUNT(*) FROM public.prep_sessions WHERE status = 'failed'),
    'generations_succeeded', (SELECT COUNT(*) FROM public.generation_jobs WHERE status = 'completed'),
    'generations_failed', (SELECT COUNT(*) FROM public.generation_jobs WHERE status = 'failed'),
    'generations_processing', (SELECT COUNT(*) FROM public.generation_jobs WHERE status = 'processing'),
    'total_questions', (SELECT COUNT(*) FROM public.interview_questions),
    'saved_answers', (SELECT COUNT(*) FROM public.saved_answers),
    'beta_feedback_total', (SELECT COUNT(*) FROM public.beta_feedback),
    'beta_feedback_new', (SELECT COUNT(*) FROM public.beta_feedback WHERE status = 'new'),
    'free_users', (
      SELECT COUNT(*) FROM public.profiles p
      WHERE public.get_user_plan(p.id, 'sandbox') = 'free'
        AND public.get_user_plan(p.id, 'live') = 'free'
    ),
    'pro_users', (
      SELECT COUNT(*) FROM public.profiles p
      WHERE public.get_user_plan(p.id, 'sandbox') = 'pro'
         OR public.get_user_plan(p.id, 'live') = 'pro'
    ),
    'coach_plus_users', (
      SELECT COUNT(*) FROM public.profiles p
      WHERE public.get_user_plan(p.id, 'sandbox') = 'coach_plus'
         OR public.get_user_plan(p.id, 'live') = 'coach_plus'
    ),
    'testing_mode', public.testing_mode_enabled(),
    'testing_overrides', (SELECT COUNT(*) FROM public.testing_plan_overrides)
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_overview_metrics() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_overview_metrics() TO authenticated;

-- Admin user summary RPC
CREATE OR REPLACE FUNCTION public.admin_list_users(_limit int DEFAULT 200, _search text DEFAULT NULL)
RETURNS TABLE (
  user_id uuid,
  email text,
  full_name text,
  signup_date timestamptz,
  plan_sandbox text,
  plan_live text,
  override_plan text,
  sessions_count int,
  saved_answers_count int,
  last_activity timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.email,
    p.full_name,
    p.created_at,
    public.get_user_plan(p.id, 'sandbox'),
    public.get_user_plan(p.id, 'live'),
    (SELECT tpo.override_plan FROM public.testing_plan_overrides tpo WHERE tpo.user_id = p.id LIMIT 1),
    (SELECT COUNT(*)::int FROM public.prep_sessions ps WHERE ps.user_id = p.id),
    (SELECT COUNT(*)::int FROM public.saved_answers sa WHERE sa.user_id = p.id),
    (SELECT MAX(ae.created_at) FROM public.analytics_events ae WHERE ae.user_id = p.id)
  FROM public.profiles p
  WHERE _search IS NULL
     OR p.email ILIKE '%' || _search || '%'
     OR COALESCE(p.full_name, '') ILIKE '%' || _search || '%'
  ORDER BY p.created_at DESC
  LIMIT _limit;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_users(int, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_users(int, text) TO authenticated;

-- Admin session list RPC
CREATE OR REPLACE FUNCTION public.admin_list_sessions(_limit int DEFAULT 200, _search text DEFAULT NULL)
RETURNS TABLE (
  session_id uuid,
  title text,
  user_id uuid,
  user_email text,
  candidate_name text,
  target_role text,
  company_name text,
  status text,
  question_count int,
  generation_status text,
  generation_progress int,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    ps.id,
    ps.title,
    ps.user_id,
    pr.email,
    ps.full_name,
    ps.target_role,
    ps.company_name,
    ps.status,
    (SELECT COUNT(*)::int FROM public.interview_questions iq WHERE iq.session_id = ps.id),
    (SELECT gj.status::text FROM public.generation_jobs gj WHERE gj.prep_session_id = ps.id ORDER BY gj.created_at DESC LIMIT 1),
    (SELECT gj.progress FROM public.generation_jobs gj WHERE gj.prep_session_id = ps.id ORDER BY gj.created_at DESC LIMIT 1),
    ps.created_at
  FROM public.prep_sessions ps
  LEFT JOIN public.profiles pr ON pr.id = ps.user_id
  WHERE _search IS NULL
     OR ps.title ILIKE '%' || _search || '%'
     OR COALESCE(ps.target_role, '') ILIKE '%' || _search || '%'
     OR COALESCE(ps.company_name, '') ILIKE '%' || _search || '%'
     OR COALESCE(pr.email, '') ILIKE '%' || _search || '%'
     OR COALESCE(ps.full_name, '') ILIKE '%' || _search || '%'
  ORDER BY ps.created_at DESC
  LIMIT _limit;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_sessions(int, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_sessions(int, text) TO authenticated;
