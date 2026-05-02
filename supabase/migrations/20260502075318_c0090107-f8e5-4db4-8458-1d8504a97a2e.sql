ALTER TABLE public.prep_sessions
ADD COLUMN IF NOT EXISTS interview_track text NOT NULL DEFAULT 'professional';

ALTER TABLE public.prep_sessions
DROP CONSTRAINT IF EXISTS prep_sessions_interview_track_check;

ALTER TABLE public.prep_sessions
ADD CONSTRAINT prep_sessions_interview_track_check
CHECK (interview_track IN ('professional','scholar','grad','media'));