-- Track AI answer evaluations per user per calendar month (UTC).
CREATE TABLE IF NOT EXISTS public.answer_evaluation_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  evaluations_used integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, period_start)
);

ALTER TABLE public.answer_evaluation_usage ENABLE ROW LEVEL SECURITY;

-- Users can read their own usage row.
CREATE POLICY "aeu select own"
  ON public.answer_evaluation_usage
  FOR SELECT
  USING (auth.uid() = user_id);

-- Admins can read all rows.
CREATE POLICY "aeu admin read"
  ON public.answer_evaluation_usage
  FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Service role manages writes (no client INSERT/UPDATE/DELETE policies).
CREATE POLICY "aeu service role manage"
  ON public.answer_evaluation_usage
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS answer_evaluation_usage_user_period_idx
  ON public.answer_evaluation_usage (user_id, period_start);

-- Reuse existing updated_at trigger function.
CREATE TRIGGER aeu_set_updated_at
  BEFORE UPDATE ON public.answer_evaluation_usage
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();