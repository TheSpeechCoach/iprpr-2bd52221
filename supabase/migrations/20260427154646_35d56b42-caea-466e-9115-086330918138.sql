-- Track Pro intro-offer ($19 first month) redemption per user.
-- Stored on subscriptions table: a redemption is tied to a Stripe sub.
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS pro_intro_offer_redeemed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pro_intro_offer_redeemed_at timestamptz;

-- Eligibility: Free user, has at least one prep_session, has not redeemed
-- the intro offer in any environment, and has no current paid sub.
CREATE OR REPLACE FUNCTION public.is_eligible_for_pro_intro_offer(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- not currently on a paid plan in either env
    public.get_user_plan(_user_id, 'sandbox') = 'free'
    AND public.get_user_plan(_user_id, 'live') = 'free'
    -- has at least one prep session
    AND EXISTS (SELECT 1 FROM public.prep_sessions WHERE user_id = _user_id)
    -- has not previously redeemed the intro offer
    AND NOT EXISTS (
      SELECT 1 FROM public.subscriptions
      WHERE user_id = _user_id AND pro_intro_offer_redeemed = true
    );
$$;

GRANT EXECUTE ON FUNCTION public.is_eligible_for_pro_intro_offer(uuid)
  TO anon, authenticated, service_role;