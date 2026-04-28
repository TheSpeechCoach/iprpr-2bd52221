import { useEffect, useMemo, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { usePlan, FREE_QUESTION_LIMIT } from "@/hooks/usePlan";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Loader2,
  Star,
  Search,
  ArrowLeft,
  Copy,
  CheckCircle2,
  StickyNote,
  Download,
  FileText,
  FileType,
  SlidersHorizontal,
  AlertTriangle,
  Target,
  Sparkles,
  Lock,
  Compass,
  Timer,
  XCircle,
  Lightbulb,
  HelpCircle,
  ListChecks,
  CornerDownRight,
  Mic,
  Quote,
  ChevronDown,
  Pencil,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { SoftUrgencyNote } from "@/components/SoftUrgencyNote";
import { ResultsOnboardingOverlay } from "@/components/ResultsOnboardingOverlay";
import { IntroOfferCallout } from "@/components/IntroOfferCallout";
import { useProIntroOfferEligibility } from "@/hooks/useProIntroOfferEligibility";
import { copy } from "@/lib/copy";

// Friendlier, plain-English category labels for the interviewer's lens.
const CATEGORY_LABELS: Record<string, string> = {
  "Opening": "Opening & rapport",
  "CV/Background": "Career & background",
  "Role-Fit": "Role fit",
  "Behavioural": "Behavioural evidence",
  "Strengths": "Strengths",
  "Weaknesses": "Weaknesses & gaps",
  "Leadership": "Leadership",
  "Stakeholder": "Stakeholder management",
  "Problem-Solving": "Problem solving",
  "Company Motivation": "Motivation for the company",
  "Commercial Awareness": "Commercial awareness",
  "Technical": "Technical depth",
  "Pressure": "Pressure & resilience",
  "Closing": "Closing & questions back",
};

const prettyCategory = (c: string) => CATEGORY_LABELS[c] ?? c;

const DIFFICULTY_TONE: Record<string, string> = {
  easy: "border-border text-muted-foreground",
  medium: "border-foreground/30 text-foreground",
  hard: "border-accent/60 text-accent",
};
import { toast } from "@/hooks/use-toast";
import { track, trackOnce } from "@/lib/analytics";
import jsPDF from "jspdf";
import { Document, Packer, Paragraph, HeadingLevel, TextRun, Header, Footer, AlignmentType } from "docx";
import { saveAs } from "file-saver";
import { EXPORT_DISTINCT_LIMITS, formatResetDate } from "@/lib/proLimits";

interface Question {
  id: string;
  position: number;
  category: string;
  question: string;
  why_matters: string | null;
  what_good_covers: string | null;
  follow_up: string | null;
  answer_framework: string | null;
  answer_direction: AnswerDirection | null;
  example_answers: ExampleAnswers | null;
  coach_insight: CoachInsight | null;
  user_answer: string | null;
  difficulty: string | null;
  starred: boolean;
  practised: boolean;
  note: string | null;
}

interface AnswerDirection {
  structure?: string;
  length?: string;
  avoid?: string[];
}

interface ExampleAnswers {
  foundation?: string;
  strong?: string;
  standout?: string;
}

interface CoachInsight {
  really_testing?: string;
  common_mistake?: string;
  how_to_approach?: string;
}

const AUTHENTICITY_PROMPT = "Now say this in your own words. Write how you'd actually deliver it in the room.";

interface Session {
  id: string;
  title: string;
  status: string;
  candidate_summary: string | null;
  role_summary: string | null;
  top_themes: any;
  red_flags: any;
  target_role: string | null;
  company_name: string | null;
  full_name: string | null;
  candidate_current_role: string | null;
}

const Results = () => {
  const { id } = useParams();
  const nav = useNavigate();
  const { plan, questionLimit } = usePlan();
  const { user } = useAuth();
  const { eligible: introEligible } = useProIntroOfferEligibility();
  const [candidateName, setCandidateName] = useState<string>("");

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    supabase
      .from("profiles")
      .select("candidate_full_name")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setCandidateName(data?.candidate_full_name ?? "");
      });
    return () => { cancelled = true; };
  }, [user?.id]);
  const [session, setSession] = useState<Session | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [search, setSearch] = useState("");
  const [activeCat, setActiveCat] = useState("all");
  const [activeDiff, setActiveDiff] = useState("all");
  const [showStarred, setShowStarred] = useState(false);
  const [loading, setLoading] = useState(true);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [answerDrafts, setAnswerDrafts] = useState<Record<string, string>>({});
  const [savingAnswerId, setSavingAnswerId] = useState<string | null>(null);
  const [savedAnswerId, setSavedAnswerId] = useState<string | null>(null);

  const [retrying, setRetrying] = useState(false);
  const [job, setJob] = useState<{
    status: string;
    progress_percentage: number;
    current_stage: string | null;
    questions_generated: number;
    total_questions: number;
    error_message: string | null;
  } | null>(null);

  // Debounced autosave for user answers.
  useEffect(() => {
    const entries = Object.entries(answerDrafts);
    if (entries.length === 0) return;
    const timers = entries.map(([qid, val]) => {
      const original = questions.find((x) => x.id === qid)?.user_answer ?? "";
      if (val === original) return null;
      return setTimeout(async () => {
        setSavingAnswerId(qid);
        const { error } = await supabase
          .from("interview_questions")
          .update({ user_answer: val })
          .eq("id", qid);
        setSavingAnswerId(null);
        if (error) {
          if (
            error.message?.includes("UPGRADE_REQUIRED") ||
            (error as any).code === "42501"
          ) {
            toast({
              title: "Upgrade to save answers",
              description: "Saving written answers is part of Pro. Upgrade to keep your work.",
              variant: "destructive",
            });
            nav("/upgrade");
          }
        } else {
          setQuestions((prev) =>
            prev.map((x) => (x.id === qid ? { ...x, user_answer: val } : x))
          );
          setSavedAnswerId(qid);
          setTimeout(() => setSavedAnswerId((s) => (s === qid ? null : s)), 1800);
        }
      }, 800);
    });
    return () => {
      timers.forEach((t) => t && clearTimeout(t));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answerDrafts]);

  const loadAll = async () => {
    if (!id) return;
    const { data: s } = await supabase
      .from("prep_sessions")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    setSession(s as Session);
    const { data: qs } = await supabase
      .from("interview_questions")
      .select("*")
      .eq("session_id", id)
      .order("position");
    setQuestions((qs ?? []) as Question[]);
    setLoading(false);
  };

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;
    const tick = async () => {
      // Poll the latest generation_jobs row for this session.
      const { data: j } = await supabase
        .from("generation_jobs")
        .select("status, progress_percentage, current_stage, questions_generated, total_questions, error_message")
        .eq("session_id", id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      if (j) setJob(j as any);

      // Also check the session row in case there's no job (legacy sessions) or it just flipped to ready.
      const { data: s } = await supabase
        .from("prep_sessions")
        .select("status")
        .eq("id", id)
        .maybeSingle();
      if (cancelled) return;

      const done = j?.status === "completed" || j?.status === "failed" || s?.status === "ready" || s?.status === "failed";
      if (done) {
        await loadAll();
        if (interval) clearInterval(interval);
      }
    };
    loadAll().then(() => {
      // Kick off an immediate tick, then poll every 2.5 s.
      void tick();
      interval = setInterval(tick, 2500);
    });
    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Track results_viewed once the pack is ready, plus question_10_reached when the
  // user actually has access to a 10th question.
  useEffect(() => {
    if (!id) return;
    if (session?.status === "ready" && questions.length > 0) {
      trackOnce("results_viewed", id, { plan, sessionId: id });
      const tenthVisible = questions.some(
        (q) => q.position >= 10 && q.position <= questionLimit,
      );
      if (tenthVisible) {
        trackOnce("question_10_reached", id, { plan, sessionId: id });
      }
    }
  }, [id, plan, questions, session?.status, questionLimit]);

  const retryGeneration = async () => {
    if (!id) return;
    setRetrying(true);
    try {
      await supabase.from("prep_sessions").update({ status: "generating" }).eq("id", id);
      const { error } = await supabase.functions.invoke("generate-interview-pack", {
        body: { session_id: id },
      });
      if (error) throw error;
      toast({ title: "Retrying generation", description: "This usually takes 30–60 seconds." });
      await loadAll();
    } catch (e: any) {
      toast({ title: "Retry failed", description: e?.message ?? "Please try again.", variant: "destructive" });
    } finally {
      setRetrying(false);
    }
  };

  const categories = useMemo(
    () => Array.from(new Set(questions.map((q) => q.category))).sort(),
    [questions]
  );
  const difficulties = useMemo(
    () =>
      Array.from(
        new Set(questions.map((q) => q.difficulty).filter(Boolean) as string[])
      ).sort(),
    [questions]
  );

  const filtered = useMemo(
    () =>
      questions.filter(
        (q) =>
          (activeCat === "all" || q.category === activeCat) &&
          (activeDiff === "all" || q.difficulty === activeDiff) &&
          (!showStarred || q.starred) &&
          (search === "" ||
            q.question.toLowerCase().includes(search.toLowerCase()) ||
            (q.why_matters ?? "").toLowerCase().includes(search.toLowerCase()))
      ),
    [questions, activeCat, activeDiff, showStarred, search]
  );

  const starredCount = questions.filter((q) => q.starred).length;
  const practisedCount = questions.filter((q) => q.practised).length;

  const toggleStar = async (q: Question) => {
    const next = !q.starred;
    setQuestions((prev) =>
      prev.map((x) => (x.id === q.id ? { ...x, starred: next } : x))
    );
    await supabase
      .from("interview_questions")
      .update({ starred: next })
      .eq("id", q.id);
  };

  const togglePractised = async (q: Question) => {
    const next = !q.practised;
    setQuestions((prev) =>
      prev.map((x) => (x.id === q.id ? { ...x, practised: next } : x))
    );
    await supabase
      .from("interview_questions")
      .update({ practised: next })
      .eq("id", q.id);
  };

  const saveNote = async (q: Question) => {
    const body = noteDrafts[q.id] ?? q.note ?? "";
    await supabase
      .from("interview_questions")
      .update({ note: body })
      .eq("id", q.id);
    setQuestions((prev) =>
      prev.map((x) => (x.id === q.id ? { ...x, note: body } : x))
    );
    toast({ title: "Note saved", description: "Your note will be here whenever you come back." });
  };

  const copyQuestion = (q: Question) => {
    navigator.clipboard.writeText(q.question);
    toast({ title: "Copied", description: "Question copied to your clipboard." });
  };

  /**
   * Gate exports against the per-billing-period cap.
   *  - Pro: 3 distinct sessions / period
   *  - Coach+: 10 distinct sessions / period
   * Re-exporting the same session in the same period does NOT count again.
   * Returns true if the export may proceed.
   */
  const checkExportAllowed = async (): Promise<boolean> => {
    if (!user || !id) return false;
    if (plan !== "pro" && plan !== "coach_plus") {
      nav("/upgrade");
      return false;
    }
    const limit = EXPORT_DISTINCT_LIMITS[plan];

    try {
      const [{ data: usage }, { data: alreadyExported }] = await Promise.all([
        supabase.rpc("pack_export_usage", { _user_id: user.id }),
        supabase.rpc("has_exported_session_in_period", {
          _user_id: user.id,
          _session_id: id,
        }),
      ]);
      const row = Array.isArray(usage) ? usage[0] : usage;
      const used = Number(row?.distinct_sessions_exported ?? 0);
      const periodEnd = (row?.period_end as string | null) ?? null;
      const isReExport = Boolean(alreadyExported);

      if (!isReExport && used >= limit) {
        track("pack_export_blocked", {
          plan,
          sessionId: id,
          metadata: { used, limit, period_end: periodEnd },
        });
        toast({
          title: "Export limit reached",
          description: `You've used ${used} of ${limit} pack exports this billing period. Resets ${formatResetDate(periodEnd)}.`,
          variant: "destructive",
        });
        return false;
      }
      return true;
    } catch (err) {
      console.warn("[exports] usage check failed, allowing export", err);
      return true;
    }
  };

  // Watermark text shown in header + footer of every exported page.
  // Tied to the named candidate; cannot be removed by the user.
  const watermarkLine = () => {
    const name = (session?.full_name || candidateName || "—").trim();
    const acct = user?.email ?? "—";
    return {
      header: `Prepared for ${name} — Account: ${acct}`,
      footer: "Interview Prep Pal by The Speech Coach — Not for resale or redistribution",
    };
  };

  const exportPDF = async () => {
    if (!(await checkExportAllowed())) return;
    const wm = watermarkLine();
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 48;
    const topBand = 28; // reserved for header watermark
    const bottomBand = 28; // reserved for footer watermark
    const maxW = pageW - margin * 2;
    let y = margin + topBand;

    const drawWatermark = () => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(120);
      // Header band
      doc.text(wm.header, margin, margin - 6);
      doc.setDrawColor(200);
      doc.line(margin, margin, pageW - margin, margin);
      // Footer band
      doc.line(margin, pageH - margin, pageW - margin, pageH - margin);
      const pageNum = doc.getNumberOfPages();
      doc.text(wm.footer, margin, pageH - margin + 14);
      doc.text(`Page ${pageNum}`, pageW - margin, pageH - margin + 14, { align: "right" });
      doc.setTextColor(0);
    };

    const newPage = () => {
      doc.addPage();
      y = margin + topBand;
    };

    const writeWrapped = (text: string, size: number, bold = false, gap = 6) => {
      doc.setFont("helvetica", bold ? "bold" : "normal");
      doc.setFontSize(size);
      const lines = doc.splitTextToSize(text, maxW);
      for (const line of lines) {
        if (y > pageH - margin - bottomBand) newPage();
        doc.text(line, margin, y);
        y += size * 1.25;
      }
      y += gap;
    };

    writeWrapped(session?.title ?? "Interview pack", 20, true, 12);
    if (session?.candidate_summary) {
      writeWrapped("Candidate summary", 11, true, 2);
      writeWrapped(session.candidate_summary, 10, false, 10);
    }
    if (session?.role_summary) {
      writeWrapped("Role summary", 11, true, 2);
      writeWrapped(session.role_summary, 10, false, 10);
    }
    if (Array.isArray(session?.top_themes) && session!.top_themes.length) {
      writeWrapped("Top themes", 11, true, 2);
      writeWrapped((session!.top_themes as string[]).join(" • "), 10, false, 14);
    }

    questions.forEach((q) => {
      writeWrapped(
        `${String(q.position).padStart(3, "0")}. ${q.question}`,
        11,
        true,
        2
      );
      writeWrapped(
        `${q.category}${q.difficulty ? " · " + q.difficulty : ""}`,
        9,
        false,
        4
      );
      if (q.why_matters) writeWrapped(`Why this matters: ${q.why_matters}`, 9);
      if (q.what_good_covers)
        writeWrapped(`What good answers cover: ${q.what_good_covers}`, 9);
      if (q.follow_up) writeWrapped(`Follow-up: ${q.follow_up}`, 9);
      y += 6;
    });

    // Stamp watermark on every page after content is laid out
    const total = doc.getNumberOfPages();
    for (let i = 1; i <= total; i += 1) {
      doc.setPage(i);
      drawWatermark();
    }

    doc.save(`${session?.title ?? "interview-pack"}.pdf`);
    track("pack_exported_pdf", { plan, sessionId: id });
  };

  const exportDOCX = async () => {
    if (!(await checkExportAllowed())) return;
    const wm = watermarkLine();
    const children: Paragraph[] = [];
    children.push(
      new Paragraph({
        text: session?.title ?? "Interview pack",
        heading: HeadingLevel.HEADING_1,
      })
    );
    if (session?.candidate_summary) {
      children.push(
        new Paragraph({ text: "Candidate summary", heading: HeadingLevel.HEADING_2 })
      );
      children.push(new Paragraph({ text: session.candidate_summary }));
    }
    if (session?.role_summary) {
      children.push(
        new Paragraph({ text: "Role summary", heading: HeadingLevel.HEADING_2 })
      );
      children.push(new Paragraph({ text: session.role_summary }));
    }
    if (Array.isArray(session?.top_themes) && session!.top_themes.length) {
      children.push(
        new Paragraph({ text: "Top themes", heading: HeadingLevel.HEADING_2 })
      );
      children.push(
        new Paragraph({ text: (session!.top_themes as string[]).join(" • ") })
      );
    }
    children.push(
      new Paragraph({ text: "Questions", heading: HeadingLevel.HEADING_2 })
    );

    questions.forEach((q) => {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          children: [
            new TextRun({
              text: `${String(q.position).padStart(3, "0")}. ${q.question}`,
              bold: true,
            }),
          ],
        })
      );
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `${q.category}${q.difficulty ? " · " + q.difficulty : ""}`,
              italics: true,
            }),
          ],
        })
      );
      if (q.why_matters)
        children.push(new Paragraph({ text: `Why this matters: ${q.why_matters}` }));
      if (q.what_good_covers)
        children.push(
          new Paragraph({ text: `What good answers cover: ${q.what_good_covers}` })
        );
      if (q.follow_up)
        children.push(new Paragraph({ text: `Follow-up: ${q.follow_up}` }));
      children.push(new Paragraph({ text: "" }));
    });

    const doc = new Document({
      sections: [
        {
          headers: {
            default: new Header({
              children: [
                new Paragraph({
                  alignment: AlignmentType.LEFT,
                  children: [
                    new TextRun({ text: wm.header, size: 16, color: "888888" }),
                  ],
                }),
              ],
            }),
          },
          footers: {
            default: new Footer({
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [
                    new TextRun({ text: wm.footer, size: 16, color: "888888" }),
                  ],
                }),
              ],
            }),
          },
          children,
        },
      ],
    });
    const blob = await Packer.toBlob(doc);
    saveAs(blob, `${session?.title ?? "interview-pack"}.docx`);
    track("pack_exported_docx", { plan, sessionId: id });
  };

  // ----- Loading state -----
  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <SiteHeader />
        <main className="container-tight flex-1 py-10 space-y-8">
          <Skeleton className="h-10 w-2/3" />
          <div className="grid md:grid-cols-3 gap-px bg-border">
            {[0, 1, 2].map((i) => (
              <div key={i} className="bg-background p-6">
                <Skeleton className="h-3 w-24 mb-3" />
                <Skeleton className="h-4 w-full mb-2" />
                <Skeleton className="h-4 w-5/6" />
              </div>
            ))}
          </div>
          <Skeleton className="h-10 w-full" />
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </main>
      </div>
    );
  }

  // ----- Generating state -----
  const isGenerating =
    session?.status === "generating" ||
    job?.status === "queued" ||
    job?.status === "processing";
  if (isGenerating) {
    const pct = Math.max(2, Math.min(99, job?.progress_percentage ?? 5));
    const stage = job?.current_stage ?? "Preparing your pack";
    const generated = job?.questions_generated ?? 0;
    const total = job?.total_questions ?? session?.num_questions ?? 0;
    return (
      <div className="min-h-screen flex flex-col">
        <SiteHeader />
        <main className="container-tight flex-1 flex flex-col items-center justify-center py-24 text-center">
          <Loader2 className="h-10 w-10 animate-spin text-accent" strokeWidth={1.5} />
          <div className="mt-6 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Preparing your pack</div>
          <h1 className="mt-2 font-display text-3xl font-semibold">
            We're writing your interview questions
          </h1>
          <p className="mt-3 text-muted-foreground max-w-md">
            {stage}{total > 0 ? ` · ${generated} of ${total} questions ready` : ""}
          </p>
          <div className="mt-8 w-full max-w-md">
            <div className="h-2 w-full bg-secondary overflow-hidden rounded-full">
              <div
                className="h-full bg-accent transition-all duration-500 ease-out"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="mt-2 text-xs text-muted-foreground">{pct}%</div>
          </div>
          <p className="mt-6 text-xs text-muted-foreground max-w-md">
            This usually takes 60–120 seconds. Feel free to leave this page and come back from your dashboard — your pack will keep building in the background.
          </p>
        </main>
      </div>
    );
  }

  // ----- Failed state -----
  const hasFailed = session?.status === "failed" || job?.status === "failed";
  if (hasFailed) {
    return (
      <div className="min-h-screen flex flex-col">
        <SiteHeader />
        <main className="container-tight flex-1 flex flex-col items-center justify-center py-24 text-center">
          <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Something went wrong</div>
          <h1 className="mt-2 font-display text-3xl font-semibold">We couldn't finish your pack</h1>
          <p className="mt-3 text-muted-foreground max-w-md">
            {job?.error_message
              ? job.error_message
              : "This is usually a brief hiccup with the AI service. Retry now, or come back in a minute or two — your inputs are saved."}
          </p>
          <div className="mt-8 flex gap-3">
            <Button onClick={retryGeneration} disabled={retrying} className="bg-accent hover:bg-accent/90 text-accent-foreground">
              {retrying ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Retrying…</> : "Try again"}
            </Button>
            <Link to="/dashboard">
              <Button variant="outline">Back to dashboard</Button>
            </Link>
          </div>
        </main>
      </div>
    );
  }

  // ----- Empty state -----
  if (!questions.length) {
    return (
      <div className="min-h-screen flex flex-col">
        <SiteHeader />
        <main className="container-tight flex-1 flex flex-col items-center justify-center py-24 text-center">
          <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Empty pack</div>
          <h1 className="mt-2 font-display text-3xl font-semibold">No questions to show</h1>
          <p className="mt-3 text-muted-foreground max-w-md">
            This session doesn't have any questions yet. Try regenerating, or start a fresh session.
          </p>
          <div className="mt-8 flex gap-3">
            <Button onClick={retryGeneration} disabled={retrying} className="bg-accent hover:bg-accent/90 text-accent-foreground">
              {retrying ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Regenerating…</> : "Regenerate"}
            </Button>
            <Link to="/dashboard">
              <Button variant="outline">Back to dashboard</Button>
            </Link>
          </div>
        </main>
      </div>
    );
  }

  // ----- Main view -----
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SiteHeader />
      <ResultsOnboardingOverlay ready={session?.status === "ready" && questions.length > 0} />
      <main className="container-tight flex-1 py-8 md:py-10">
        <Link
          to="/dashboard"
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-6"
        >
          <ArrowLeft className="h-3 w-3" /> Back to dashboard
        </Link>

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-10">
          <div>
            <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground mb-2">
              Interview pack
            </div>
            <h1 className="font-display text-3xl md:text-4xl font-semibold leading-tight">
              {session?.title}
            </h1>
            <div className="mt-4 max-w-md">
              <div className="flex items-baseline justify-between mb-1.5">
                <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Progress</div>
                <div className="text-xs tabular-nums">
                  <span className="font-display text-foreground font-medium">{practisedCount}</span>
                  <span className="text-muted-foreground"> / {questions.length} practised</span>
                </div>
              </div>
              <div className="h-1 w-full bg-secondary overflow-hidden rounded-sm">
                <div
                  className="h-full bg-accent transition-all duration-500"
                  style={{ width: `${questions.length ? (practisedCount / questions.length) * 100 : 0}%` }}
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>{questions.length} {questions.length === 1 ? "question" : "questions"}</span>
                <span>·</span>
                <span className="inline-flex items-center gap-1">
                  <Star className={`h-3 w-3 ${starredCount > 0 ? "fill-accent text-accent" : ""}`} /> {starredCount} starred
                </span>
              </div>
            </div>

          </div>
          <div className="flex gap-2">
          <Link to={`/prep/${id}/practice`}>
            <Button className="gap-2">Practice mode</Button>
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Download className="h-4 w-4" /> Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => (plan === "free" ? nav("/upgrade") : void exportPDF())}
              >
                <FileText className="h-4 w-4 mr-2" /> Download PDF
                {plan === "free" && <Lock className="h-3 w-3 ml-auto text-muted-foreground" />}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => (plan === "free" ? nav("/upgrade") : void exportDOCX())}
              >
                <FileType className="h-4 w-4 mr-2" /> Download DOCX
                {plan === "free" && <Lock className="h-3 w-3 ml-auto text-muted-foreground" />}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          </div>
        </div>

        {/* At-a-glance strip */}
        <div className="grid md:grid-cols-3 gap-px bg-border mb-12 border border-border">
          <SummaryCard
            label="Candidate"
            heading={session?.full_name || "Profile"}
            body={null}
            footnote={session?.candidate_current_role ?? undefined}
          />
          <SummaryCard
            label="Target role"
            heading={session?.target_role || "Role"}
            body={null}
            footnote={session?.company_name ?? undefined}
          />
          <SummaryCard
            label="Pack progress"
            heading={`${practisedCount} / ${questions.length}`}
            body={null}
            footnote={`${questions.length ? Math.round((practisedCount / questions.length) * 100) : 0}% practised · ${starredCount} starred`}
          />
        </div>

        {/* Candidate Insight Summary */}
        {session?.candidate_summary && (
          <EditorialSection
            eyebrow="Candidate insight summary"
            icon={<Sparkles className="h-4 w-4" strokeWidth={1.5} />}
            title="How an interviewer will read your profile"
          >
            <p className="text-[15px] leading-relaxed text-foreground/90">
              {session.candidate_summary}
            </p>
          </EditorialSection>
        )}

        {/* What this interview will likely test */}
        {(session?.role_summary || (Array.isArray(session?.top_themes) && session!.top_themes.length > 0)) && (
          <EditorialSection
            eyebrow="What this interview will likely test"
            icon={<Target className="h-4 w-4" strokeWidth={1.5} />}
            title="The lens the panel will bring into the room"
          >
            {session?.role_summary && (
              <p className="text-[15px] leading-relaxed text-foreground/90 mb-6">
                {session.role_summary}
              </p>
            )}
            {Array.isArray(session?.top_themes) && session!.top_themes.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-3">
                  Themes they will probe
                </div>
                <ul className="grid sm:grid-cols-2 gap-x-8 gap-y-2.5">
                  {(session!.top_themes as string[]).map((t, i) => (
                    <li key={i} className="flex gap-3 text-sm leading-relaxed">
                      <span className="font-display text-xs text-muted-foreground tabular-nums mt-0.5">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </EditorialSection>
        )}

        {/* Top Risks / Weak Spots */}
        {Array.isArray(session?.red_flags) && session!.red_flags.length > 0 && (
          <EditorialSection
            eyebrow="Top 5 risks & weak spots"
            icon={<AlertTriangle className="h-4 w-4 text-accent" strokeWidth={1.5} />}
            title="Where they will push hardest"
            accent
          >
            <ol className="space-y-4">
              {(session!.red_flags as string[]).slice(0, 5).map((r, i) => (
                <li key={i} className="flex gap-4 pb-4 border-b border-border last:border-b-0 last:pb-0">
                  <span className="font-display text-2xl font-semibold text-accent tabular-nums leading-none">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <p className="text-[15px] leading-relaxed text-foreground/90 pt-1">
                    {r}
                  </p>
                </li>
              ))}
            </ol>
          </EditorialSection>
        )}

        {/* Section divider into the question bank */}
        <div className="flex items-end justify-between mt-14 mb-6 pb-3 border-b border-border">
          <div>
            <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground mb-1">
              The question bank
            </div>
            <h2 className="font-display text-2xl font-semibold">
              {questions.length} tailored questions
            </h2>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search questions or themes…"
              className="pl-10"
            />
          </div>
          <div className="flex gap-3">
            <Select value={activeCat} onValueChange={setActiveCat}>
              <SelectTrigger className="md:w-44">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {prettyCategory(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={activeDiff} onValueChange={setActiveDiff}>
              <SelectTrigger className="md:w-44">
                <SelectValue placeholder="Difficulty" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All difficulties</SelectItem>
                {difficulties.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant={showStarred ? "default" : "outline"}
              size="icon"
              onClick={() => setShowStarred((v) => !v)}
              title="Show starred only"
            >
              <Star
                className={`h-4 w-4 ${showStarred ? "fill-current" : ""}`}
              />
            </Button>
          </div>
        </div>

        <div className="text-xs text-muted-foreground mb-3 flex items-center gap-2">
          <SlidersHorizontal className="h-3 w-3" />
          Showing {filtered.length} of {questions.length} {questions.length === 1 ? "question" : "questions"}
        </div>

        {/* Questions */}
        {filtered.length === 0 ? (
          <div className="border border-border py-16 text-center">
            <p className="text-sm text-muted-foreground">
              No questions match your filters.
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="mt-3"
              onClick={() => {
                setSearch("");
                setActiveCat("all");
                setActiveDiff("all");
                setShowStarred(false);
              }}
            >
              Reset filters
            </Button>
          </div>
        ) : (
          <>
            {(() => {
              const visible = filtered.filter((q) => q.position <= questionLimit);
              const GROUP = 7;
              const groups: Question[][] = [];
              for (let i = 0; i < visible.length; i += GROUP) {
                groups.push(visible.slice(i, i + GROUP));
              }
              return groups.map((group, gi) => (
                <div key={gi}>
                  {gi > 0 && <ReinforcementBanner index={gi} />}
                  <Accordion type="multiple" className="border border-border">
                    {group.map((q) => (
                      <AccordionItem
                        key={q.id}
                        value={q.id}
                        className="border-b border-border last:border-b-0"
                      >
                        <AccordionTrigger className="hover:no-underline px-4 md:px-6 py-5 text-left group">
                          <div className="flex items-start gap-4 md:gap-5 w-full">
                            <span className="font-display text-sm text-muted-foreground tabular-nums mt-0.5 w-10 shrink-0">
                              {String(q.position).padStart(3, "0")}
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-2">
                                <span className="text-[10px] uppercase tracking-[0.18em] text-accent font-medium">
                                  {prettyCategory(q.category)}
                                </span>
                                {q.difficulty && (
                                  <span className={`text-[10px] uppercase tracking-[0.15em] border px-1.5 py-0.5 rounded-sm ${DIFFICULTY_TONE[q.difficulty] ?? "border-border text-muted-foreground"}`}>
                                    {q.difficulty}
                                  </span>
                                )}
                                {q.practised && (
                                  <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground inline-flex items-center gap-1">
                                    <CheckCircle2 className="h-3 w-3" /> Practised
                                  </span>
                                )}
                                {q.user_answer && q.user_answer.trim().length > 0 && (
                                  <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground inline-flex items-center gap-1">
                                    <Pencil className="h-3 w-3" /> Your answer
                                  </span>
                                )}
                                {q.coach_insight && (q.coach_insight.really_testing || q.coach_insight.common_mistake || q.coach_insight.how_to_approach) && (
                                  <span className="text-[10px] uppercase tracking-[0.15em] text-accent inline-flex items-center gap-1 border border-accent/40 px-1.5 py-0.5 rounded-sm">
                                    <Compass className="h-3 w-3" /> Coach Insight
                                  </span>
                                )}
                              </div>
                              <div className="text-[15px] md:text-base font-medium leading-snug text-foreground pr-2">
                                {q.question}
                              </div>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleStar(q);
                              }}
                              className="shrink-0 p-1"
                              aria-label="Star"
                            >
                              <Star
                                className={`h-4 w-4 ${
                                  q.starred
                                    ? "fill-accent text-accent"
                                    : "text-muted-foreground"
                                }`}
                              />
                            </button>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="px-4 md:px-6 pb-6">
                          <div className="md:ml-14 space-y-3 text-sm">
                            {q.coach_insight && (q.coach_insight.really_testing || q.coach_insight.common_mistake || q.coach_insight.how_to_approach) && (
                              <CoachInsightBlock insight={q.coach_insight} />
                            )}
                            {q.why_matters && (
                              <Block
                                label="Why this matters"
                                body={q.why_matters}
                                icon={<HelpCircle className="h-3.5 w-3.5" strokeWidth={1.5} />}
                                tone="muted"
                              />
                            )}
                            {q.what_good_covers && (
                              <Block
                                label="What good answers cover"
                                body={q.what_good_covers}
                                icon={<ListChecks className="h-3.5 w-3.5" strokeWidth={1.5} />}
                                tone="strong"
                              />
                            )}
                            {q.answer_framework && (
                              <Block
                                label="Answer framework"
                                body={q.answer_framework}
                                icon={<Lightbulb className="h-3.5 w-3.5" strokeWidth={1.5} />}
                                tone="muted"
                              />
                            )}
                            {q.answer_direction && (q.answer_direction.structure || q.answer_direction.length || (q.answer_direction.avoid && q.answer_direction.avoid.length > 0)) && (
                              <AnswerDirectionBlock direction={q.answer_direction} />
                            )}

                            {q.example_answers && (q.example_answers.foundation || q.example_answers.strong || q.example_answers.standout) && (
                              <ExampleAnswersBlock examples={q.example_answers} />
                            )}

                            <UserAnswerBlock
                              q={q}
                              draft={answerDrafts[q.id] ?? q.user_answer ?? ""}
                              onChange={(val) =>
                                setAnswerDrafts((d) => ({ ...d, [q.id]: val }))
                              }
                              saving={savingAnswerId === q.id}
                              saved={savedAnswerId === q.id}
                              onPractise={() => {
                                const payload = {
                                  question_id: q.id,
                                  session_id: id,
                                  question: q.question,
                                  user_answer: answerDrafts[q.id] ?? q.user_answer ?? "",
                                };
                                try {
                                  sessionStorage.setItem(
                                    "tsc.pendingPracticePayload",
                                    JSON.stringify(payload)
                                  );
                                } catch {}
                                nav("/practise-delivery", { state: payload });
                              }}
                            />

                            {q.follow_up && (
                              <Block
                                label="Likely follow-up"
                                body={q.follow_up}
                                icon={<CornerDownRight className="h-3.5 w-3.5" strokeWidth={1.5} />}
                                tone="accent"
                              />
                            )}

                            <div className="pt-2">
                              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1.5">
                                <StickyNote className="h-3 w-3" /> Your note
                              </div>
                              <Textarea
                                value={noteDrafts[q.id] ?? q.note ?? ""}
                                onChange={(e) =>
                                  setNoteDrafts((d) => ({
                                    ...d,
                                    [q.id]: e.target.value,
                                  }))
                                }
                                placeholder="Sketch your answer, key examples, or numbers to remember…"
                                rows={3}
                              />
                              <div className="mt-2 flex flex-wrap gap-2">
                                <Button size="sm" onClick={() => saveNote(q)}>
                                  Save note
                                </Button>
                                <Button
                                  size="sm"
                                  variant={q.practised ? "default" : "outline"}
                                  onClick={() => togglePractised(q)}
                                  className="gap-1.5"
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  {q.practised ? "Practised" : "Mark as practised"}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => toggleStar(q)}
                                  className="gap-1.5"
                                >
                                  <Star
                                    className={`h-3.5 w-3.5 ${
                                      q.starred ? "fill-accent text-accent" : ""
                                    }`}
                                  />
                                  {q.starred ? "Starred" : "Star"}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => copyQuestion(q)}
                                  className="gap-1.5"
                                >
                                  <Copy className="h-3.5 w-3.5" /> Copy
                                </Button>
                              </div>
                            </div>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                  {gi < groups.length - 1 && <div className="h-4" />}
                </div>
              ));
            })()}

            {plan === "free" && (() => {
              const locked = filtered.filter((q) => q.position > questionLimit);
              if (locked.length === 0) return null;
              if (id) trackOnce("upgrade_prompt_seen", `results:${id}`, { plan, sessionId: id, metadata: { surface: "results_locked_questions" } });
              const preview = locked.slice(0, 6);
              return (
                <div className="relative mt-6">
                  <div className="border border-border bg-background pointer-events-none select-none" aria-hidden="true">
                    {preview.map((q) => (
                      <div key={q.id} className="px-4 md:px-6 py-5 border-b border-border last:border-b-0">
                        <div className="flex items-start gap-4 md:gap-5">
                          <span className="font-display text-sm text-muted-foreground tabular-nums mt-0.5 w-10 shrink-0">
                            {String(q.position).padStart(3, "0")}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="text-[10px] uppercase tracking-[0.18em] text-accent font-medium mb-2">
                              {prettyCategory(q.category)}
                            </div>
                            <div className="text-[15px] md:text-base font-medium leading-snug text-foreground/80 blur-sm">
                              {q.question}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/85 to-background flex items-end justify-center p-6">
                    <div className="text-center max-w-md w-full bg-background border border-accent/30 p-6 md:p-8 shadow-sm">
                      <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-accent mb-2">
                        <Lock className="h-3.5 w-3.5" /> Locked on Free
                      </div>
                      {introEligible ? (
                        <>
                          <h3 className="font-display text-xl md:text-2xl font-semibold leading-tight">
                            {copy.upgrade.intro.wallTitle}
                          </h3>
                          <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
                            {copy.upgrade.intro.wallBody}
                          </p>
                          <Link
                            to="/upgrade?offer=intro"
                            className="inline-block mt-5 w-full"
                            onClick={() =>
                              track("upgrade_clicked", {
                                plan,
                                sessionId: id ?? null,
                                metadata: {
                                  surface: "results_locked_questions",
                                  intro_offer: true,
                                },
                              })
                            }
                          >
                            <Button className="w-full bg-accent hover:bg-accent/90 text-accent-foreground gap-2">
                              <Sparkles className="h-4 w-4" /> {copy.upgrade.intro.buttonCta}
                            </Button>
                          </Link>
                          <p className="mt-3 text-xs text-muted-foreground">
                            {copy.upgrade.intro.smallPrint}
                          </p>
                        </>
                      ) : (
                        <>
                          <h3 className="font-display text-xl md:text-2xl font-semibold leading-tight">
                            {locked.length} more {locked.length === 1 ? "question is" : "questions are"} waiting
                          </h3>
                          <p className="mt-2 text-sm text-muted-foreground">
                            You're seeing the first {questionLimit} of your tailored pack. Upgrade to Pro to unlock the full set, plus PDF and DOCX export.
                          </p>
                          <Link
                            to="/upgrade"
                            className="inline-block mt-5 w-full"
                            onClick={() => track("upgrade_clicked", { plan, sessionId: id ?? null, metadata: { surface: "results_locked_questions" } })}
                          >
                            <Button className="w-full bg-accent hover:bg-accent/90 text-accent-foreground gap-2">
                              <Sparkles className="h-4 w-4" /> Upgrade to unlock all {questions.length} questions
                            </Button>
                          </Link>
                          <SoftUrgencyNote
                            className="mt-5"
                            align="center"
                            reminder="No rush — pick this back up whenever you're ready."
                          />
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}
          </>
        )}
        <footer className="mt-16 border-t border-border pt-6 pb-2 text-xs text-muted-foreground space-y-1">
          <p>Prepared for: <span className="text-foreground/80">{candidateName || "—"}</span></p>
          <p>Account: <span className="text-foreground/80">{user?.email ?? "—"}</span></p>
          <p>Generated by Interview Prep Pal by The Speech Coach</p>
          <p>Not for resale or redistribution.</p>
        </footer>
      </main>
    </div>
  );
};

const SummaryCard = ({
  label,
  heading,
  body,
  chips,
  footnote,
}: {
  label: string;
  heading?: string;
  body?: string | null;
  chips?: string[];
  footnote?: string;
}) => (
  <div className="bg-background p-6">
    <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-3">
      {label}
    </div>
    {heading && (
      <div className="font-display text-lg font-medium leading-tight mb-1">{heading}</div>
    )}
    {footnote && (
      <div className="text-xs text-muted-foreground">{footnote}</div>
    )}
    {body && (
      <div className="text-sm leading-relaxed text-muted-foreground mt-2">{body}</div>
    )}
    {chips && chips.length > 0 && (
      <div className="flex flex-wrap gap-1.5 mt-2">
        {chips.map((c) => (
          <Badge key={c} variant="secondary" className="text-[10px]">
            {c}
          </Badge>
        ))}
      </div>
    )}
  </div>
);

const EditorialSection = ({
  eyebrow,
  title,
  icon,
  accent = false,
  children,
}: {
  eyebrow: string;
  title: string;
  icon?: React.ReactNode;
  accent?: boolean;
  children: React.ReactNode;
}) => (
  <section
    className={`relative mb-10 border ${accent ? "border-accent/30" : "border-border"} bg-background`}
  >
    <div className={`absolute left-0 top-0 bottom-0 w-px ${accent ? "bg-accent" : "bg-foreground"}`} />
    <div className="px-6 md:px-8 py-7 md:py-8">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-2">
        {icon}
        <span>{eyebrow}</span>
      </div>
      <h2 className="font-display text-xl md:text-2xl font-semibold leading-tight mb-5 text-balance">
        {title}
      </h2>
      {children}
    </div>
  </section>
);

const TONE_STYLES: Record<string, string> = {
  muted: "border-border bg-secondary/40",
  strong: "border-foreground/20 bg-background",
  accent: "border-accent/30 bg-accent/5",
};

const Block = ({
  label,
  body,
  icon,
  tone = "muted",
}: {
  label: string;
  body: string;
  icon?: React.ReactNode;
  tone?: "muted" | "strong" | "accent";
}) => (
  <div className={`border-l-2 ${TONE_STYLES[tone]} pl-4 pr-4 py-3 rounded-r-sm`}>
    <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-1.5 inline-flex items-center gap-1.5">
      {icon}
      <span>{label}</span>
    </div>
    <p className={`text-sm leading-relaxed ${tone === "strong" ? "text-foreground font-medium" : "text-foreground/85"}`}>
      {body}
    </p>
  </div>
);


const CoachInsightBlock = ({ insight }: { insight: CoachInsight }) => (
  <div className="border border-accent/40 bg-accent/[0.04] rounded-sm overflow-hidden">
    <div className="px-4 py-2.5 border-b border-accent/30 bg-accent/[0.06] flex items-center gap-2">
      <Compass className="h-3.5 w-3.5 text-accent" strokeWidth={1.75} />
      <span className="text-[10px] uppercase tracking-[0.22em] font-medium text-accent">Coach Insight</span>
    </div>
    <div className="px-4 py-3 space-y-2 text-sm leading-relaxed">
      {insight.really_testing && (
        <div>
          <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mr-2">Really testing</span>
          <span className="text-foreground/90">{insight.really_testing}</span>
        </div>
      )}
      {insight.common_mistake && (
        <div>
          <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mr-2">Common mistake</span>
          <span className="text-foreground/90">{insight.common_mistake}</span>
        </div>
      )}
      {insight.how_to_approach && (
        <div>
          <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mr-2">How to approach</span>
          <span className="text-foreground/90">{insight.how_to_approach}</span>
        </div>
      )}
    </div>
  </div>
);


const AnswerDirectionBlock = ({ direction }: { direction: AnswerDirection }) => (
  <div className="border border-foreground/15 bg-foreground/[0.02] rounded-sm overflow-hidden">
    <div className="px-4 py-2.5 border-b border-foreground/10 bg-foreground/[0.03] flex items-center gap-2">
      <Compass className="h-3.5 w-3.5 text-accent" strokeWidth={1.5} />
      <span className="text-[10px] uppercase tracking-[0.2em] font-medium">Answer direction</span>
    </div>
    <div className="px-4 py-3 space-y-3">
      {direction.structure && (
        <div className="flex gap-3">
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground w-20 shrink-0 pt-0.5">
            Shape
          </div>
          <p className="text-sm leading-relaxed text-foreground/90 flex-1">
            {direction.structure}
          </p>
        </div>
      )}
      {direction.length && (
        <div className="flex gap-3">
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground w-20 shrink-0 pt-0.5 inline-flex items-center gap-1">
            <Timer className="h-3 w-3" strokeWidth={1.5} /> Length
          </div>
          <p className="text-sm leading-relaxed text-foreground/90 flex-1">
            {direction.length}
          </p>
        </div>
      )}
      {direction.avoid && direction.avoid.length > 0 && (
        <div className="flex gap-3">
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground w-20 shrink-0 pt-0.5 inline-flex items-center gap-1">
            <XCircle className="h-3 w-3 text-accent" strokeWidth={1.5} /> Avoid
          </div>
          <ul className="flex-1 flex flex-wrap gap-1.5">
            {direction.avoid.map((a, i) => (
              <li
                key={i}
                className="text-xs leading-snug border border-accent/30 text-foreground/85 bg-accent/5 px-2 py-1 rounded-sm"
              >
                {a}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  </div>
);

const TIER_META: { key: keyof ExampleAnswers; label: string; blurb: string }[] = [
  { key: "foundation", label: "Foundation", blurb: "Clear, simple, direct." },
  { key: "strong", label: "Strong", blurb: "Structured, confident, commercially aware." },
  { key: "standout", label: "Standout", blurb: "20–30 seconds. Sharp, controlled, intentional." },
];

const ExampleAnswersBlock = ({ examples }: { examples: ExampleAnswers }) => {
  const [open, setOpen] = useState<string | null>("strong");
  return (
    <div className="border border-foreground/15 bg-background rounded-sm overflow-hidden">
      <div className="px-4 py-2.5 border-b border-foreground/10 bg-foreground/[0.03] flex items-center gap-2">
        <Quote className="h-3.5 w-3.5 text-accent" strokeWidth={1.5} />
        <span className="text-[10px] uppercase tracking-[0.2em] font-medium">Answer examples</span>
        <span className="text-[10px] text-muted-foreground ml-auto">Spoken, not written</span>
      </div>
      <div className="divide-y divide-foreground/10">
        {TIER_META.map((tier) => {
          const body = examples[tier.key];
          if (!body) return null;
          const isOpen = open === tier.key;
          return (
            <Collapsible
              key={tier.key}
              open={isOpen}
              onOpenChange={(v) => setOpen(v ? tier.key : null)}
            >
              <CollapsibleTrigger className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-foreground/[0.02] transition-colors">
                <span className="font-display text-sm font-medium">{tier.label}</span>
                <span className="text-xs text-muted-foreground hidden sm:inline">{tier.blurb}</span>
                <ChevronDown
                  className={`h-3.5 w-3.5 ml-auto text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
                  strokeWidth={1.5}
                />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="px-4 pb-4 -mt-1">
                  <div className="border-l-2 border-accent/40 pl-4 py-1">
                    <p className="text-sm leading-relaxed text-foreground/90 italic">
                      “{body}”
                    </p>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>
    </div>
  );
};

const UserAnswerBlock = ({
  q,
  draft,
  onChange,
  saving,
  saved,
  onPractise,
}: {
  q: Question;
  draft: string;
  onChange: (val: string) => void;
  saving: boolean;
  saved: boolean;
  onPractise: () => void;
}) => (
  <div className="border border-accent/30 bg-accent/[0.04] rounded-sm overflow-hidden">
    <div className="px-4 py-2.5 border-b border-accent/20 bg-accent/[0.06] flex items-center gap-2">
      <Pencil className="h-3.5 w-3.5 text-accent" strokeWidth={1.5} />
      <span className="text-[10px] uppercase tracking-[0.2em] font-medium">Your answer</span>
      <span className="text-[10px] text-muted-foreground ml-auto">
        {saving ? "Saving…" : saved ? "Saved" : "Autosaves as you type"}
      </span>
    </div>
    <div className="p-4 space-y-3">
      <p className="text-xs text-foreground/75 italic">
        {AUTHENTICITY_PROMPT}
      </p>
      <Textarea
        value={draft}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Strip it back. Make it sound like you'd actually say it…"
        rows={4}
        className="bg-background"
      />
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={onPractise}
          className="gap-1.5 bg-accent hover:bg-accent/90 text-accent-foreground"
        >
          <Mic className="h-3.5 w-3.5" /> Practise delivery
        </Button>
        <span className="text-[11px] text-muted-foreground self-center">
          Take it into the Speech Coach app and rehearse out loud.
        </span>
      </div>
    </div>
  </div>
);

const REINFORCEMENT_LINES = [
  "You don't get hired for memorising answers. You get hired for how you deliver them. Write the next ones in your own language.",
  "Read the examples, then close them. Say it the way you'd say it in the room.",
  "Models are scaffolding, not scripts. Strip them back until they sound like you.",
  "Delivery beats wording. Keep it spoken, keep it short, keep it yours.",
];

const ReinforcementBanner = ({ index }: { index: number }) => {
  const line = REINFORCEMENT_LINES[(index - 1) % REINFORCEMENT_LINES.length];
  return (
    <div className="my-6 border-l-2 border-accent bg-accent/[0.04] px-5 py-4 flex gap-3 items-start">
      <Mic className="h-4 w-4 text-accent mt-0.5 shrink-0" strokeWidth={1.5} />
      <div>
        <div className="text-[10px] uppercase tracking-[0.22em] text-accent font-medium mb-1">
          A quick reminder
        </div>
        <p className="text-sm leading-relaxed text-foreground/90">{line}</p>
      </div>
    </div>
  );
};

export default Results;
