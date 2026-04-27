REVOKE EXECUTE ON FUNCTION public.pro_period_bounds(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.pro_usage_counts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pro_period_bounds(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pro_usage_counts(uuid) TO authenticated;