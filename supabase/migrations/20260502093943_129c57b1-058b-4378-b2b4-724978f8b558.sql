ALTER TABLE public.prep_sessions
  ADD COLUMN IF NOT EXISTS organisation_research jsonb;

COMMENT ON COLUMN public.prep_sessions.organisation_research IS
  'Structured JSON: { organisation_name, organisation_type, website, summary, mission_values[], recent_news[], products_services_programmes[], leadership_or_faculty[], culture_signals[], preferred_interview_style, known_interview_methods[], likely_assessment_criteria[], track_specific_notes[], sources[], status (ok|limited|failed), note, last_researched_at }.';