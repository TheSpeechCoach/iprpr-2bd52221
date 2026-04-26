import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";

const STEPS = ["Candidate", "Career", "Job", "Parameters", "Generate"] as const;

const PrepWizard = () => {
  const { user } = useAuth();
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [fetchingSpec, setFetchingSpec] = useState(false);

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

  const handleFetchSpec = async () => {
    if (!form.job_spec_url) {
      toast({ title: "Add a URL", description: "Paste a job-spec URL first.", variant: "destructive" });
      return;
    }
    setFetchingSpec(true);
    try {
      const { data, error } = await supabase.functions.invoke("fetch-job-spec", {
        body: { url: form.job_spec_url },
      });
      if (error) throw error;
      if (!data?.ok) {
        toast({
          title: "Couldn't extract automatically",
          description: data?.error ?? "Please paste the description manually.",
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
      toast({ title: "Job spec extracted", description: "Review and edit before continuing." });
    } catch (err: any) {
      toast({
        title: "Fetch failed",
        description: err.message ?? "Paste the description manually.",
        variant: "destructive",
      });
    } finally {
      setFetchingSpec(false);
    }
  };

  const handleGenerate = async () => {
    if (!user) return;
    if (!form.target_role || (!form.job_description && !form.job_spec_url && !form.job_title)) {
      toast({ title: "Missing details", description: "Add a target role and either a job title, description or URL.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      // Upload CV if present, then extract text server-side
      let cv_file_path: string | null = null;
      let extracted_cv_text = form.cv_text;
      if (cvFile) {
        if (cvFile.size > 10 * 1024 * 1024) throw new Error("CV exceeds 10MB limit");
        const ext = cvFile.name.split(".").pop()?.toLowerCase();
        if (!["pdf", "docx"].includes(ext ?? "")) throw new Error("CV must be a PDF or DOCX file");

        const path = `${user.id}/${Date.now()}_${cvFile.name}`;
        const { error: upErr } = await supabase.storage.from("cvs").upload(path, cvFile, {
          contentType: cvFile.type,
          upsert: false,
        });
        if (upErr) throw upErr;
        cv_file_path = path;

        toast({ title: "Extracting CV", description: "Reading your CV…" });
        const { data: ex, error: exErr } = await supabase.functions.invoke("extract-cv-text", {
          body: { file_path: path, bucket: "cvs" },
        });
        if (exErr) throw new Error(exErr.message);
        if (ex?.text) extracted_cv_text = ex.text;
      }

      // Create session
      const { data: session, error: sErr } = await supabase.from("prep_sessions").insert({
        user_id: user.id,
        title: `${form.target_role}${form.company_name ? ` · ${form.company_name}` : ""}`,
        status: "generating",
        ...form,
        cv_text: extracted_cv_text,
        cv_file_path,
      }).select().single();
      if (sErr) throw sErr;

      // Invoke edge function
      const { error: fnErr } = await supabase.functions.invoke("generate-interview-pack", {
        body: { session_id: session.id },
      });
      if (fnErr) throw fnErr;

      toast({ title: "Generating your pack", description: "Tailored questions are being prepared." });
      nav(`/prep/${session.id}/results`);
    } catch (err: any) {
      toast({ title: "Could not generate", description: err.message, variant: "destructive" });
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main className="container-tight flex-1 py-12 max-w-3xl">
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

        <h1 className="font-display text-3xl font-semibold mb-8">
          {step === 0 && "Tell us about you."}
          {step === 1 && "Add your career evidence."}
          {step === 2 && "Define the role."}
          {step === 3 && "Tune the generation."}
          {step === 4 && "Ready to generate."}
        </h1>

        {step === 0 && (
          <div className="space-y-5">
            <Field label="Full name"><Input value={form.full_name} onChange={(e) => update("full_name", e.target.value)} /></Field>
            <Field label="Current role"><Input value={form.candidate_current_role} onChange={(e) => update("candidate_current_role", e.target.value)} /></Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Years of experience"><Input value={form.years_experience} onChange={(e) => update("years_experience", e.target.value)} /></Field>
              <Field label="Country"><Input value={form.country} onChange={(e) => update("country", e.target.value)} /></Field>
            </div>
            <Field label="Target role"><Input value={form.target_role} onChange={(e) => update("target_role", e.target.value)} placeholder="e.g. Head of Product" /></Field>
            <Field label="Target industry"><Input value={form.target_industry} onChange={(e) => update("target_industry", e.target.value)} /></Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Interview type">
                <Select value={form.interview_type} onValueChange={(v) => update("interview_type", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["HR", "hiring manager", "technical", "panel", "executive", "competency-based", "case study"].map((x) => (
                      <SelectItem key={x} value={x}>{x}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Seniority">
                <Select value={form.seniority_level} onValueChange={(v) => update("seniority_level", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["graduate", "junior", "mid", "senior", "lead", "director", "executive"].map((x) => (
                      <SelectItem key={x} value={x}>{x}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field label="Notes (optional)"><Textarea value={form.candidate_notes} onChange={(e) => update("candidate_notes", e.target.value)} rows={3} /></Field>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5">
            <Field label="Upload CV (PDF or DOCX)">
              <Input type="file" accept=".pdf,.docx" onChange={(e) => setCvFile(e.target.files?.[0] ?? null)} />
              {cvFile && <p className="text-xs text-muted-foreground mt-2">{cvFile.name}</p>}
            </Field>
            <Field label="Or paste CV text">
              <Textarea value={form.cv_text} onChange={(e) => update("cv_text", e.target.value)} rows={8} placeholder="Paste your CV content…" />
            </Field>
            <Field label="LinkedIn summary (optional)">
              <Textarea value={form.linkedin_text} onChange={(e) => update("linkedin_text", e.target.value)} rows={4} />
            </Field>
            <Field label="LinkedIn URL (reference only)">
              <Input value={form.linkedin_url} onChange={(e) => update("linkedin_url", e.target.value)} placeholder="https://linkedin.com/in/…" />
              <p className="text-[11px] text-muted-foreground mt-2">LinkedIn URLs are stored only as reference unless an approved profile import is later enabled.</p>
            </Field>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Job title"><Input value={form.job_title} onChange={(e) => update("job_title", e.target.value)} /></Field>
              <Field label="Company"><Input value={form.company_name} onChange={(e) => update("company_name", e.target.value)} /></Field>
            </div>
            <div className="border border-border p-4 space-y-3">
              <Field label="Job spec URL (optional)">
                <div className="flex gap-2">
                  <Input
                    value={form.job_spec_url}
                    onChange={(e) => update("job_spec_url", e.target.value)}
                    placeholder="https://…"
                  />
                  <Button type="button" variant="outline" onClick={handleFetchSpec} disabled={fetchingSpec}>
                    {fetchingSpec ? <Loader2 className="h-4 w-4 animate-spin" /> : "Fetch"}
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground mt-2">
                  We'll fetch and structure the page. If extraction fails, paste the description below.
                </p>
              </Field>
            </div>
            <Field label="Job description (paste full text)">
              <Textarea
                value={form.job_description}
                onChange={(e) => update("job_description", e.target.value)}
                rows={10}
                placeholder="Or paste the full job description here…"
              />
            </Field>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Difficulty">
                <Select value={form.difficulty} onValueChange={(v) => update("difficulty", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["standard", "advanced", "brutal"].map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Number of questions">
                <Input type="number" min={20} max={120} value={form.num_questions} onChange={(e) => update("num_questions", Number(e.target.value))} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Output tone">
                <Select value={form.output_tone} onValueChange={(v) => update("output_tone", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["supportive", "direct", "executive"].map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Interview style">
                <Select value={form.interview_style} onValueChange={(v) => update("interview_style", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["formal", "conversational", "high-pressure"].map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
            </div>

            <div className="border border-border p-5">
              <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-4">Focus mix</div>
              {Object.entries(form.focus_mix).map(([k, v]) => (
                <div key={k} className="mb-4">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="capitalize">{k.replace("_", " ")}</span>
                    <span className="text-muted-foreground">{v}</span>
                  </div>
                  <Slider value={[v as number]} onValueChange={([n]) => updateMix(k, n)} max={100} step={5} />
                </div>
              ))}
            </div>

            <div className="space-y-3">
              <Toggle label="Include follow-up questions" value={form.include_followups} onChange={(v) => update("include_followups", v)} />
              <Toggle label="Include suggested answer angles" value={form.include_answer_angles} onChange={(v) => update("include_answer_angles", v)} />
              <Toggle label="Include mock scoring rubric" value={form.include_rubric} onChange={(v) => update("include_rubric", v)} />
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-6">
            <div className="border border-border p-6 bg-secondary/30">
              <h3 className="font-display text-lg font-semibold">You're about to generate</h3>
              <ul className="mt-3 text-sm space-y-1 text-muted-foreground">
                <li>· {form.num_questions} interview questions</li>
                <li>· Difficulty: <span className="text-foreground">{form.difficulty}</span></li>
                <li>· Tailored to: <span className="text-foreground">{form.target_role || "—"}</span> at <span className="text-foreground">{form.company_name || "—"}</span></li>
                <li>· Tone: {form.output_tone} · Style: {form.interview_style}</li>
              </ul>
            </div>
            <p className="text-xs text-muted-foreground">By generating, you confirm the data above may be processed by the AI service for the purpose of preparing your interview pack.</p>
            <Button onClick={handleGenerate} disabled={submitting} size="lg" className="bg-accent hover:bg-accent/90 text-accent-foreground w-full">
              {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating…</> : <>Generate interview pack <ArrowRight className="h-4 w-4 ml-2" /></>}
            </Button>
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

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-2">
    <Label className="text-xs uppercase tracking-widest text-muted-foreground">{label}</Label>
    {children}
  </div>
);

const Toggle = ({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) => (
  <div className="flex items-center justify-between border border-border p-4">
    <span className="text-sm">{label}</span>
    <Switch checked={value} onCheckedChange={onChange} />
  </div>
);

export default PrepWizard;
