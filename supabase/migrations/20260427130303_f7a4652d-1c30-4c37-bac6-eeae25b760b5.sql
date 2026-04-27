CREATE OR REPLACE FUNCTION public.enforce_paid_for_user_answer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
  user_plan_sandbox text;
  user_plan_live text;
  is_paid boolean;
BEGIN
  -- Service role bypasses (e.g. backend functions writing answers).
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Only enforce when user_answer is being set/changed to a non-empty value.
  IF NEW.user_answer IS NULL OR length(trim(NEW.user_answer)) = 0 THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND COALESCE(OLD.user_answer, '') = COALESCE(NEW.user_answer, '') THEN
    RETURN NEW;
  END IF;

  user_plan_sandbox := public.get_user_plan(caller, 'sandbox');
  user_plan_live := public.get_user_plan(caller, 'live');
  is_paid := user_plan_sandbox IN ('pro','coach_plus')
          OR user_plan_live IN ('pro','coach_plus');

  IF NOT is_paid THEN
    RAISE EXCEPTION 'UPGRADE_REQUIRED: saving answers is a Pro feature'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_paid_user_answer ON public.interview_questions;
CREATE TRIGGER trg_enforce_paid_user_answer
  BEFORE INSERT OR UPDATE OF user_answer ON public.interview_questions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_paid_for_user_answer();