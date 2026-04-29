-- Testing-mode plan override table.
-- When TESTING_MODE is enabled, get_user_plan() returns the override (if any)
-- instead of the real subscription plan. Admin-only writes; users cannot see
-- or modify their own override directly.

CREATE TABLE IF NOT EXISTS public.testing_plan_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  override_plan text NOT NULL CHECK (override_plan IN ('free','pro','coach_plus')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.testing_plan_overrides ENABLE ROW LEVEL SECURITY;

-- Admins can read all overrides
CREATE POLICY "tpo admin read"
  ON public.testing_plan_overrides
  FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Admins can insert/update/delete
CREATE POLICY "tpo admin insert"
  ON public.testing_plan_overrides
  FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "tpo admin update"
  ON public.testing_plan_overrides
  FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "tpo admin delete"
  ON public.testing_plan_overrides
  FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Service role full access (used by edge functions)
CREATE POLICY "tpo service role manage"
  ON public.testing_plan_overrides
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE TRIGGER trg_tpo_updated_at
  BEFORE UPDATE ON public.testing_plan_overrides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Server-side TESTING_MODE flag. Read by get_user_plan() and the
-- set-testing-plan-override edge function. Defaults to false; flip in
-- production via UPDATE only by an admin.
CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "as anyone read"
  ON public.app_settings
  FOR SELECT
  USING (true);

CREATE POLICY "as admin write"
  ON public.app_settings
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "as service role manage"
  ON public.app_settings
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

INSERT INTO public.app_settings (key, value)
VALUES ('testing_mode', 'true'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Helper: is testing mode currently enabled?
CREATE OR REPLACE FUNCTION public.testing_mode_enabled()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT (value)::text::boolean FROM public.app_settings WHERE key = 'testing_mode'), false);
$$;

-- Replace get_user_plan() to honour testing overrides when testing mode is on.
CREATE OR REPLACE FUNCTION public.get_user_plan(_user_id uuid, _env text DEFAULT 'sandbox'::text)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    -- Testing override takes precedence when testing mode is on
    (
      SELECT override_plan
      FROM public.testing_plan_overrides
      WHERE user_id = _user_id
        AND public.testing_mode_enabled()
      LIMIT 1
    ),
    (
      SELECT public.plan_from_price_id(price_id)
      FROM public.subscriptions
      WHERE user_id = _user_id
        AND environment = _env
        AND (
          (status IN ('active','trialing','past_due')
            AND (current_period_end IS NULL OR current_period_end > now()))
          OR (status = 'canceled' AND current_period_end > now())
        )
        AND price_id IN ('pro_monthly','coach_plus_monthly')
      ORDER BY
        CASE WHEN price_id = 'coach_plus_monthly' THEN 2 ELSE 1 END DESC,
        created_at DESC
      LIMIT 1
    ),
    'free'
  );
$$;