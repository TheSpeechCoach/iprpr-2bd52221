-- Rename interview_track values: scholar -> academic, grad -> graduate
ALTER TABLE public.prep_sessions
DROP CONSTRAINT IF EXISTS prep_sessions_interview_track_check;

UPDATE public.prep_sessions SET interview_track = 'academic' WHERE interview_track = 'scholar';
UPDATE public.prep_sessions SET interview_track = 'graduate' WHERE interview_track = 'grad';

ALTER TABLE public.prep_sessions
ADD CONSTRAINT prep_sessions_interview_track_check
CHECK (interview_track IN ('professional','academic','graduate','media'));