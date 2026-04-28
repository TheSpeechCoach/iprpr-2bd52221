REVOKE EXECUTE ON FUNCTION public.recent_abuse_signals(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.score_account_abuse(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.recent_abuse_signals(uuid) TO service_role;
GRANT  EXECUTE ON FUNCTION public.score_account_abuse(uuid)  TO service_role;