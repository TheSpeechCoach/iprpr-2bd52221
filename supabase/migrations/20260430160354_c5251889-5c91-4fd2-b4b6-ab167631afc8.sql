-- Practice sessions: a single practice run, with chosen options & ordered question list
CREATE TABLE public.practice_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  prep_session_id uuid NOT NULL,
  workspace_id uuid,
  mode text NOT NULL DEFAULT 'category',
  selected_category text,
  question_order jsonb NOT NULL DEFAULT '[]'::jsonb,
  timer_seconds integer,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.practice_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prs select own" ON public.practice_sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "prs insert own" ON public.practice_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "prs update own" ON public.practice_sessions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "prs delete own" ON public.practice_sessions FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "prs service role" ON public.practice_sessions FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE INDEX idx_practice_sessions_user ON public.practice_sessions(user_id);
CREATE INDEX idx_practice_sessions_prep ON public.practice_sessions(prep_session_id);

CREATE TRIGGER trg_practice_sessions_updated
  BEFORE UPDATE ON public.practice_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Saved answers: user-written answers per question, optionally tied to a practice session
CREATE TABLE public.saved_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  prep_session_id uuid NOT NULL,
  question_id uuid NOT NULL,
  practice_session_id uuid,
  answer_text text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, question_id)
);

ALTER TABLE public.saved_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sa select own" ON public.saved_answers FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "sa insert own" ON public.saved_answers FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "sa update own" ON public.saved_answers FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "sa delete own" ON public.saved_answers FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "sa service role" ON public.saved_answers FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE INDEX idx_saved_answers_user_q ON public.saved_answers(user_id, question_id);
CREATE INDEX idx_saved_answers_prep ON public.saved_answers(prep_session_id);

CREATE TRIGGER trg_saved_answers_updated
  BEFORE UPDATE ON public.saved_answers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Answer scores: Coach+ AI critique results
CREATE TABLE public.answer_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  prep_session_id uuid NOT NULL,
  question_id uuid NOT NULL,
  saved_answer_id uuid NOT NULL,
  overall_score integer,
  clarity_score integer,
  structure_score integer,
  relevance_score integer,
  evidence_score integer,
  concision_score integer,
  authenticity_score integer,
  interview_impact_score integer,
  feedback_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.answer_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "as select own" ON public.answer_scores FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "as insert own" ON public.answer_scores FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "as delete own" ON public.answer_scores FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "as service role" ON public.answer_scores FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE INDEX idx_answer_scores_user_q ON public.answer_scores(user_id, question_id);
CREATE INDEX idx_answer_scores_saved ON public.answer_scores(saved_answer_id);