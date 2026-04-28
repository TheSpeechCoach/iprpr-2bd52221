-- Create enum type for generation job status
DO $$ BEGIN
  CREATE TYPE public.generation_job_status AS ENUM ('queued','processing','completed','failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Rename columns
ALTER TABLE public.generation_jobs RENAME COLUMN session_id TO prep_session_id;
ALTER TABLE public.generation_jobs RENAME COLUMN current_stage TO stage;
ALTER TABLE public.generation_jobs RENAME COLUMN progress_percentage TO progress;

-- Drop deprecated columns
ALTER TABLE public.generation_jobs DROP COLUMN IF EXISTS total_questions;
ALTER TABLE public.generation_jobs DROP COLUMN IF EXISTS questions_generated;
ALTER TABLE public.generation_jobs DROP COLUMN IF EXISTS metadata;

-- Add new timestamp columns
ALTER TABLE public.generation_jobs ADD COLUMN IF NOT EXISTS started_at timestamptz;
ALTER TABLE public.generation_jobs ADD COLUMN IF NOT EXISTS failed_at timestamptz;

-- Convert status text -> enum
ALTER TABLE public.generation_jobs
  ALTER COLUMN status DROP DEFAULT,
  ALTER COLUMN status TYPE public.generation_job_status USING status::public.generation_job_status,
  ALTER COLUMN status SET DEFAULT 'queued'::public.generation_job_status;

-- Foreign keys (cascade deletes). user_id references auth.users — workspace_id and prep_session_id reference public tables.
ALTER TABLE public.generation_jobs
  ADD CONSTRAINT generation_jobs_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.generation_jobs
  ADD CONSTRAINT generation_jobs_workspace_id_fkey
  FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

ALTER TABLE public.generation_jobs
  ADD CONSTRAINT generation_jobs_prep_session_id_fkey
  FOREIGN KEY (prep_session_id) REFERENCES public.prep_sessions(id) ON DELETE CASCADE;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_generation_jobs_user_id ON public.generation_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_generation_jobs_prep_session_id ON public.generation_jobs(prep_session_id);
CREATE INDEX IF NOT EXISTS idx_generation_jobs_status ON public.generation_jobs(status);