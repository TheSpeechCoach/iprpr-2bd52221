import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { ChevronLeft } from "lucide-react";

interface PrepSession {
  id: string;
  title: string;
  status: string;
  user_id: string;
  full_name: string | null;
  candidate_current_role: string | null;
  target_role: string | null;
  target_industry: string | null;
  seniority_level: string | null;
  job_title: string | null;
  company_name: string | null;
  job_description: string | null;
  job_spec_url: string | null;
  cv_file_path: string | null;
  cv_text: string | null;
  linkedin_text: string | null;
  candidate_summary: string | null;
  role_summary: string | null;
  organisation_research: any;
  interview_track: string | null;
  created_at: string;
}

interface Question {
  id: string;
  position: number;
  category: string;
  question: string;
  difficulty: string | null;
  why_matters: string | null;
  what_good_covers: string | null;
}

interface SavedAnswer {
  id: string;
  question_id: string;
  answer_text: string;
  created_at: string;
}

interface GenJob {
  id: string;
  status: string;
  stage: string | null;
  progress: number;
  questions_generated: number;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  failed_at: string | null;
  created_at: string;
}

interface UploadedFile {
  id: string;
  original_filename: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
}

function preview(text: string | null | undefined, max = 600) {
  if (!text) return null;
  return text.length > max ? text.slice(0, max) + "…" : text;
}

