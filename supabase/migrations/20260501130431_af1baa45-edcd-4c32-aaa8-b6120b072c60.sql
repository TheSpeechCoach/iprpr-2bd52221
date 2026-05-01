-- Admin bootstrap is for private beta only. Disable TESTING_MODE before production.

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS role text;

ALTER TABLE public.profiles
DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
ADD CONSTRAINT profiles_role_check
CHECK (role IS NULL OR role IN ('platform_admin'));

CREATE TABLE IF NOT EXISTS public.admin_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text,
  event text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_logs ADD COLUMN IF NOT EXISTS action text;
ALTER TABLE public.admin_logs ADD COLUMN IF NOT EXISTS event text;
ALTER TABLE public.admin_logs ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.admin_logs ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

ALTER TABLE public.admin_logs
ALTER COLUMN action SET DEFAULT NULL;

UPDATE public.admin_logs
SET action = COALESCE(action, event, 'unknown')
WHERE action IS NULL;

ALTER TABLE public.admin_logs
ALTER COLUMN action SET NOT NULL;

ALTER TABLE public.admin_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read logs" ON public.admin_logs;
CREATE POLICY "Admins read logs"
  ON public.admin_logs
  FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));