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

const STEPS = ["Candidate", "Career", "Job", "Parameters", "Generate"] as const;

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

  const isTeamWorkspace = useMemo(
    () => workspace ? !workspace.is_personal : false,
    [workspace],
  );

  const [form, setForm] = useState({
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
    num_questions: 100,
    difficulty: "standard",
    focus_mix: { technical: 30, behavioural: 30, leadership: 20, commercial: 10, culture_fit: 10 },
    include_followups: true,
    include_answer_angles: true,
    include_rubric: false,
    output_tone: "supportive",
    interview_style: "formal",
  });
  const [cvFile, setCvFile] = useState<File | null>(null);

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

  const handleGenerate = async () => {
    if (!user) return;
    if (!canCreateSession) {
      toast({
        title: "Free limit reached",
        description: "You've used your free session. Upgrade to Pro to generate more.",
        variant: "destructive",
      });
      nav("/upgrade");
      return;
    }
    if (!form.target_role.trim()) {
      toast({ title: "Add a target role", description: "We need the role you're interviewing for to tailor the questions.", variant: "destructive" });
      setStep(0);
      return;
    }
    if (!form.job_description.trim() && !form.job_spec_url.trim() && !form.job_title.trim()) {
      toast({ title: "Tell us about the role", description: "Paste the job description, share a link, or at least add a job title.", variant: "destructive" });
      setStep(2);
      return;
    }
    if (!cvFile && !form.cv_text.trim() && !form.linkedin_text.trim()) {
      toast({ title: "Add some career evidence", description: "Upload your CV, paste it as text, or add a LinkedIn summary.", variant: "destructive" });
      setStep(1);
      return;
    }
    setSubmitting(true);
    let createdSessionId: string | null = null;
    try {
      // 1) Upload CV if present, then extract text server-side
      let cv_file_path: string | null = null;
      let extracted_cv_text = form.cv_text;
      if (cvFile) {
        if (cvFile.size > 10 * 1024 * 1024) throw new Error("Your CV is over 10 MB. Please upload a smaller file.");
        const ext = cvFile.name.split(".").pop()?.toLowerCase();
        if (!["pdf", "docx"].includes(ext ?? "")) throw new Error("CVs must be PDF or DOCX. Please convert and try again.");

        const safeName = cvFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${user.id}/${Date.now()}_${safeName}`;
        toast({ title: "Uploading your CV", description: "This usually takes a few seconds." });
        const { error: upErr } = await supabase.storage.from("cvs").upload(path, cvFile, {
          contentType: cvFile.type || undefined,
          upsert: false,
        });
        if (upErr) throw new Error(`We couldn't upload your CV: ${upErr.message}`);
        cv_file_path = path;

        toast({ title: "Reading your CV", description: "Pulling out the text we'll use to tailor your pack." });
        const { data: ex, error: exErr } = await supabase.functions.invoke("extract-cv-text", {
          body: { file_path: path, bucket: "cvs" },
        });
        if (exErr) {
          let friendly = `We couldn't read your CV: ${exErr.message}`;
          try {
            const ctx: any = (exErr as any).context;
            if (ctx?.json) {
              const j = await ctx.json();
              if (j?.message) friendly = j.message;
            }
          } catch (_) {}
          throw new Error(friendly);
        }
        if (ex?.error) throw new Error(ex.message || ex.error);
        if (ex?.text) extracted_cv_text = ex.text;
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
      const { data: session, error: sErr } = await supabase.from("prep_sessions").insert({
        user_id: user.id,
        title: `${form.target_role.trim()}${form.company_name ? ` · ${form.company_name.trim()}` : ""}`,
        status: "generating",
        ...form,
        num_questions: Math.max(20, Math.min(120, Number(form.num_questions) || 100)),
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

      void track("generation_completed", {
        userId: user.id,
        plan,
        sessionId: session.id,
      });
      toast({ title: "We're on it", description: "Your pack is being written. This usually takes 30–60 seconds." });
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
                  <span className="font-medium">Free plan</span>
                  <span className="text-muted-foreground"> · This is your one free session. You'll see the first {FREE_QUESTION_LIMIT} of your generated questions.</span>
                </>
              ) : (
                <>
                  <span className="font-medium">You've used your free session.</span>
                  <span className="text-muted-foreground"> Upgrade to Pro to generate unlimited packs and unlock the full {">"}100 questions.</span>
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
            {step === 0 && "Tell us about you"}
            {step === 1 && "Add your career evidence"}
            {step === 2 && "Describe the role"}
            {step === 3 && "Shape the questions"}
            {step === 4 && "Ready to generate"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground max-w-xl">
            {step === 0 && "A few details so we can tailor the questions to your level and the role you're going for."}
            {step === 1 && "Upload a CV, paste it, or share a LinkedIn summary. The more we know, the sharper the questions."}
            {step === 2 && "Paste the job description, share a link, or describe the role in your own words."}
            {step === 3 && "Optional. Adjust difficulty, balance, and the style of the interview you expect."}
            {step === 4 && "Have a quick look. You can come back and create more sessions any time."}
          </p>
        </div>

        {step === 0 && (
          <div className="space-y-5">
            <Field label="Full name" hint="Used in the candidate summary on your pack.">
              <Input value={form.full_name} onChange={(e) => update("full_name", e.target.value)} placeholder="e.g. Alex Morgan" />
            </Field>
            <Field label="Current role" hint="Your job title today.">
              <Input value={form.candidate_current_role} onChange={(e) => update("candidate_current_role", e.target.value)} placeholder="e.g. Senior Product Manager" />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Years of experience">
                <Input value={form.years_experience} onChange={(e) => update("years_experience", e.target.value)} placeholder="e.g. 8" />
              </Field>
              <Field label="Country">
                <Input value={form.country} onChange={(e) => update("country", e.target.value)} placeholder="e.g. United Kingdom" />
              </Field>
            </div>
            <Field label="Target role" hint="The job you're interviewing for. Required.">
              <Input value={form.target_role} onChange={(e) => update("target_role", e.target.value)} placeholder="e.g. Head of Product" />
            </Field>
            <Field label="Target industry" hint="Optional, but helps us pick the right examples.">
              <Input value={form.target_industry} onChange={(e) => update("target_industry", e.target.value)} placeholder="e.g. Fintech" />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Interview type" hint="What kind of conversation are you preparing for?">
                <Select value={form.interview_type} onValueChange={(v) => update("interview_type", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[
                      ["HR", "HR / first stage"],
                      ["hiring manager", "Hiring manager"],
                      ["technical", "Technical"],
                      ["panel", "Panel"],
                      ["executive", "Executive"],
                      ["competency-based", "Competency-based"],
                      ["case study", "Case study"],
                    ].map(([v, label]) => (
                      <SelectItem key={v} value={v}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Seniority" hint="Used to calibrate question depth.">
                <Select value={form.seniority_level} onValueChange={(v) => update("seniority_level", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[
                      ["graduate", "Graduate"],
                      ["junior", "Junior"],
                      ["mid", "Mid-level"],
                      ["senior", "Senior"],
                      ["lead", "Lead"],
                      ["director", "Director"],
                      ["executive", "Executive"],
                    ].map(([v, label]) => (
                      <SelectItem key={v} value={v}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field label="Anything else we should know?" hint="Optional. e.g. career change, gap to explain, sector pivot.">
              <Textarea value={form.candidate_notes} onChange={(e) => update("candidate_notes", e.target.value)} rows={3} placeholder="Optional context that will sharpen the questions…" />
            </Field>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5">
            <Field label="Upload your CV" hint="PDF or DOCX, up to 10 MB. We'll extract the text on our server.">
              <Input type="file" accept=".pdf,.docx" onChange={(e) => setCvFile(e.target.files?.[0] ?? null)} />
              {cvFile && <p className="text-xs text-muted-foreground mt-2">Selected: {cvFile.name}</p>}
            </Field>
            <div className="text-[11px] uppercase tracking-widest text-muted-foreground text-center">or</div>
            <Field label="Paste CV text" hint="Use this if you don't have a file handy.">
              <Textarea value={form.cv_text} onChange={(e) => update("cv_text", e.target.value)} rows={8} placeholder="Paste the contents of your CV here…" />
            </Field>
            <Field label="LinkedIn summary" hint="Optional. Paste your About section or recent role summaries.">
              <Textarea value={form.linkedin_text} onChange={(e) => update("linkedin_text", e.target.value)} rows={4} placeholder="Optional — adds extra context the CV may not capture…" />
            </Field>
            <Field label="LinkedIn URL" hint="Stored for your reference only — we don't scrape LinkedIn.">
              <Input value={form.linkedin_url} onChange={(e) => update("linkedin_url", e.target.value)} placeholder="https://linkedin.com/in/your-profile" />
            </Field>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Job title" hint="As written on the posting.">
                <Input value={form.job_title} onChange={(e) => update("job_title", e.target.value)} placeholder="e.g. Director of Product" />
              </Field>
              <Field label="Company" hint="Helps tailor company-specific motivation questions.">
                <Input value={form.company_name} onChange={(e) => update("company_name", e.target.value)} placeholder="e.g. Monzo" />
              </Field>
            </div>
            <div className="border border-border p-4 space-y-3">
              <Field label="Job spec link" hint="Paste a public URL and we'll pull the description for you.">
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
            <Field label="Job description" hint="Paste the full text. The more detail, the sharper the questions.">
              <Textarea
                value={form.job_description}
                onChange={(e) => update("job_description", e.target.value)}
                rows={10}
                placeholder="Paste the full job description here…"
              />
            </Field>
          </div>
        )}

        {step === 3 && (
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
              <Field label="Number of questions" hint="Between 20 and 120.">
                <Input type="number" min={20} max={120} value={form.num_questions} onChange={(e) => update("num_questions", Number(e.target.value))} />
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

        {step === 4 && (
          <div className="space-y-6">
            <div className="border border-border p-6 bg-secondary/30">
              <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-3">You're about to generate</div>
              <ul className="text-sm space-y-1.5 text-muted-foreground">
                <li>· <span className="text-foreground font-medium">{form.num_questions}</span> tailored questions</li>
                <li>· Difficulty: <span className="text-foreground">{form.difficulty}</span> · Tone: <span className="text-foreground">{form.output_tone}</span> · Style: <span className="text-foreground">{form.interview_style}</span></li>
                <li>· For: <span className="text-foreground">{form.target_role || "—"}</span>{form.company_name ? <> at <span className="text-foreground">{form.company_name}</span></> : null}</li>
                <li>· CV: <span className="text-foreground">{cvFile ? cvFile.name : (form.cv_text.trim() ? "pasted text" : (form.linkedin_text.trim() ? "LinkedIn summary" : "—"))}</span></li>
              </ul>
            </div>
            <p className="text-xs text-muted-foreground">
              By generating, you agree your details will be processed by our AI provider only to prepare this pack.
              You can return to it any time from your dashboard.
            </p>
            <Button onClick={handleGenerate} disabled={submitting} size="lg" className="bg-accent hover:bg-accent/90 text-accent-foreground w-full">
              {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Preparing your pack…</> : <>Generate my interview pack <ArrowRight className="h-4 w-4 ml-2" /></>}
            </Button>
            <p className="text-[11px] text-muted-foreground text-center">This usually takes 30–60 seconds.</p>
          </div>
        )}

        <div className="flex justify-between mt-10 pt-6 border-t border-border">
          <Button variant="outline" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0 || submitting}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Back
          </Button>
          {step < STEPS.length - 1 && (
            <Button onClick={() => setStep(step + 1)}>
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
