-- Add Stripe billing columns to subscriptions table
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS price_id text,
  ADD COLUMN IF NOT EXISTS product_id text,
  ADD COLUMN IF NOT EXISTS environment text NOT NULL DEFAULT 'sandbox';

-- Service role can manage all subscriptions (used by webhook)
DROP POLICY IF EXISTS "sub service role manage" ON public.subscriptions;
CREATE POLICY "sub service role manage"
  ON public.subscriptions FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_stripe_sub_id
  ON public.subscriptions(stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_env
  ON public.subscriptions(user_id, environment);

-- Map a price_id to a plan tier
CREATE OR REPLACE FUNCTION public.plan_from_price_id(_price_id text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN _price_id = 'pro_monthly' THEN 'pro'
    WHEN _price_id = 'coach_plus_monthly' THEN 'coach_plus'
    ELSE 'free'
  END;
$$;

-- Resolve current effective plan for a user (server-trusted)
CREATE OR REPLACE FUNCTION public.get_user_plan(_user_id uuid, _env text DEFAULT 'sandbox')
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
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

GRANT EXECUTE ON FUNCTION public.get_user_plan(uuid, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.plan_from_price_id(text) TO anon, authenticated, service_role;