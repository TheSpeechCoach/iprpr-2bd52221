ALTER TABLE public.interview_questions
  ADD COLUMN IF NOT EXISTS example_answers jsonb,
  ADD COLUMN IF NOT EXISTS user_answer text;