export default function AdminSessionDetail() {
  const { id } = useParams<{ id: string }>();
  const [session, setSession] = useState<PrepSession | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<SavedAnswer[]>([]);
  const [jobs, setJobs] = useState<GenJob[]>([]);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const sessRes = await supabase.from("prep_sessions").select("*").eq("id", id).maybeSingle();
        if (sessRes.error) throw sessRes.error;
        if (!sessRes.data) {
          setError("Session not found.");
          setLoading(false);
          return;
        }
        setSession(sessRes.data as unknown as PrepSession);

        const [profRes, qRes, aRes, jRes, fRes] = await Promise.all([
          supabase.from("profiles").select("email").eq("id", sessRes.data.user_id).maybeSingle(),
          supabase.from("interview_questions").select("id,position,category,question,difficulty,why_matters,what_good_covers").eq("session_id", id).order("position"),
          supabase.from("saved_answers").select("id,question_id,answer_text,created_at").eq("prep_session_id", id),
          supabase.from("generation_jobs").select("id,status,stage,progress,questions_generated,error_message,started_at,completed_at,failed_at,created_at").eq("prep_session_id", id).order("created_at", { ascending: false }),
          supabase.from("uploaded_files").select("id,original_filename,mime_type,size_bytes,created_at").eq("session_id", id).order("created_at", { ascending: false }),
        ]);
        setUserEmail(profRes.data?.email ?? null);
        setQuestions((qRes.data ?? []) as Question[]);
        setAnswers((aRes.data ?? []) as SavedAnswer[]);
        setJobs((jRes.data ?? []) as GenJob[]);
        setFiles((fRes.data ?? []) as UploadedFile[]);
      } catch (e: any) {
        setError(e?.message ?? String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const answerByQuestion = new Map(answers.map((a) => [a.question_id, a]));

  return (
    <AdminLayout>
      <div className="space-y-5">
        <div className="flex items-center gap-2">
          <Button asChild size="sm" variant="ghost">
            <Link to="/admin/sessions"><ChevronLeft className="h-4 w-4 mr-1" /> All sessions</Link>
          </Button>
        </div>

        {loading ? (
          <Skeleton className="h-40 w-full rounded-md" />
        ) : error ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>
        ) : session ? (
          <>
            <header>
              <h1 className="text-xl font-semibold">{session.title}</h1>
              <div className="text-xs text-muted-foreground mt-1">
                {userEmail ?? "unknown user"} · created {format(new Date(session.created_at), "d MMM yyyy HH:mm")}
              </div>
            </header>

            <Card>
              <CardHeader className="p-4 pb-2"><CardTitle className="text-sm">Session summary</CardTitle></CardHeader>
              <CardContent className="p-4 pt-0 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <Field label="Status" value={<Badge variant={session.status === "failed" ? "destructive" : "secondary"}>{session.status}</Badge>} />
                <Field label="Candidate" value={session.full_name || "—"} />
                <Field label="Current role" value={session.candidate_current_role || "—"} />
                <Field label="Target role" value={session.target_role || "—"} />
                <Field label="Industry" value={session.target_industry || "—"} />
                <Field label="Seniority" value={session.seniority_level || "—"} />
                <Field label="Company" value={session.company_name || "—"} />
                <Field label="Questions" value={questions.length.toString()} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="p-4 pb-2"><CardTitle className="text-sm">Candidate input</CardTitle></CardHeader>
              <CardContent className="p-4 pt-0 space-y-3 text-sm">
                {files.length === 0 && !session.cv_text && !session.linkedin_text ? (
                  <p className="text-muted-foreground">No CV or profile data captured.</p>
                ) : null}
                {files.length > 0 && (
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Uploaded files</div>
                    <ul className="text-xs space-y-1">
                      {files.map((f) => (
                        <li key={f.id} className="font-mono">
                          {f.original_filename ?? "(no name)"} · {f.mime_type ?? "?"} · {f.size_bytes ?? 0} bytes
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {session.candidate_summary && (
                  <Block label="Extracted candidate summary" body={session.candidate_summary} />
                )}
                {session.cv_text && <Block label="Pasted CV text" body={preview(session.cv_text)} />}
                {session.linkedin_text && <Block label="LinkedIn / profile text" body={preview(session.linkedin_text)} />}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="p-4 pb-2"><CardTitle className="text-sm">Job input</CardTitle></CardHeader>
              <CardContent className="p-4 pt-0 space-y-3 text-sm">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <Field label="Job title" value={session.job_title || "—"} />
                  <Field label="Company" value={session.company_name || "—"} />
                  <Field label="Job spec URL" value={session.job_spec_url || "—"} />
                </div>
                {session.role_summary && <Block label="Extracted role summary" body={session.role_summary} />}
                {session.job_description && <Block label="Pasted job description" body={preview(session.job_description)} />}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="p-4 pb-2"><CardTitle className="text-sm">Organisation research</CardTitle></CardHeader>
              <CardContent className="p-4 pt-0 text-sm space-y-2">
                {(() => {
                  const r = session.organisation_research;
                  if (!r || typeof r !== "object") {
                    return <p className="text-muted-foreground">Not run.</p>;
                  }
                  return (
                    <>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <Field label="Status" value={<Badge variant={r.status === "failed" ? "destructive" : "secondary"}>{r.status ?? "ok"}</Badge>} />
                        <Field label="Sources" value={String(Array.isArray(r.sources) ? r.sources.length : 0)} />
                        <Field label="Last researched" value={r.last_researched_at ? format(new Date(r.last_researched_at), "d MMM yyyy HH:mm") : "—"} />
                        <Field label="Track" value={session.interview_track ?? "professional"} />
                      </div>
                      {r.summary && <Block label="Summary" body={r.summary} />}
                      {r.note && <p className="text-xs text-muted-foreground italic">{r.note}</p>}
                    </>
                  );
                })()}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="p-4 pb-2"><CardTitle className="text-sm">Generation jobs ({jobs.length})</CardTitle></CardHeader>
              <CardContent className="p-4 pt-0 text-sm">
                {jobs.length === 0 ? (
                  <p className="text-muted-foreground">No generation job recorded.</p>
                ) : (
                  <div className="space-y-2">
                    {jobs.map((j) => (
                      <div key={j.id} className="rounded-md border border-border p-3">
                        <div className="flex items-center justify-between gap-2">
                          <Badge variant={j.status === "failed" ? "destructive" : "secondary"}>{j.status}</Badge>
                          <span className="text-xs text-muted-foreground">
                            stage {j.stage ?? "—"} · {j.progress}% · {j.questions_generated} qs
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          created {format(new Date(j.created_at), "d MMM HH:mm")}
                          {j.started_at && ` · started ${format(new Date(j.started_at), "HH:mm")}`}
                          {j.completed_at && ` · completed ${format(new Date(j.completed_at), "HH:mm")}`}
                          {j.failed_at && ` · failed ${format(new Date(j.failed_at), "HH:mm")}`}
                        </div>
                        {j.error_message && (
                          <pre className="text-xs text-destructive mt-2 whitespace-pre-wrap">{j.error_message}</pre>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="p-4 pb-2"><CardTitle className="text-sm">Generated questions ({questions.length})</CardTitle></CardHeader>
              <CardContent className="p-4 pt-0 text-sm">
                {questions.length === 0 ? (
                  <p className="text-muted-foreground">No questions generated yet.</p>
                ) : (
                  <div className="space-y-2 max-h-[600px] overflow-y-auto">
                    {questions.map((q) => {
                      const ans = answerByQuestion.get(q.id);
                      return (
                        <div key={q.id} className="rounded-md border border-border p-3">
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="font-mono">#{q.position}</span>
                            <Badge variant="outline">{q.category}</Badge>
                            {q.difficulty && <Badge variant="outline">{q.difficulty}</Badge>}
                            {ans && <Badge variant="secondary">answered</Badge>}
                          </div>
                          <div className="mt-1 font-medium">{q.question}</div>
                          {q.why_matters && (
                            <div className="text-xs text-muted-foreground mt-1"><strong>Why:</strong> {q.why_matters}</div>
                          )}
                          {ans && (
                            <div className="mt-2 rounded bg-muted p-2 text-xs whitespace-pre-wrap">{ans.answer_text}</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>
    </AdminLayout>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-sm mt-0.5">{value}</div>
    </div>
  );
}

function Block({ label, body }: { label: string; body: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
      <pre className="text-xs whitespace-pre-wrap rounded bg-muted p-3 max-h-60 overflow-y-auto">{body}</pre>
    </div>
  );
}
