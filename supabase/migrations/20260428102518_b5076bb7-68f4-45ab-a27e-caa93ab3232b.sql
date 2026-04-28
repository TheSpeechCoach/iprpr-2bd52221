DO $$ BEGIN
  CREATE TYPE public.workspace_role AS ENUM ('owner', 'admin', 'member');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_id uuid NOT NULL,
  plan text NOT NULL DEFAULT 'free',
  seat_tier text,
  is_personal boolean NOT NULL DEFAULT true,
  stripe_customer_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_workspaces_owner ON public.workspaces(owner_id);

CREATE TABLE IF NOT EXISTS public.workspace_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role public.workspace_role NOT NULL DEFAULT 'member',
  invited_by uuid,
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_wm_user ON public.workspace_members(user_id);
CREATE INDEX IF NOT EXISTS idx_wm_workspace ON public.workspace_members(workspace_id);

CREATE TABLE IF NOT EXISTS public.candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  email text,
  linkedin_url text,
  current_role_text text,
  notes text,
  created_by uuid NOT NULL,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_candidates_workspace ON public.candidates(workspace_id);

ALTER TABLE public.prep_sessions             ADD COLUMN IF NOT EXISTS workspace_id uuid;
ALTER TABLE public.prep_sessions             ADD COLUMN IF NOT EXISTS candidate_id uuid;
ALTER TABLE public.uploaded_files            ADD COLUMN IF NOT EXISTS workspace_id uuid;
ALTER TABLE public.uploaded_files            ADD COLUMN IF NOT EXISTS candidate_id uuid;
ALTER TABLE public.analytics_events          ADD COLUMN IF NOT EXISTS workspace_id uuid;
ALTER TABLE public.account_flags             ADD COLUMN IF NOT EXISTS workspace_id uuid;
ALTER TABLE public.request_audit             ADD COLUMN IF NOT EXISTS workspace_id uuid;
ALTER TABLE public.job_inputs                ADD COLUMN IF NOT EXISTS workspace_id uuid;
ALTER TABLE public.candidate_inputs          ADD COLUMN IF NOT EXISTS workspace_id uuid;
ALTER TABLE public.candidate_inputs          ADD COLUMN IF NOT EXISTS candidate_id uuid;
ALTER TABLE public.extracted_job_specs       ADD COLUMN IF NOT EXISTS workspace_id uuid;
ALTER TABLE public.generated_interview_packs ADD COLUMN IF NOT EXISTS workspace_id uuid;
ALTER TABLE public.subscriptions             ADD COLUMN IF NOT EXISTS workspace_id uuid;

CREATE INDEX IF NOT EXISTS idx_prep_sessions_ws ON public.prep_sessions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_uploaded_files_ws ON public.uploaded_files(workspace_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_ws ON public.subscriptions(workspace_id);

CREATE OR REPLACE FUNCTION public.is_workspace_member(_workspace_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = _workspace_id AND user_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.workspace_role_of(_workspace_id uuid, _user_id uuid)
RETURNS public.workspace_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.workspace_members
  WHERE workspace_id = _workspace_id AND user_id = _user_id LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_user_workspaces(_user_id uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT workspace_id FROM public.workspace_members WHERE user_id = _user_id;
$$;

ALTER TABLE public.workspaces        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidates        ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ws members read" ON public.workspaces FOR SELECT
  USING (public.is_workspace_member(id, auth.uid()));
CREATE POLICY "ws owner update" ON public.workspaces FOR UPDATE
  USING (public.workspace_role_of(id, auth.uid()) = 'owner');
CREATE POLICY "ws insert own" ON public.workspaces FOR INSERT
  WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "ws service role" ON public.workspaces FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "wm members read" ON public.workspace_members FOR SELECT
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "wm owner_admin insert" ON public.workspace_members FOR INSERT
  WITH CHECK (public.workspace_role_of(workspace_id, auth.uid()) IN ('owner','admin'));
CREATE POLICY "wm owner_admin update" ON public.workspace_members FOR UPDATE
  USING (public.workspace_role_of(workspace_id, auth.uid()) IN ('owner','admin'));
CREATE POLICY "wm owner_admin delete" ON public.workspace_members FOR DELETE
  USING (public.workspace_role_of(workspace_id, auth.uid()) IN ('owner','admin'));
CREATE POLICY "wm service role" ON public.workspace_members FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "cand members read" ON public.candidates FOR SELECT
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "cand members insert" ON public.candidates FOR INSERT
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()) AND auth.uid() = created_by);
CREATE POLICY "cand members update" ON public.candidates FOR UPDATE
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "cand owner_admin delete" ON public.candidates FOR DELETE
  USING (public.workspace_role_of(workspace_id, auth.uid()) IN ('owner','admin'));
CREATE POLICY "cand service role" ON public.candidates FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE TRIGGER trg_ws_updated_at BEFORE UPDATE ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER trg_candidates_updated_at BEFORE UPDATE ON public.candidates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();