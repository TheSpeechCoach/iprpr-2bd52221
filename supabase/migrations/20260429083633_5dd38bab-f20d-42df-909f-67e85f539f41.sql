-- Add questions_generated column to generation_jobs for live progress.
ALTER TABLE public.generation_jobs
  ADD COLUMN IF NOT EXISTS questions_generated integer NOT NULL DEFAULT 0;

-- Schema documentation: clarify the cross-table session linkage.
COMMENT ON COLUMN public.interview_questions.session_id IS
  'References prep_sessions.id. Equivalent to prep_session_id in generation_jobs. Kept as session_id to avoid breaking existing queries.';
COMMENT ON COLUMN public.generation_jobs.prep_session_id IS
  'References prep_sessions.id. Canonical name. Equivalent to interview_questions.session_id.';
COMMENT ON COLUMN public.generation_jobs.questions_generated IS
  'Live count of interview_questions rows persisted for this job. Updated by the worker after each chunk save.';

-- prep_sessions.status is text (no enum), so adding initial_ready needs no DDL.
COMMENT ON COLUMN public.prep_sessions.status IS
  'draft | generating | initial_ready | ready | failed | blocked. initial_ready means the first 10 questions are saved and the user can start reading; the worker is still generating questions 11-100 in the background.';

-- ===== Beta feedback =====
CREATE TABLE IF NOT EXISTS public.beta_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  user_email text,
  page_url text,
  issue_type text NOT NULL,
  message text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.beta_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bf insert own"
  ON public.beta_feedback
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "bf select own"
  ON public.beta_feedback
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "bf admin read"
  ON public.beta_feedback
  FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "bf service role"
  ON public.beta_feedback
  FOR ALL
  USING (auth.role() = 'service_role'::text)
  WITH CHECK (auth.role() = 'service_role'::text);

CREATE INDEX IF NOT EXISTS beta_feedback_user_id_idx ON public.beta_feedback (user_id);
CREATE INDEX IF NOT EXISTS beta_feedback_created_at_idx ON public.beta_feedback (created_at DESC);