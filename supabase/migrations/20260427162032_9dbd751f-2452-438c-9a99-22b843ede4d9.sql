-- 1. Lock candidate identity onto the profile
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS candidate_full_name text,
  ADD COLUMN IF NOT EXISTS candidate_email text,
  ADD COLUMN IF NOT EXISTS candidate_linkedin_url text,
  ADD COLUMN IF NOT EXISTS candidate_locked_at timestamptz;

-- 2. Account flags table for admin review
CREATE TABLE IF NOT EXISTS public.account_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  reason text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open',
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_account_flags_user_open
  ON public.account_flags(user_id) WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_account_flags_status
  ON public.account_flags(status, created_at DESC);

ALTER TABLE public.account_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "af admin read"
  ON public.account_flags FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "af admin update"
  ON public.account_flags FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "af service role manage"
  ON public.account_flags FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE TRIGGER trg_account_flags_updated
  BEFORE UPDATE ON public.account_flags
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 3. Update new-user handler to capture candidate identity from signup metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  RETURN NEW;
END;
$function$;