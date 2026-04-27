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

REVOKE EXECUTE ON FUNCTION public.get_user_plan(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_plan(uuid, text) TO service_role;

-- plan_from_price_id is pure and safe; lock its search_path too
CREATE OR REPLACE FUNCTION public.plan_from_price_id(_price_id text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN _price_id = 'pro_monthly' THEN 'pro'
    WHEN _price_id = 'coach_plus_monthly' THEN 'coach_plus'
    ELSE 'free'
  END;
$$;