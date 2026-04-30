
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS workspace_type text NOT NULL DEFAULT 'personal',
  ADD COLUMN IF NOT EXISTS company_name text,
  ADD COLUMN IF NOT EXISTS team_size text;

ALTER TABLE public.workspaces
  ADD CONSTRAINT workspaces_workspace_type_chk
  CHECK (workspace_type IN ('personal','team'));

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  new_ws_id uuid;
  signup_type text := COALESCE(NEW.raw_user_meta_data->>'signup_type', 'individual');
  ws_company text := NULLIF(NEW.raw_user_meta_data->>'company_name', '');
  ws_team_size text := NULLIF(NEW.raw_user_meta_data->>'team_size', '');
  ws_role text := NULLIF(NEW.raw_user_meta_data->>'work_role', '');
  ws_name text;
  is_team boolean := signup_type = 'team';
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

  IF is_team THEN
    ws_name := COALESCE(ws_company, NULLIF(NEW.raw_user_meta_data->>'full_name', ''), split_part(NEW.email, '@', 1), 'Team');
  ELSE
    ws_name := COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), split_part(NEW.email, '@', 1), 'Workspace');
  END IF;

  INSERT INTO public.workspaces (name, owner_id, plan, is_personal, workspace_type, company_name, team_size)
  VALUES (
    ws_name,
    NEW.id,
    'free',
    NOT is_team,
    CASE WHEN is_team THEN 'team' ELSE 'personal' END,
    ws_company,
    ws_team_size
  )
  RETURNING id INTO new_ws_id;

  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (new_ws_id, NEW.id, 'owner');

  RETURN NEW;
END;
$function$;
