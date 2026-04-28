-- Workspace invites: schema + RLS + helper RPCs

CREATE TYPE workspace_invite_status AS ENUM ('pending','accepted','revoked','expired');

CREATE TABLE IF NOT EXISTS public.workspace_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  email text NOT NULL,
  role public.workspace_role NOT NULL DEFAULT 'member',
  token text NOT NULL UNIQUE,
  invited_by uuid NOT NULL,
  accepted_by uuid,
  status public.workspace_invite_status NOT NULL DEFAULT 'pending',
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '72 hours'),
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workspace_invites_workspace_id ON public.workspace_invites(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_invites_email ON public.workspace_invites(lower(email));
CREATE INDEX IF NOT EXISTS idx_workspace_invites_token ON public.workspace_invites(token);
CREATE INDEX IF NOT EXISTS idx_workspace_invites_status ON public.workspace_invites(status);

-- Constrain invitable role: 'owner' cannot be invited
ALTER TABLE public.workspace_invites
  ADD CONSTRAINT workspace_invites_role_check
  CHECK (role IN ('admin','member'));

ALTER TABLE public.workspace_invites ENABLE ROW LEVEL SECURITY;

-- RLS policies
-- Owners/admins of the workspace can read invites
CREATE POLICY "wi owner_admin read"
ON public.workspace_invites FOR SELECT
USING (
  public.workspace_role_of(workspace_id, auth.uid())
    = ANY (ARRAY['owner'::workspace_role,'admin'::workspace_role])
);

-- Owners/admins can create invites (and must set themselves as inviter)
CREATE POLICY "wi owner_admin insert"
ON public.workspace_invites FOR INSERT
WITH CHECK (
  invited_by = auth.uid()
  AND public.workspace_role_of(workspace_id, auth.uid())
    = ANY (ARRAY['owner'::workspace_role,'admin'::workspace_role])
);

-- Owners/admins can update (revoke) invites
CREATE POLICY "wi owner_admin update"
ON public.workspace_invites FOR UPDATE
USING (
  public.workspace_role_of(workspace_id, auth.uid())
    = ANY (ARRAY['owner'::workspace_role,'admin'::workspace_role])
);

-- Owners/admins can delete invites
CREATE POLICY "wi owner_admin delete"
ON public.workspace_invites FOR DELETE
USING (
  public.workspace_role_of(workspace_id, auth.uid())
    = ANY (ARRAY['owner'::workspace_role,'admin'::workspace_role])
);

-- Service role full access
CREATE POLICY "wi service role"
ON public.workspace_invites FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- ===== Helper: accept an invite by token (single-use, requires auth) =====
CREATE OR REPLACE FUNCTION public.accept_workspace_invite(_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv record;
  caller uuid := auth.uid();
  caller_email text;
  ws_seats int;
  current_member_count int;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;

  SELECT email INTO caller_email FROM auth.users WHERE id = caller;

  SELECT * INTO inv FROM public.workspace_invites WHERE token = _token FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVITE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF inv.status = 'accepted' THEN
    RETURN jsonb_build_object('ok', true, 'workspace_id', inv.workspace_id, 'already', true);
  END IF;

  IF inv.status = 'revoked' THEN
    RAISE EXCEPTION 'INVITE_REVOKED' USING ERRCODE = '22023';
  END IF;

  IF inv.expires_at < now() OR inv.status = 'expired' THEN
    UPDATE public.workspace_invites SET status = 'expired' WHERE id = inv.id;
    RAISE EXCEPTION 'INVITE_EXPIRED' USING ERRCODE = '22023';
  END IF;

  -- Already a member?
  IF EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = inv.workspace_id AND user_id = caller
  ) THEN
    UPDATE public.workspace_invites
    SET status = 'accepted', accepted_at = now(), accepted_by = caller
    WHERE id = inv.id;
    RETURN jsonb_build_object('ok', true, 'workspace_id', inv.workspace_id, 'already', true);
  END IF;

  -- Add to workspace_members
  INSERT INTO public.workspace_members (workspace_id, user_id, role, invited_by)
  VALUES (inv.workspace_id, caller, inv.role, inv.invited_by);

  UPDATE public.workspace_invites
  SET status = 'accepted', accepted_at = now(), accepted_by = caller
  WHERE id = inv.id;

  RETURN jsonb_build_object('ok', true, 'workspace_id', inv.workspace_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_workspace_invite(text) TO authenticated;

-- ===== Helper: revoke invite =====
CREATE OR REPLACE FUNCTION public.revoke_workspace_invite(_invite_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv record;
BEGIN
  SELECT * INTO inv FROM public.workspace_invites WHERE id = _invite_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVITE_NOT_FOUND';
  END IF;

  IF public.workspace_role_of(inv.workspace_id, auth.uid())
       NOT IN ('owner'::workspace_role,'admin'::workspace_role) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  UPDATE public.workspace_invites
  SET status = 'revoked', revoked_at = now()
  WHERE id = _invite_id AND status = 'pending';
END;
$$;

GRANT EXECUTE ON FUNCTION public.revoke_workspace_invite(uuid) TO authenticated;