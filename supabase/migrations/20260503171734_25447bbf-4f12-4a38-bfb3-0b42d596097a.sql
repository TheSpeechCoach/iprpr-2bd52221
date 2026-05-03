alter table public.prep_sessions
  drop constraint if exists prep_sessions_interview_track_check;

alter table public.prep_sessions
  add constraint prep_sessions_interview_track_check
  check (interview_track in ('professional','academic','graduate','media'));