create index if not exists idx_subscriptions_intro_offer
on public.subscriptions(user_id, pro_intro_offer_redeemed);