-- Enforce 50-question hard constraint across the system.

-- 1) Backfill existing prep_sessions to num_questions = 50.
UPDATE public.prep_sessions SET num_questions = 50 WHERE num_questions <> 50;

-- 2) Add CHECK constraint so num_questions can only ever be 50 going forward.
ALTER TABLE public.prep_sessions DROP CONSTRAINT IF EXISTS prep_sessions_num_questions_eq_50;
ALTER TABLE public.prep_sessions
  ADD CONSTRAINT prep_sessions_num_questions_eq_50 CHECK (num_questions = 50);

-- 3) Trigger: refuse any insert into interview_questions that would push
--    a session beyond 50 rows. Source-of-truth safety net.
CREATE OR REPLACE FUNCTION public.enforce_max_50_questions_per_session()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_count int;
BEGIN
  SELECT COUNT(*) INTO current_count
  FROM public.interview_questions
  WHERE session_id = NEW.session_id;

  IF current_count >= 50 THEN
    RAISE EXCEPTION 'QUESTION_LIMIT_EXCEEDED: prep session % already has 50 questions', NEW.session_id
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_max_50_questions ON public.interview_questions;
CREATE TRIGGER trg_enforce_max_50_questions
BEFORE INSERT ON public.interview_questions
FOR EACH ROW
EXECUTE FUNCTION public.enforce_max_50_questions_per_session();