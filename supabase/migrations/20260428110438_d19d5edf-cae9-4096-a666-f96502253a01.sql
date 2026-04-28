-- Activity log for workspace invites
CREATE TABLE IF NOT EXISTS public.invite_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  invite_id uuid REFERENCES public.workspace_invites(id) ON DELETE SET NULL,
  event text NOT NULL CHECK (event IN ('invite_created','invite_accepted','invite_revoked')),
  actor_user_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invite_logs_workspace ON public.invite_logs(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invite_logs_invite ON public.invite_logs(invite_id);

ALTER TABLE public.invite_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "il owner_admin read"
ON public.invite_logs FOR SELECT
USING (
  public.workspace_role_of(workspace_id, auth.uid())
    = ANY (ARRAY['owner'::workspace_role,'admin'::workspace_role])
);

CREATE POLICY "il platform admin read"
ON public.invite_logs FOR SELECT
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "il service role"
ON public.invite_logs FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- ===== Trigger: log on invite created =====
CREATE OR REPLACE FUNCTION public.tg_invite_created_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.invite_logs (workspace_id, invite_id, event, actor_user_id, metadata)
  VALUES (
    NEW.workspace_id,
    NEW.id,
    'invite_created',
    NEW.invited_by,
    jsonb_build_object('email', NEW.email, 'role', NEW.role)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS workspace_invites_created_log ON public.workspace_invites;
CREATE TRIGGER workspace_invites_created_log
AFTER INSERT ON public.workspace_invites
FOR EACH ROW EXECUTE FUNCTION public.tg_invite_created_log();

-- ===== Trigger: log on status change (accepted / revoked) =====
CREATE OR REPLACE FUNCTION public.tg_invite_status_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'accepted' THEN
    INSERT INTO public.invite_logs (workspace_id, invite_id, event, actor_user_id, metadata)
    VALUES (
      NEW.workspace_id,
      NEW.id,
      'invite_accepted',
      NEW.accepted_by,
      jsonb_build_object('email', NEW.email, 'role', NEW.role)
    );
  ELSIF NEW.status = 'revoked' THEN
    INSERT INTO public.invite_logs (workspace_id, invite_id, event, actor_user_id, metadata)
    VALUES (
      NEW.workspace_id,
      NEW.id,
      'invite_revoked',
      auth.uid(),
      jsonb_build_object('email', NEW.email, 'role', NEW.role)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS workspace_invites_status_log ON public.workspace_invites;
CREATE TRIGGER workspace_invites_status_log
AFTER UPDATE OF status ON public.workspace_invites
FOR EACH ROW EXECUTE FUNCTION public.tg_invite_status_log();