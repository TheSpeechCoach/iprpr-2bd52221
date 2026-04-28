-- ============================================================
-- BACKFILL: personal workspace for every existing user
-- ============================================================
INSERT INTO public.workspaces (id, name, owner_id, plan, is_personal, created_at)
SELECT
  gen_random_uuid(),
  COALESCE(NULLIF(p.full_name, ''), split_part(COALESCE(p.email, 'workspace'), '@', 1), 'Workspace'),
  p.id,
  COALESCE(public.get_user_plan(p.id, 'live'), public.get_user_plan(p.id, 'sandbox'), 'free'),
  true,
  now()
FROM public.profiles p
WHERE NOT EXISTS (
  SELECT 1 FROM public.workspaces w WHERE w.owner_id = p.id AND w.is_personal = true
);

INSERT INTO public.workspace_members (workspace_id, user_id, role, joined_at)
SELECT w.id, w.owner_id, 'owner', now()
FROM public.workspaces w
WHERE w.is_personal = true
  AND NOT EXISTS (
    SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = w.id AND m.user_id = w.owner_id
  );

-- Stamp workspace_id on existing rows
UPDATE public.prep_sessions ps SET workspace_id = w.id
FROM public.workspaces w
WHERE w.owner_id = ps.user_id AND w.is_personal AND ps.workspace_id IS NULL;

UPDATE public.uploaded_files uf SET workspace_id = w.id
FROM public.workspaces w
WHERE w.owner_id = uf.user_id AND w.is_personal AND uf.workspace_id IS NULL;

UPDATE public.analytics_events ae SET workspace_id = w.id
FROM public.workspaces w
WHERE w.owner_id = ae.user_id AND w.is_personal AND ae.workspace_id IS NULL;

UPDATE public.account_flags af SET workspace_id = w.id
FROM public.workspaces w
WHERE w.owner_id = af.user_id AND w.is_personal AND af.workspace_id IS NULL;

UPDATE public.request_audit ra SET workspace_id = w.id
FROM public.workspaces w
WHERE w.owner_id = ra.user_id AND w.is_personal AND ra.workspace_id IS NULL;

UPDATE public.job_inputs ji SET workspace_id = w.id
FROM public.workspaces w
WHERE w.owner_id = ji.user_id AND w.is_personal AND ji.workspace_id IS NULL;

UPDATE public.candidate_inputs ci SET workspace_id = w.id
FROM public.workspaces w
WHERE w.owner_id = ci.user_id AND w.is_personal AND ci.workspace_id IS NULL;

UPDATE public.extracted_job_specs ejs SET workspace_id = w.id
FROM public.workspaces w
WHERE w.owner_id = ejs.user_id AND w.is_personal AND ejs.workspace_id IS NULL;

UPDATE public.generated_interview_packs gip SET workspace_id = w.id
FROM public.workspaces w
WHERE w.owner_id = gip.user_id AND w.is_personal AND gip.workspace_id IS NULL;

UPDATE public.subscriptions s SET workspace_id = w.id
FROM public.workspaces w
WHERE w.owner_id = s.user_id AND w.is_personal AND s.workspace_id IS NULL;

-- ============================================================
-- handle_new_user: also provision personal workspace
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  new_ws_id uuid;
BEGIN
  INSERT INTO public.profiles (
    id, email, full_name,
    candidate_full_name, candidate_email, candidate_linkedin_url, candidate_locked_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NULLIF(NEW.raw_user_meta_data->>'candidate_full_name', ''),
    NULLIF(NEW.raw_user_meta_data->>'candidate_email', ''),
    NULLIF(NEW.raw_user_meta_data->>'candidate_linkedin_url', ''),
    CASE
      WHEN NULLIF(NEW.raw_user_meta_data->>'candidate_full_name', '') IS NOT NULL
        THEN now()
      ELSE NULL
    END
  );
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');

  INSERT INTO public.workspaces (name, owner_id, plan, is_personal)
  VALUES (
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), split_part(NEW.email, '@', 1), 'Workspace'),
    NEW.id, 'free', true
  )
  RETURNING id INTO new_ws_id;

  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (new_ws_id, NEW.id, 'owner');

  RETURN NEW;
END;
$$;

-- ============================================================
-- workspace_plan resolver
-- ============================================================
CREATE OR REPLACE FUNCTION public.workspace_plan(_workspace_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (
      SELECT public.plan_from_price_id(s.price_id)
      FROM public.subscriptions s
      WHERE s.workspace_id = _workspace_id
        AND (
          (s.status IN ('active','trialing','past_due') AND (s.current_period_end IS NULL OR s.current_period_end > now()))
          OR (s.status = 'canceled' AND s.current_period_end > now())
        )
        AND s.price_id IN ('pro_monthly','coach_plus_monthly')
      ORDER BY
        CASE WHEN s.price_id = 'coach_plus_monthly' THEN 2 ELSE 1 END DESC,
        s.created_at DESC
      LIMIT 1
    ),
    (SELECT plan FROM public.workspaces WHERE id = _workspace_id),
    'free'
  );
$$;

