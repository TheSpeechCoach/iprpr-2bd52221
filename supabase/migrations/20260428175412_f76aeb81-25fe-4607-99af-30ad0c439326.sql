-- Generation jobs: async tracking for interview pack generation
CREATE TABLE public.generation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  user_id uuid NOT NULL,
  workspace_id uuid,
  status text NOT NULL DEFAULT 'queued', -- queued | processing | completed | failed
  current_stage text,
  progress_percentage integer NOT NULL DEFAULT 0,
  questions_generated integer NOT NULL DEFAULT 0,
  total_questions integer NOT NULL DEFAULT 0,
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX idx_generation_jobs_session ON public.generation_jobs(session_id, created_at DESC);
CREATE INDEX idx_generation_jobs_user ON public.generation_jobs(user_id, created_at DESC);

ALTER TABLE public.generation_jobs ENABLE ROW LEVEL SECURITY;

-- Workspace members can read jobs for their workspaces (or own jobs if no workspace).
CREATE POLICY "gj ws members read"
ON public.generation_jobs
FOR SELECT
USING (
  (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()))
  OR auth.uid() = user_id
);

-- Service role manages everything.
CREATE POLICY "gj service role manage"
ON public.generation_jobs
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Platform admin can read.
CREATE POLICY "gj admin read"
ON public.generation_jobs
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Updated-at trigger
CREATE TRIGGER trg_generation_jobs_updated_at
BEFORE UPDATE ON public.generation_jobs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();