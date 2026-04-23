
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE(user_id, role)
);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE TABLE public.prep_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  full_name TEXT,
  candidate_current_role TEXT,
  years_experience TEXT,
  target_role TEXT,
  target_industry TEXT,
  interview_type TEXT,
  seniority_level TEXT,
  country TEXT,
  candidate_notes TEXT,
  cv_file_path TEXT,
  cv_text TEXT,
  linkedin_text TEXT,
  linkedin_url TEXT,
  job_title TEXT,
  company_name TEXT,
  job_description TEXT,
  job_spec_url TEXT,
  extracted_job_summary JSONB,
  num_questions INT NOT NULL DEFAULT 100,
  difficulty TEXT NOT NULL DEFAULT 'standard',
  focus_mix JSONB NOT NULL DEFAULT '{}'::jsonb,
  include_followups BOOLEAN NOT NULL DEFAULT true,
  include_answer_angles BOOLEAN NOT NULL DEFAULT true,
  include_rubric BOOLEAN NOT NULL DEFAULT false,
  output_tone TEXT DEFAULT 'supportive',
  interview_style TEXT DEFAULT 'formal',
  candidate_summary TEXT,
  role_summary TEXT,
  top_themes JSONB,
  red_flags JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.interview_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.prep_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  position INT NOT NULL,
  category TEXT NOT NULL,
  question TEXT NOT NULL,
  why_matters TEXT,
  what_good_covers TEXT,
  follow_up TEXT,
  answer_framework TEXT,
  difficulty TEXT,
  starred BOOLEAN NOT NULL DEFAULT false,
  practised BOOLEAN NOT NULL DEFAULT false,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.practice_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.interview_questions(id) ON DELETE CASCADE,
  duration_seconds INT,
  text_answer TEXT,
  self_rating INT,
  confidence INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.admin_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prep_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interview_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users view own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins view all roles" ON public.user_roles FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "ps select own" ON public.prep_sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "ps insert own" ON public.prep_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "ps update own" ON public.prep_sessions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "ps delete own" ON public.prep_sessions FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "ps admin read" ON public.prep_sessions FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "iq select own" ON public.interview_questions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "iq insert own" ON public.interview_questions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "iq update own" ON public.interview_questions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "iq delete own" ON public.interview_questions FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "pa select own" ON public.practice_attempts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "pa insert own" ON public.practice_attempts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "pa update own" ON public.practice_attempts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "pa delete own" ON public.practice_attempts FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Admins read logs" ON public.admin_logs FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_prep_sessions_updated_at BEFORE UPDATE ON public.prep_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

INSERT INTO storage.buckets (id, name, public) VALUES ('cvs', 'cvs', false);

CREATE POLICY "Users upload own CVs" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'cvs' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users read own CVs" ON storage.objects FOR SELECT
  USING (bucket_id = 'cvs' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users delete own CVs" ON storage.objects FOR DELETE
  USING (bucket_id = 'cvs' AND auth.uid()::text = (storage.foldername(name))[1]);