-- ============================================================
-- RLS rewrite: workspace-membership-based access
-- (Replaces user_id-only policies. Solo users keep same effective access
-- because they're the only member of their personal workspace.)
-- ============================================================

-- prep_sessions
DROP POLICY IF EXISTS "ps select own" ON public.prep_sessions;
DROP POLICY IF EXISTS "ps insert own" ON public.prep_sessions;
DROP POLICY IF EXISTS "ps update own" ON public.prep_sessions;
DROP POLICY IF EXISTS "ps delete own" ON public.prep_sessions;
CREATE POLICY "ps ws members read" ON public.prep_sessions FOR SELECT
  USING (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "ps ws members insert" ON public.prep_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id AND workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "ps ws members update" ON public.prep_sessions FOR UPDATE
  USING (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "ps ws owner_admin or self delete" ON public.prep_sessions FOR DELETE
  USING (
    workspace_id IS NOT NULL AND (
      public.workspace_role_of(workspace_id, auth.uid()) IN ('owner','admin')
      OR auth.uid() = user_id
    )
  );

-- uploaded_files
DROP POLICY IF EXISTS "uf select own" ON public.uploaded_files;
DROP POLICY IF EXISTS "uf insert own" ON public.uploaded_files;
DROP POLICY IF EXISTS "uf update own" ON public.uploaded_files;
DROP POLICY IF EXISTS "uf delete own" ON public.uploaded_files;
CREATE POLICY "uf ws members read" ON public.uploaded_files FOR SELECT
  USING (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "uf ws members insert" ON public.uploaded_files FOR INSERT
  WITH CHECK (auth.uid() = user_id AND workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "uf ws members update" ON public.uploaded_files FOR UPDATE
  USING (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "uf ws members delete" ON public.uploaded_files FOR DELETE
  USING (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()));

-- candidate_inputs
DROP POLICY IF EXISTS "ci select own" ON public.candidate_inputs;
DROP POLICY IF EXISTS "ci insert own" ON public.candidate_inputs;
DROP POLICY IF EXISTS "ci update own" ON public.candidate_inputs;
DROP POLICY IF EXISTS "ci delete own" ON public.candidate_inputs;
CREATE POLICY "ci ws members read" ON public.candidate_inputs FOR SELECT
  USING (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "ci ws members insert" ON public.candidate_inputs FOR INSERT
  WITH CHECK (auth.uid() = user_id AND workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "ci ws members update" ON public.candidate_inputs FOR UPDATE
  USING (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "ci ws members delete" ON public.candidate_inputs FOR DELETE
  USING (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()));

-- job_inputs
DROP POLICY IF EXISTS "ji select own" ON public.job_inputs;
DROP POLICY IF EXISTS "ji insert own" ON public.job_inputs;
DROP POLICY IF EXISTS "ji update own" ON public.job_inputs;
DROP POLICY IF EXISTS "ji delete own" ON public.job_inputs;
CREATE POLICY "ji ws members read" ON public.job_inputs FOR SELECT
  USING (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "ji ws members insert" ON public.job_inputs FOR INSERT
  WITH CHECK (auth.uid() = user_id AND workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "ji ws members update" ON public.job_inputs FOR UPDATE
  USING (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "ji ws members delete" ON public.job_inputs FOR DELETE
  USING (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()));

-- extracted_job_specs
DROP POLICY IF EXISTS "ejs select own" ON public.extracted_job_specs;
DROP POLICY IF EXISTS "ejs insert own" ON public.extracted_job_specs;
DROP POLICY IF EXISTS "ejs update own" ON public.extracted_job_specs;
DROP POLICY IF EXISTS "ejs delete own" ON public.extracted_job_specs;
CREATE POLICY "ejs ws members read" ON public.extracted_job_specs FOR SELECT
  USING (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "ejs ws members insert" ON public.extracted_job_specs FOR INSERT
  WITH CHECK (auth.uid() = user_id AND workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "ejs ws members update" ON public.extracted_job_specs FOR UPDATE
  USING (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "ejs ws members delete" ON public.extracted_job_specs FOR DELETE
  USING (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()));

-- generated_interview_packs
DROP POLICY IF EXISTS "gip select own" ON public.generated_interview_packs;
DROP POLICY IF EXISTS "gip insert own" ON public.generated_interview_packs;
DROP POLICY IF EXISTS "gip update own" ON public.generated_interview_packs;
DROP POLICY IF EXISTS "gip delete own" ON public.generated_interview_packs;
CREATE POLICY "gip ws members read" ON public.generated_interview_packs FOR SELECT
  USING (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "gip ws members insert" ON public.generated_interview_packs FOR INSERT
  WITH CHECK (auth.uid() = user_id AND workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "gip ws members update" ON public.generated_interview_packs FOR UPDATE
  USING (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "gip ws members delete" ON public.generated_interview_packs FOR DELETE
  USING (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()));

-- analytics_events: keep insert-own + add ws read for members
DROP POLICY IF EXISTS "ae select own" ON public.analytics_events;
CREATE POLICY "ae ws members read" ON public.analytics_events FOR SELECT
  USING (
    auth.uid() = user_id
    OR (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()))
  );

-- account_flags: members can see flags on their workspace
CREATE POLICY "af ws members read" ON public.account_flags FOR SELECT
  USING (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()));

-- request_audit: keep self, add ws members read for owners/admins
CREATE POLICY "ra ws owner_admin read" ON public.request_audit FOR SELECT
  USING (workspace_id IS NOT NULL AND public.workspace_role_of(workspace_id, auth.uid()) IN ('owner','admin'));