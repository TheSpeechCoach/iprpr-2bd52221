import { useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePlan, FREE_QUESTION_LIMIT } from "@/hooks/usePlan";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useCandidates } from "@/hooks/useCandidates";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { track } from "@/lib/analytics";
import { ArrowLeft, ArrowRight, Loader2, Sparkles, Lock } from "lucide-react";
import { INTERVIEW_TRACKS, type InterviewTrack } from "@/config/tracks";

const STEPS = ["Track", "Candidate", "Career", "Job", "Parameters", "Train"] as const;

const PrepWizard = () => {
  const { user } = useAuth();
  const { plan, canCreateSession, sessionsUsed } = usePlan();
  const { current: workspace } = useWorkspace();
  const { candidates, refresh: refreshCandidates } = useCandidates();
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [fetchingSpec, setFetchingSpec] = useState(false);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string>("");

  // Auto-select if there's exactly one candidate; clear when workspace changes.
  useEffect(() => {
    if (candidates.length === 1) setSelectedCandidateId(candidates[0].id);
    else if (!candidates.some((c) => c.id === selectedCandidateId)) setSelectedCandidateId("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates]);

  // When a candidate is picked, prefill the candidate-related form fields.
  useEffect(() => {
    if (!selectedCandidateId) return;
    const c = candidates.find((x) => x.id === selectedCandidateId);
    if (!c) return;
    setForm((f) => ({
      ...f,
      full_name: f.full_name || c.full_name,
      candidate_current_role: f.candidate_current_role || c.current_role_text || "",
      linkedin_url: f.linkedin_url || c.linkedin_url || "",
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCandidateId]);

  const isTeamWorkspace = useMemo(
    () => workspace ? !workspace.is_personal : false,
    [workspace],
  );

  const [form, setForm] = useState({
    interview_track: "professional" as InterviewTrack,
    full_name: "",
    candidate_current_role: "",
    years_experience: "",
    target_role: "",
    target_industry: "",
    interview_type: "competency-based",
    seniority_level: "mid",
    country: "United Kingdom",
    candidate_notes: "",
    cv_text: "",
    linkedin_text: "",
    linkedin_url: "",
    job_title: "",
    company_name: "",
    job_description: "",
    job_spec_url: "",
    num_questions: 50,
    difficulty: "standard",
    focus_mix: { technical: 30, behavioural: 30, leadership: 20, commercial: 10, culture_fit: 10 },
    include_followups: true,
    include_answer_angles: true,
    include_rubric: false,
    output_tone: "supportive",
    interview_style: "formal",
    _cv_file_path: "",
  });
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [fetchingLinkedin, setFetchingLinkedin] = useState(false);
  const [linkedinFetchError, setLinkedinFetchError] = useState<string | null>(null);
  const [extractingCv, setExtractingCv] = useState(false);
  const [cvExtractError, setCvExtractError] = useState<string | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);

  const isAcademic = form.interview_track === "academic";
  const isGraduate = form.interview_track === "graduate";
  const isMedia = form.interview_track === "media";

  const update = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));
  const updateMix = (k: string, v: number) => setForm((f) => ({ ...f, focus_mix: { ...f.focus_mix, [k]: v } }));

  // Track that the user started a new prep session (entered the wizard).
  useEffect(() => {
    if (user?.id) {
      void track("prep_session_started", { userId: user.id, plan });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const handleFetchSpec = async () => {
    if (!form.job_spec_url.trim()) {
      toast({ title: "Add a link first", description: "Paste the URL of a public job posting.", variant: "destructive" });
      return;
    }
    setFetchingSpec(true);
    try {
      const { data, error } = await supabase.functions.invoke("fetch-job-spec", {
        body: { url: form.job_spec_url.trim() },
      });
      if (error) throw error;
      if (!data?.ok) {
        toast({
          title: "Couldn't read that page",
          description: data?.error ?? "Some sites block automated readers. Paste the description below instead.",
          variant: "destructive",
        });
        return;
      }
      setForm((f) => ({
        ...f,
        job_title: f.job_title || data.job_title || "",
        company_name: f.company_name || data.company_name || "",
        job_description: data.raw_text || f.job_description,
      }));
      void track("job_input_added", {
        userId: user?.id ?? null,
        plan,
        metadata: { source: "url" },
      });
      toast({ title: "Job spec loaded", description: "Have a quick read and edit anything that's off." });
    } catch (err: any) {
      toast({
        title: "Couldn't fetch the page",
        description: err?.message ?? "Paste the description below instead.",
        variant: "destructive",
      });
    } finally {
      setFetchingSpec(false);
    }
  };

  const handleFetchLinkedin = async () => {
    if (!form.linkedin_url.trim()) return;
    setFetchingLinkedin(true);
    setLinkedinFetchError(null);
    try {
      const { data, error } = await supabase.functions.invoke("fetch-job-spec", {
        body: { url: form.linkedin_url.trim() },
      });
      if (error || !data?.ok) {
        setLinkedinFetchError(
          "We couldn't read this profile automatically. Please paste your About section or CV text in the next step."
        );
        return;
      }
      update("linkedin_text", data.raw_text || "");
      setLinkedinFetchError(null);
    } catch {
      setLinkedinFetchError(
        "We couldn't read this profile automatically. Please paste your About section or CV text in the next step."
      );
    } finally {
      setFetchingLinkedin(false);
    }
  };

  const handleCvFileChange = async (file: File | null) => {
    setCvFile(file);
    setCvExtractError(null);
    if (!file || !user || !workspace) return;
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["pdf", "docx"].includes(ext ?? "")) {
      setCvExtractError("Please upload a PDF or DOCX file.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setCvExtractError("File is over 10 MB. Please upload a smaller file.");
      return;
    }
    setExtractingCv(true);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${user.id}/${Date.now()}_${safeName}`;
      const { error: upErr } = await supabase.storage.from("cvs").upload(path, file, {
        contentType: file.type || undefined,
        upsert: false,
      });
      if (upErr) throw new Error(`Upload failed: ${upErr.message}`);
      const { data: ex, error: exErr } = await supabase.functions.invoke("extract-cv-text", {
        body: { file_path: path, bucket: "cvs", workspace_id: workspace.id, candidate_id: selectedCandidateId || null },
      });
      if (exErr || ex?.error) throw new Error(ex?.message || exErr?.message || "Extraction failed");
      if (ex?.text) {
        update("cv_text", ex.text);
        update("_cv_file_path", path);
      }
    } catch (err: any) {
      setCvExtractError(err?.message ?? "We couldn't read your CV. You can paste the text below instead.");
    } finally {
      setExtractingCv(false);
    }
  };

  const handleGenerate = async () => {
    if (!user) return;
    if (!workspace) {
      toast({ title: "Workspace required", description: "Pick a workspace from the top-right switcher.", variant: "destructive" });
      return;
    }
    if (isTeamWorkspace && !selectedCandidateId) {
      toast({ title: "Pick a candidate", description: "Select which candidate this prep session is for.", variant: "destructive" });
      setStep(1);
      return;
    }
    if (!canCreateSession) {
      toast({
        title: "Free limit reached",
        description: "You've reached your free limit for this month. Upgrade to Pro to generate more.",
        variant: "destructive",
      });
      nav("/upgrade");
      return;
    }
    if (!form.target_role.trim()) {
      setStep(1);
      setStepError("Please add the role you're targeting before we generate your questions.");
      return;
    }
    if (!form.job_description.trim() && !form.job_spec_url.trim() && !form.job_title.trim()) {
      setStep(3);
      setStepError("Please paste the job description, add a link, or at least enter a job title.");
      return;
    }
    const hasLinkedinUrl = /^https?:\/\/(www\.)?linkedin\.com\/.+/i.test(form.linkedin_url.trim());
    if (!cvFile && !form.cv_text.trim() && !form.linkedin_text.trim() && !hasLinkedinUrl) {
      setStep(2);
      setStepError("Please upload your CV or paste your profile text so we can tailor the questions.");
      return;
    }
    // If only a LinkedIn URL is provided, we can't read it server-side yet.
    if (!cvFile && !form.cv_text.trim() && !form.linkedin_text.trim() && hasLinkedinUrl) {
      setStep(2);
      setStepError("We couldn't read your LinkedIn profile automatically. Please paste your CV or profile text below.");
      return;
    }
    setSubmitting(true);
    let createdSessionId: string | null = null;
    try {
      // 1) Use already-extracted CV text and uploaded path from step 2
      const cv_file_path: string | null = form._cv_file_path || null;
      const extracted_cv_text = form.cv_text;
      if (cvFile) {
        const ext = cvFile.name.split(".").pop()?.toLowerCase();
        void track("cv_uploaded", {
          userId: user.id,
          plan,
          metadata: { size_bytes: cvFile.size, ext },
        });
      } else if (form.cv_text.trim() || form.linkedin_text.trim()) {
        void track("cv_uploaded", {
          userId: user.id,
          plan,
          metadata: { source: form.cv_text.trim() ? "pasted" : "linkedin" },
        });
      }

      // 2) Create session
      const { _cv_file_path: _omit, ...formForInsert } = form;
      const { data: session, error: sErr } = await supabase.from("prep_sessions").insert({
        user_id: user.id,
        workspace_id: workspace.id,
        candidate_id: selectedCandidateId || null,
        title: `${form.target_role.trim()}${form.company_name ? ` · ${form.company_name.trim()}` : ""}`,
        status: "generating",
        ...formForInsert,
        num_questions: 50,
        cv_text: extracted_cv_text,
        cv_file_path,
      }).select().single();
      if (sErr) throw new Error(`Could not create session: ${sErr.message}`);
      createdSessionId = session.id;

      // Track that the user provided job input (if not already via URL fetch).
      if (form.job_description.trim() || form.job_title.trim()) {
        void track("job_input_added", {
          userId: user.id,
          plan,
          sessionId: session.id,
          metadata: {
            source: form.job_description.trim() ? "pasted" : "title_only",
          },
        });
      }

      // 3) Kick off generation
      void track("generation_started", {
        userId: user.id,
        plan,
        sessionId: session.id,
      });
      // Fire-and-forget: research the organisation in the background so the
      // generation prompt can pick it up. Non-blocking — generation still runs
      // even if research is slow or unavailable.
      void supabase.functions.invoke("research-organisation-context", {
        body: {
          prep_session_id: session.id,
          track: (form as any).interview_track,
          organisation_name: form.company_name,
          job_spec_text: form.job_description,
          job_spec_url: form.job_spec_url,
          role_title: form.job_title || form.target_role,
        },
      }).catch(() => {});
      const { data: genData, error: fnErr } = await supabase.functions.invoke("generate-interview-pack", {
        body: { session_id: session.id },
      });
      if (fnErr) {
        // Edge functions returning non-2xx surface here; try to read the JSON body.
        let friendly = fnErr.message || "We couldn't start the generator. Please try again.";
        try {
          const ctx: any = (fnErr as any).context;
          if (ctx?.json) {
            const j = await ctx.json();
            if (j?.message) friendly = j.message;
          }
        } catch (_) {}
        throw new Error(friendly);
      }
      if (genData?.error) throw new Error(genData?.message || genData.error);

      toast({ title: "We're on it", description: "Your pack is being written. You can watch progress on the next screen." });
      nav(`/prep/${session.id}/results`);
    } catch (err: any) {
      if (createdSessionId) {
        await supabase.from("prep_sessions").update({ status: "failed" }).eq("id", createdSessionId);
      }
      toast({
        title: "We couldn't generate your pack",
        description: err?.message ?? "Something went wrong. Please try again in a moment.",
        variant: "destructive",
      });
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main className="container-tight flex-1 py-12 max-w-3xl">
        {plan === "free" && (
          <div className={`mb-8 border ${canCreateSession ? "border-border bg-secondary/40" : "border-accent/40 bg-accent/5"} p-4 flex items-start md:items-center gap-3 flex-col md:flex-row`}>
            {canCreateSession ? (
              <Sparkles className="h-4 w-4 text-accent shrink-0" />
            ) : (
              <Lock className="h-4 w-4 text-accent shrink-0" />
            )}
            <div className="flex-1 text-sm">
              {canCreateSession ? (
                <>
                  <span className="font-medium">Free plan includes 10 questions per month.</span>
                  <span className="text-muted-foreground"> You'll see the first {FREE_QUESTION_LIMIT} of your generated questions.</span>
                </>
              ) : (
                <>
                  <span className="font-medium">You've reached your free limit for this month.</span>
                  <span className="text-muted-foreground"> Upgrade to Pro to unlock the full set of 50 questions.</span>
                </>
              )}
            </div>
            <Link to="/upgrade">
              <Button size="sm" variant={canCreateSession ? "outline" : "default"} className={!canCreateSession ? "bg-accent hover:bg-accent/90 text-accent-foreground" : ""}>
                Upgrade
              </Button>
            </Link>
          </div>
        )}

        {/* Progress */}
        <div className="flex gap-2 mb-10">
          {STEPS.map((label, i) => (
            <div key={label} className="flex-1">
              <div className={`h-1 ${i <= step ? "bg-foreground" : "bg-border"}`} />
              <div className={`mt-2 text-[10px] uppercase tracking-widest ${i === step ? "text-foreground" : "text-muted-foreground"}`}>
                {String(i + 1).padStart(2, "0")} · {label}
              </div>
            </div>
          ))}
        </div>

        <div className="mb-8">
          <h1 className="font-display text-3xl font-semibold">
            {step === 0 && "What are you preparing for?"}
            {step === 1 && "Tell us about you"}
            {step === 2 && "Add your CV or profile text"}
            {step === 3 && "Describe the role"}
            {step === 4 && "Shape the questions"}
            {step === 5 && "Ready to train"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground max-w-xl">
            {step === 0 && "Choose your interview track so we can tailor the questions to the room you're walking into."}
            {step === 1 && "A few details so we can tailor the questions to your level and the role you're going for."}
            {step === 2 && "Upload your CV or paste your CV text. The more we know, the sharper the questions."}
            {step === 3 && "Paste the job description, share a link, or describe the role in your own words."}
            {step === 4 && "Optional. Adjust difficulty, balance, and the style of the interview you expect."}
            {step === 5 && "Have a quick look. You can come back and create more sessions any time."}
          </p>
        </div>

        {step === 0 && (
          <div className="space-y-3">
            {INTERVIEW_TRACKS.map((t) => {
              const selected = form.interview_track === t.value;
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => update("interview_track", t.value)}
                  className={`w-full text-left border p-5 transition-colors ${
                    selected
                      ? "border-foreground bg-secondary/40"
                      : "border-border hover:bg-secondary/30"
                  }`}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="font-display text-lg font-semibold">{t.label}</div>
                    <div className={`h-3 w-3 rounded-full border ${selected ? "bg-accent border-accent" : "border-border"}`} />
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">{t.blurb}</div>
                  <div className="text-xs text-muted-foreground/80 mt-2">{t.description}</div>
                </button>
              );
            })}
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5">
            {stepError && (
              <div className="border border-destructive/40 bg-destructive/5 text-destructive text-sm p-3 rounded">
                {stepError}
              </div>
            )}
            {isTeamWorkspace && (
              <Field
                label="Candidate"
                hint={
                  candidates.length === 0
                    ? "No candidates yet — add one from the Workspace page first."
                    : "Which candidate is this prep session for?"
                }
              >
                <div className="flex items-center gap-2">
                  <Select value={selectedCandidateId} onValueChange={setSelectedCandidateId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a candidate…" />
                    </SelectTrigger>
                    <SelectContent>
                      {candidates.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Link to="/workspace">
                    <Button type="button" variant="outline" size="sm">+ New</Button>
                  </Link>
                </div>
              </Field>
            )}
            <Field label="Full name" hint="Used in the candidate summary on your pack.">
              <Input value={form.full_name} onChange={(e) => update("full_name", e.target.value)} placeholder="e.g. Alex Morgan" />
            </Field>
            <Field
              label={isAcademic ? "LinkedIn profile (if applicable)" : "LinkedIn profile URL"}
              hint={
                isAcademic
                  ? "Optional for younger candidates."
                  : isMedia
                  ? "LinkedIn, personal website, or public bio URL."
                  : "Paste your LinkedIn URL — we'll try to pull your profile."
              }
            >
              <Input
                type="url"
                value={form.linkedin_url}
                onChange={(e) => update("linkedin_url", e.target.value)}
                placeholder="https://www.linkedin.com/in/your-profile"
              />
              <div className="mt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleFetchLinkedin}
                  disabled={fetchingLinkedin || !form.linkedin_url.trim()}
                >
                  {fetchingLinkedin && <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />}
                  Fetch profile
                </Button>
              </div>
              {linkedinFetchError && (
                <p className="text-xs text-destructive mt-1">{linkedinFetchError}</p>
              )}
              {!linkedinFetchError && form.linkedin_text.trim() && (
                <p className="text-xs text-green-600 mt-1">
                  Profile loaded — we'll use this to tailor your questions.
                </p>
              )}
            </Field>
            <Field
              label={
                isAcademic ? "Current school / year group"
                : isGraduate ? "Degree / current course"
                : isMedia ? "Your role / area of expertise"
                : "Current role"
              }
              hint="Your job title today."
            >
              <Input
                value={form.candidate_current_role}
                onChange={(e) => update("candidate_current_role", e.target.value)}
                placeholder={
                  isAcademic ? "e.g. Year 9 at St Paul's School / Year 13 at local grammar"
                  : isGraduate ? "e.g. Economics at University of Edinburgh / MBA at London Business School"
                  : isMedia ? "e.g. CEO of Acme Ltd / Author, The Hidden Economy / Climate scientist"
                  : "e.g. Senior Product Manager"
                }
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field
                label={
                  isAcademic ? "Age"
                  : isGraduate ? "Year of study / graduation year"
                  : isMedia ? "Media experience level"
                  : "Years of experience"
                }
              >
                <Input
                  value={form.years_experience}
                  onChange={(e) => update("years_experience", e.target.value)}
                  placeholder={
                    isAcademic ? "e.g. 13"
                    : isGraduate ? "e.g. Final year / Graduated 2024"
                    : isMedia ? "e.g. First appearance / Occasional contributor / Regular broadcaster"
                    : "e.g. 8"
                  }
                />
              </Field>
              <Field label="Country">
                <Input value={form.country} onChange={(e) => update("country", e.target.value)} placeholder="e.g. United Kingdom" />
              </Field>
            </div>
            <Field
              label={
                isAcademic ? "Target school / course"
                : isGraduate ? "Target scheme or role"
                : isMedia ? "Type of appearance"
                : "Target role"
              }
              hint="The job you're interviewing for. Required."
            >
              <Input
                value={form.target_role}
                onChange={(e) => update("target_role", e.target.value)}
                placeholder={
                  isAcademic ? "e.g. Entry to Eton College / PPE at Oxford / Medicine at UCL"
                  : isGraduate ? "e.g. Goldman Sachs Graduate Analyst / Civil Service Fast Stream / Unilever Future Leaders"
                  : isMedia ? "e.g. Podcast guest / BBC news interview / Conference keynote Q&A"
                  : "e.g. Head of Product"
                }
              />
            </Field>
            <Field
              label={
                isAcademic ? "Subject area"
                : isGraduate ? "Target sector"
                : isMedia ? "Your subject / expertise area"
                : "Target industry"
              }
              hint="Optional, but helps us pick the right examples."
            >
              <Input
                value={form.target_industry}
                onChange={(e) => update("target_industry", e.target.value)}
                placeholder={
                  isAcademic ? "e.g. Sciences / Humanities / Mathematics / Medicine"
                  : isGraduate ? "e.g. Investment banking / Management consulting / Technology / Public sector"
                  : isMedia ? "e.g. Climate policy / Fintech / Mental health / Leadership"
                  : "e.g. Fintech"
                }
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Interview type" hint="What kind of conversation are you preparing for?">
                <Select value={form.interview_type} onValueChange={(v) => update("interview_type", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(isAcademic ? [
                      ["admissions", "Admissions interview"],
                      ["entrance exam", "Entrance exam interview"],
                      ["oxbridge", "Oxbridge / tutorial-style"],
                      ["ivy-league", "Ivy League admissions"],
                      ["sixth-form", "Sixth form entry"],
                      ["scholarship", "Scholarship interview"],
                    ] : isGraduate ? [
                      ["scheme-interview", "Graduate scheme interview"],
                      ["strengths-based", "Strengths-based interview"],
                      ["assessment-centre", "Assessment centre debrief"],
                      ["video-interview", "Video / async interview"],
                      ["partner-interview", "Partner / manager interview"],
                      ["internship-conversion", "Internship conversion interview"],
                    ] : isMedia ? [
                      ["broadcast-live", "Live broadcast (TV / radio)"],
                      ["podcast-longform", "Podcast (long-form conversation)"],
                      ["press-interview", "Press / print interview"],
                      ["panel-discussion", "Panel discussion"],
                      ["conference-qa", "Conference / keynote Q&A"],
                      ["spokesperson", "Spokesperson / PR brief"],
                      ["social-media", "Social media video interview"],
                    ] : [
                      ["HR", "HR / first stage"],
                      ["hiring manager", "Hiring manager"],
                      ["technical", "Technical"],
                      ["panel", "Panel"],
                      ["executive", "Executive"],
                      ["competency-based", "Competency-based"],
                      ["case study", "Case study"],
                    ]).map(([v, label]) => (
                      <SelectItem key={v} value={v}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Seniority" hint="Used to calibrate question depth.">
                <Select value={form.seniority_level} onValueChange={(v) => update("seniority_level", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(isAcademic ? [
                      ["7-8", "Age 7–8 (7+/8+ entry)"],
                      ["10-11", "Age 10–11 (10+/11+ entry)"],
                      ["12-13", "Age 12–13 (12+/13+ entry)"],
                      ["15-16", "Age 15–16 (16+ / Sixth Form)"],
                      ["17-18", "Age 17–18 (University / Oxbridge)"],
                    ] : isGraduate ? [
                      ["penultimate-year", "Penultimate year student"],
                      ["final-year", "Final year student"],
                      ["recent-graduate", "Recent graduate (0–1 year)"],
                      ["early-professional", "Early professional (1–2 years)"],
                    ] : isMedia ? [
                      ["first-appearance", "First-time appearance"],
                      ["occasional", "Occasional contributor"],
                      ["regular", "Regular contributor / PR professional"],
                      ["experienced", "Experienced public figure / executive"],
                    ] : [
                      ["graduate", "Graduate"],
                      ["junior", "Junior"],
                      ["mid", "Mid-level"],
                      ["senior", "Senior"],
                      ["lead", "Lead"],
                      ["director", "Director"],
                      ["executive", "Executive"],
                    ]).map(([v, label]) => (
                      <SelectItem key={v} value={v}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field
              label="Anything else we should know?"
              hint={
                isAcademic ? "Optional. e.g. scholarship candidate, boarding entry, state school applying to selective independent, career changer returning to education."
                : isGraduate ? "Optional. e.g. switching degree discipline, applying speculatively, disability disclosure concern, mature student, international applicant."
                : isMedia ? "Optional. e.g. controversial topic, pending litigation, specific hostile question anticipated, embargo restrictions, co-author appearing too."
                : "Optional. e.g. career change, gap to explain, sector pivot."
              }
            >
              <Textarea value={form.candidate_notes} onChange={(e) => update("candidate_notes", e.target.value)} rows={3} placeholder="Optional context that will sharpen the questions…" />
            </Field>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            {stepError && (
              <div className="border border-destructive/40 bg-destructive/5 text-destructive text-sm p-3 rounded">
                {stepError}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <h2 className="font-display text-base font-semibold">Or add your CV</h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Either option works. Use whichever you have to hand.
                </p>
              </div>
              <Field
                label={
                  isAcademic ? "Upload CV or personal statement"
                  : isGraduate ? "Upload CV, covering letter, or academic transcript"
                  : isMedia ? "Upload your bio, press kit, or speaker profile"
                  : "Upload CV"
                }
                hint={
                  isAcademic ? "PDF or DOCX. For university applicants, upload the personal statement. For school applicants, any academic record or school report works."
                  : isGraduate ? "PDF or DOCX. Include your CV and any covering letter — both help us understand how you're presenting yourself."
                  : isMedia ? "PDF or DOCX. A speaker bio, press release, or previous interview transcript all help us build relevant questions."
                  : "PDF or DOCX, up to 10 MB."
                }
              >
                <Input type="file" accept=".pdf,.docx" onChange={(e) => handleCvFileChange(e.target.files?.[0] ?? null)} />
                {cvFile && <p className="text-xs text-muted-foreground mt-2">Selected: {cvFile.name}</p>}
                {extractingCv && (
                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" /> Reading your CV…
                  </p>
                )}
                {cvExtractError && <p className="text-xs text-destructive mt-1">{cvExtractError}</p>}
                {!extractingCv && !cvExtractError && form.cv_text.trim() && (
                  <p className="text-xs text-green-600 mt-1">CV read — {Math.round(form.cv_text.length / 5)} words extracted.</p>
                )}
              </Field>
              <Field label="Paste CV text" hint="Use this if you don't have a file handy.">
                <Textarea value={form.cv_text} onChange={(e) => update("cv_text", e.target.value)} rows={8} placeholder="Paste the contents of your CV here…" />
              </Field>
              <Field label="LinkedIn summary (optional)" hint="Paste your About section if you want to add extra context.">
                <Textarea value={form.linkedin_text} onChange={(e) => update("linkedin_text", e.target.value)} rows={3} placeholder="Optional — adds extra context the CV may not capture…" />
              </Field>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5">
            {stepError && (
              <div className="border border-destructive/40 bg-destructive/5 text-destructive text-sm p-3 rounded">
                {stepError}
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <Field label="Job title" hint="As written on the posting.">
                <Input value={form.job_title} onChange={(e) => update("job_title", e.target.value)} placeholder="e.g. Director of Product" />
              </Field>
              <Field
                label={
                  isAcademic ? "Institution name"
                  : isGraduate ? "Employer / scheme name"
                  : isMedia ? "Show / outlet / platform"
                  : "Company"
                }
                hint="Helps tailor company-specific motivation questions."
              >
                <Input
                  value={form.company_name}
                  onChange={(e) => update("company_name", e.target.value)}
                  placeholder={
                    isAcademic ? "e.g. University of Oxford / Eton College / The Perse School"
                    : isGraduate ? "e.g. Deloitte / Civil Service Fast Stream / Teach First"
                    : isMedia ? "e.g. Diary of a CEO / BBC Radio 4 Today / The Times"
                    : "e.g. Monzo"
                  }
                />
              </Field>
            </div>
            <div className="border border-border p-4 space-y-3">
              <Field
                label={
                  isAcademic ? "School or course URL"
                  : isGraduate ? "Scheme or role URL"
                  : isMedia ? "Show, programme, or outlet URL"
                  : "Job spec link"
                }
                hint={
                  isAcademic ? "Link to the admissions page, course page, or prospectus."
                  : isGraduate ? "Link to the graduate scheme page, job posting, or application portal."
                  : isMedia ? "Link to the podcast page, show website, or publication. Helps us understand the format and audience."
                  : "Paste a public URL and we'll pull the description for you."
                }
              >
                <div className="flex gap-2">
                  <Input
                    value={form.job_spec_url}
                    onChange={(e) => update("job_spec_url", e.target.value)}
                    placeholder="https://…"
                  />
                  <Button type="button" variant="outline" onClick={handleFetchSpec} disabled={fetchingSpec}>
                    {fetchingSpec ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Reading…</> : "Fetch"}
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground mt-2">
                  Some sites block automated readers. If that happens, paste the text below instead.
                </p>
              </Field>
            </div>
            <Field
              label={
                isAcademic ? "Paste admissions information or course description"
                : isGraduate ? "Paste the role or scheme description"
                : isMedia ? "Paste the interview brief or topic description"
                : "Job description"
              }
              hint="Paste the full text. The more detail, the sharper the questions."
            >
              <Textarea
                value={form.job_description}
                onChange={(e) => update("job_description", e.target.value)}
                rows={10}
                placeholder="Paste the full job description here…"
              />
            </Field>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Difficulty" hint="How tough should the panel feel?">
                <Select value={form.difficulty} onValueChange={(v) => update("difficulty", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[
                      ["standard", "Standard"],
                      ["advanced", "Advanced"],
                      ["brutal", "Brutal"],
                    ].map(([v, label]) => <SelectItem key={v} value={v}>{label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Number of questions" hint="Every pack contains 50 questions.">
                <Input type="number" min={50} max={50} value={50} disabled readOnly />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Tone of guidance" hint="How the answer notes are written.">
                <Select value={form.output_tone} onValueChange={(v) => update("output_tone", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[
                      ["supportive", "Supportive"],
                      ["direct", "Direct"],
                      ["executive", "Executive"],
                    ].map(([v, label]) => <SelectItem key={v} value={v}>{label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Interview style" hint="The atmosphere we should write for.">
                <Select value={form.interview_style} onValueChange={(v) => update("interview_style", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[
                      ["formal", "Formal"],
                      ["conversational", "Conversational"],
                      ["high-pressure", "High-pressure"],
                    ].map(([v, label]) => <SelectItem key={v} value={v}>{label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <div className="border border-border p-5">
              <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">Focus mix</div>
              <p className="text-xs text-muted-foreground mb-4">Rough weighting across question types. These are guides, not strict quotas.</p>
              {Object.entries(form.focus_mix).map(([k, v]) => (
                <div key={k} className="mb-4">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="capitalize">{k.replace("_", " ")}</span>
                    <span className="text-muted-foreground">{v}%</span>
                  </div>
                  <Slider value={[v as number]} onValueChange={([n]) => updateMix(k, n)} max={100} step={5} />
                </div>
              ))}
            </div>

            <div className="space-y-3">
              <Toggle label="Include likely follow-ups" value={form.include_followups} onChange={(v) => update("include_followups", v)} />
              <Toggle label="Include answer guidance" value={form.include_answer_angles} onChange={(v) => update("include_answer_angles", v)} />
              <Toggle label="Include a mock scoring rubric" value={form.include_rubric} onChange={(v) => update("include_rubric", v)} />
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-6">
            <div className="border border-border p-6 bg-secondary/30">
              <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-3">You're about to build your training set</div>
              <ul className="text-sm space-y-1.5 text-muted-foreground">
                <li>· <span className="text-foreground font-medium">{form.num_questions}</span> tailored questions</li>
                <li>· Difficulty: <span className="text-foreground">{form.difficulty}</span> · Tone: <span className="text-foreground">{form.output_tone}</span> · Style: <span className="text-foreground">{form.interview_style}</span></li>
                <li>· For: <span className="text-foreground">{form.target_role || "—"}</span>{form.company_name ? <> at <span className="text-foreground">{form.company_name}</span></> : null}</li>
                <li>· Profile: <span className="text-foreground">{form.linkedin_url.trim() ? "LinkedIn profile" : (cvFile ? cvFile.name : (form.cv_text.trim() ? "pasted CV text" : (form.linkedin_text.trim() ? "LinkedIn summary" : "—")))}</span></li>
              </ul>
            </div>
            <p className="text-xs text-muted-foreground">
              By continuing, you agree your details will be processed by our AI provider only to prepare this training set.
              You can return to it any time from your training dashboard.
            </p>
            <Button onClick={handleGenerate} disabled={submitting} size="lg" className="bg-accent hover:bg-accent/90 text-accent-foreground w-full">
              {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Building your training set…</> : <>Start training <ArrowRight className="h-4 w-4 ml-2" /></>}
            </Button>
            <p className="text-[11px] text-muted-foreground text-center">Building your training set (50 tailored questions). Your first 10 appear in seconds.</p>
          </div>
        )}

        <div className="flex justify-between mt-10 pt-6 border-t border-border">
          <Button variant="outline" onClick={() => { setStepError(null); setStep(Math.max(0, step - 1)); }} disabled={step === 0 || submitting}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Back
          </Button>
          {step < STEPS.length - 1 && (
            <Button onClick={() => { setStepError(null); setStep(step + 1); }}>
              Continue <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          )}
        </div>
      </main>
    </div>
  );
};

const Field = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
  <div className="space-y-2">
    <Label className="text-xs uppercase tracking-widest text-muted-foreground">{label}</Label>
    {children}
    {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
  </div>
);

const Toggle = ({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) => (
  <div className="flex items-center justify-between border border-border p-4">
    <span className="text-sm">{label}</span>
    <Switch checked={value} onCheckedChange={onChange} />
  </div>
);

export default PrepWizard;
