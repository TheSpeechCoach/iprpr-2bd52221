-- candidate_inputs
CREATE TABLE public.candidate_inputs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  session_id UUID REFERENCES public.prep_sessions(id) ON DELETE CASCADE,
  full_name TEXT,
  candidate_current_role TEXT,
  years_experience TEXT,
  target_role TEXT,
  target_industry TEXT,
  seniority_level TEXT,
  country TEXT,
  notes TEXT,
  linkedin_url TEXT,
  linkedin_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_candidate_inputs_user ON public.candidate_inputs(user_id);
CREATE INDEX idx_candidate_inputs_session ON public.candidate_inputs(session_id);

-- uploaded_files
CREATE TABLE public.uploaded_files (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  session_id UUID REFERENCES public.prep_sessions(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'cv',
  bucket TEXT NOT NULL DEFAULT 'cvs',
  file_path TEXT NOT NULL,
  original_filename TEXT,
  mime_type TEXT,
  size_bytes BIGINT,
  extracted_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_uploaded_files_user ON public.uploaded_files(user_id);
CREATE INDEX idx_uploaded_files_session ON public.uploaded_files(session_id);

-- job_inputs
CREATE TABLE public.job_inputs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  session_id UUID REFERENCES public.prep_sessions(id) ON DELETE CASCADE,
  input_type TEXT NOT NULL DEFAULT 'description',
  job_title TEXT,
  company_name TEXT,
  job_spec_url TEXT,
  job_description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_job_inputs_user ON public.job_inputs(user_id);
CREATE INDEX idx_job_inputs_session ON public.job_inputs(session_id);

-- extracted_job_specs
CREATE TABLE public.extracted_job_specs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  session_id UUID REFERENCES public.prep_sessions(id) ON DELETE CASCADE,
  job_input_id UUID REFERENCES public.job_inputs(id) ON DELETE SET NULL,
  summary TEXT,
  responsibilities JSONB,
  requirements JSONB,
  skills JSONB,
  seniority TEXT,
  industry TEXT,
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_extracted_job_specs_user ON public.extracted_job_specs(user_id);
CREATE INDEX idx_extracted_job_specs_session ON public.extracted_job_specs(session_id);

-- generated_interview_packs
CREATE TABLE public.generated_interview_packs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  session_id UUID NOT NULL REFERENCES public.prep_sessions(id) ON DELETE CASCADE,
  model TEXT,
  prompt_version TEXT,
  total_questions INTEGER NOT NULL DEFAULT 0,
  candidate_summary TEXT,
  role_summary TEXT,
  top_themes JSONB,
  red_flags JSONB,
  status TEXT NOT NULL DEFAULT 'ready',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_generated_packs_user ON public.generated_interview_packs(user_id);
CREATE INDEX idx_generated_packs_session ON public.generated_interview_packs(session_id);

-- question_notes
CREATE TABLE public.question_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  question_id UUID NOT NULL REFERENCES public.interview_questions(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_question_notes_user ON public.question_notes(user_id);
CREATE INDEX idx_question_notes_question ON public.question_notes(question_id);

-- user_preferences
CREATE TABLE public.user_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  theme TEXT NOT NULL DEFAULT 'system',
  default_tone TEXT NOT NULL DEFAULT 'supportive',
  default_difficulty TEXT NOT NULL DEFAULT 'standard',
  default_style TEXT NOT NULL DEFAULT 'formal',
  locale TEXT NOT NULL DEFAULT 'en-GB',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_user_preferences_user ON public.user_preferences(user_id);

-- subscriptions
CREATE TABLE public.subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  plan TEXT NOT NULL DEFAULT 'free',
  status TEXT NOT NULL DEFAULT 'active',
  provider TEXT,
  provider_customer_id TEXT,
  provider_subscription_id TEXT,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_subscriptions_user ON public.subscriptions(user_id);

-- Enable RLS
ALTER TABLE public.candidate_inputs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uploaded_files            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_inputs                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.extracted_job_specs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generated_interview_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_notes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions             ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "ci select own"  ON public.candidate_inputs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "ci insert own"  ON public.candidate_inputs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "ci update own"  ON public.candidate_inputs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "ci delete own"  ON public.candidate_inputs FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "uf select own"  ON public.uploaded_files FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "uf insert own"  ON public.uploaded_files FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "uf update own"  ON public.uploaded_files FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "uf delete own"  ON public.uploaded_files FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "ji select own"  ON public.job_inputs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "ji insert own"  ON public.job_inputs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "ji update own"  ON public.job_inputs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "ji delete own"  ON public.job_inputs FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "ejs select own" ON public.extracted_job_specs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "ejs insert own" ON public.extracted_job_specs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "ejs update own" ON public.extracted_job_specs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "ejs delete own" ON public.extracted_job_specs FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "gip select own" ON public.generated_interview_packs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "gip insert own" ON public.generated_interview_packs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "gip update own" ON public.generated_interview_packs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "gip delete own" ON public.generated_interview_packs FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "gip admin read" ON public.generated_interview_packs FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "qn select own"  ON public.question_notes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "qn insert own"  ON public.question_notes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "qn update own"  ON public.question_notes FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "qn delete own"  ON public.question_notes FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "up select own"  ON public.user_preferences FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "up insert own"  ON public.user_preferences FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "up update own"  ON public.user_preferences FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "up delete own"  ON public.user_preferences FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "sub select own" ON public.subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "sub insert own" ON public.subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "sub update own" ON public.subscriptions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "sub delete own" ON public.subscriptions FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "sub admin read" ON public.subscriptions FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- updated_at triggers
CREATE TRIGGER trg_candidate_inputs_updated    BEFORE UPDATE ON public.candidate_inputs        FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER trg_uploaded_files_updated      BEFORE UPDATE ON public.uploaded_files          FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER trg_job_inputs_updated          BEFORE UPDATE ON public.job_inputs              FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER trg_extracted_job_specs_updated BEFORE UPDATE ON public.extracted_job_specs     FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER trg_generated_packs_updated     BEFORE UPDATE ON public.generated_interview_packs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER trg_question_notes_updated      BEFORE UPDATE ON public.question_notes          FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER trg_user_preferences_updated    BEFORE UPDATE ON public.user_preferences        FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER trg_subscriptions_updated       BEFORE UPDATE ON public.subscriptions           FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
