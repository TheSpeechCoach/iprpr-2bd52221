import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePlan } from "@/hooks/usePlan";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  ArrowRight,
  Shuffle,
  Play,
  Pause,
  RotateCcw,
  CheckCircle2,
  Star,
  Timer as TimerIcon,
  Sparkles,
  Lock,
  Loader2,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface Question {
  id: string;
  position: number;
  category: string;
  question: string;
  why_matters: string | null;
  what_good_covers: string | null;
  follow_up: string | null;
  difficulty: string | null;
  starred: boolean;
  practised: boolean;
}

interface Session {
  id: string;
  title: string;
  status: string;
}

interface SavedAnswer {
  id: string;
  question_id: string;
  answer_text: string;
}

interface AnswerScore {
  id: string;
  question_id: string;
  overall_score: number | null;
  clarity_score: number | null;
  structure_score: number | null;
  relevance_score: number | null;
  evidence_score: number | null;
  concision_score: number | null;
  authenticity_score: number | null;
  interview_impact_score: number | null;
  feedback_json: {
    what_works?: string;
    needs_improving?: string;
    what_to_remove?: string;
    make_more_specific?: string;
    stronger_version?: string;
  } | null;
  created_at: string;
}

type PracticeMode = "category" | "random_in_category" | "random_all";

const TIMER_OPTIONS: { label: string; value: number }[] = [
  { label: "Off", value: 0 },
  { label: "30s", value: 30 },
  { label: "60s", value: 60 },
  { label: "90s", value: 90 },
  { label: "2m", value: 120 },
];

const COUNT_OPTIONS = [5, 10, 20, 0]; // 0 = all

const formatTime = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
};

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const Practice = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const { plan } = usePlan();
  const [params, setParams] = useSearchParams();

  const [session, setSession] = useState<Session | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [savedMap, setSavedMap] = useState<Record<string, SavedAnswer>>({});
  const [scoresMap, setScoresMap] = useState<Record<string, AnswerScore>>({});
  const [loading, setLoading] = useState(true);

  // Setup screen state
  const [started, setStarted] = useState(false);
  const [mode, setMode] = useState<PracticeMode>("category");
  const [setupCategory, setSetupCategory] = useState<string>("all");
  const [setupCount, setSetupCount] = useState<number>(10);
  const [setupTimer, setSetupTimer] = useState<number>(60);

  // Practice run state
  const [orderedIds, setOrderedIds] = useState<string[]>([]);
  const [practiceSessionId, setPracticeSessionId] = useState<string | null>(null);
  const [index, setIndex] = useState(0);

  const [answer, setAnswer] = useState("");
  const [selfRating, setSelfRating] = useState<number | null>(null);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [scoring, setScoring] = useState(false);
  const [savingAnswer, setSavingAnswer] = useState(false);
  const autosaveTimerRef = useRef<number | null>(null);

  // Timer
  const [duration, setDuration] = useState(60);
  const [remaining, setRemaining] = useState(60);
  const [running, setRunning] = useState(false);
  const startedAtRef = useRef<number | null>(null);
  const elapsedRef = useRef(0);

  const isCoachPlus = plan === "coach_plus";

  useEffect(() => {
    if (!id || !user) return;
    let cancelled = false;
    (async () => {
      const [{ data: s }, { data: qs }, { data: sa }, { data: sc }] = await Promise.all([
        supabase.from("prep_sessions").select("id, title, status").eq("id", id).maybeSingle(),
        supabase
          .from("interview_questions")
          .select(
            "id, position, category, question, why_matters, what_good_covers, follow_up, difficulty, starred, practised"
          )
          .eq("session_id", id)
          .order("position"),
        supabase
          .from("saved_answers")
          .select("id, question_id, answer_text")
          .eq("user_id", user.id)
          .eq("prep_session_id", id),
        supabase
          .from("answer_scores")
          .select(
            "id, question_id, overall_score, clarity_score, structure_score, relevance_score, evidence_score, concision_score, authenticity_score, interview_impact_score, feedback_json, created_at"
          )
          .eq("user_id", user.id)
          .eq("prep_session_id", id)
          .order("created_at", { ascending: false }),
      ]);
      if (cancelled) return;
      setSession(s as Session);
      setQuestions((qs ?? []) as Question[]);
      const sm: Record<string, SavedAnswer> = {};
      (sa ?? []).forEach((row: any) => (sm[row.question_id] = row));
      setSavedMap(sm);
      const cm: Record<string, AnswerScore> = {};
      // first row per question wins (newest)
      (sc ?? []).forEach((row: any) => {
        if (!cm[row.question_id]) cm[row.question_id] = row;
      });
      setScoresMap(cm);
      setLoading(false);

      // If URL has ?run=1, allow auto-start with current settings
      if (params.get("run") === "1") setStarted(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [id, user]);

  const categories = useMemo(
    () => Array.from(new Set(questions.map((q) => q.category))).sort(),
    [questions]
  );

  // Build the practice queue for the run
  const queue: Question[] = useMemo(() => {
    if (!started) return [];
    return orderedIds
      .map((qid) => questions.find((q) => q.id === qid))
      .filter(Boolean) as Question[];
  }, [started, orderedIds, questions]);

  const safeIndex = Math.min(index, Math.max(queue.length - 1, 0));
  const current = queue[safeIndex];

  // Load answer + reset per-question state when current changes
  useEffect(() => {
    if (!current) return;
    const existing = savedMap[current.id]?.answer_text ?? "";
    setAnswer(existing);
    setSelfRating(null);
    setConfidence(null);
    elapsedRef.current = 0;
    setRemaining(duration);
    setRunning(false);
    startedAtRef.current = null;
    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  // Timer tick (only when timer is enabled, duration > 0)
  useEffect(() => {
    if (!running || duration === 0) return;
    const t = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          setRunning(false);
          toast({ title: "Time's up" });
          return 0;
        }
        return r - 1;
      });
      elapsedRef.current += 1;
    }, 1000);
    return () => clearInterval(t);
  }, [running, duration]);

  const startTimer = () => {
    if (duration === 0) return;
    if (!running) {
      if (startedAtRef.current === null) startedAtRef.current = Date.now();
      setRunning(true);
    }
  };
  const pauseTimer = () => setRunning(false);
  const resetTimer = () => {
    setRunning(false);
    setRemaining(duration);
    elapsedRef.current = 0;
    startedAtRef.current = null;
  };

  const goTo = (i: number) => {
    if (queue.length === 0) return;
    const next = (i + queue.length) % queue.length;
    setIndex(next);
  };
  const prev = () => goTo(safeIndex - 1);
  const next = () => goTo(safeIndex + 1);

  // ---------- Setup → Start practice ----------
  const buildOrderedIds = (): string[] => {
    let pool = questions;
    if (mode === "random_in_category" || (mode === "category" && setupCategory !== "all")) {
      pool = pool.filter((q) => q.category === setupCategory);
    }
    if (mode === "category" && setupCategory === "all") {
      // grouped by category, preserve internal position order
      pool = [...pool].sort((a, b) => {
        if (a.category === b.category) return a.position - b.position;
        return a.category.localeCompare(b.category);
      });
    } else if (mode === "category") {
      pool = [...pool].sort((a, b) => a.position - b.position);
    } else {
      // random_in_category or random_all
      pool = shuffle(pool);
    }
    const limit = setupCount > 0 ? setupCount : pool.length;
    return pool.slice(0, limit).map((q) => q.id);
  };

  const startPractice = async () => {
    const ids = buildOrderedIds();
    if (ids.length === 0) {
      toast({ title: "No questions match that selection", variant: "destructive" });
      return;
    }
    setOrderedIds(ids);
    setIndex(0);
    setDuration(setupTimer);
    setRemaining(setupTimer);
    setStarted(true);

    // Persist practice session row (best-effort)
    if (user && id) {
      const { data, error } = await supabase
        .from("practice_sessions")
        .insert({
          user_id: user.id,
          prep_session_id: id,
          mode,
          selected_category: setupCategory === "all" ? null : setupCategory,
          question_order: ids,
          timer_seconds: setupTimer || null,
        })
        .select("id")
        .single();
      if (!error && data) setPracticeSessionId(data.id);
    }
  };

  const restartShuffled = () => {
    const ids = shuffle(orderedIds);
    setOrderedIds(ids);
    setIndex(0);
  };

  const exitPractice = async () => {
    if (practiceSessionId) {
      await supabase
        .from("practice_sessions")
        .update({ completed_at: new Date().toISOString() })
        .eq("id", practiceSessionId);
    }
    setStarted(false);
    setPracticeSessionId(null);
  };

  // ---------- Saved answer (autosave) ----------
  const persistAnswer = async (text: string): Promise<SavedAnswer | null> => {
    if (!user || !current || !id) return null;
    setSavingAnswer(true);
    const existing = savedMap[current.id];
    if (existing) {
      const { data, error } = await supabase
        .from("saved_answers")
        .update({ answer_text: text })
        .eq("id", existing.id)
        .select("id, question_id, answer_text")
        .single();
      setSavingAnswer(false);
      if (error) {
        toast({ title: "Couldn't save answer", variant: "destructive" });
        return null;
      }
      setSavedMap((m) => ({ ...m, [current.id]: data as SavedAnswer }));
      return data as SavedAnswer;
    }
    const { data, error } = await supabase
      .from("saved_answers")
      .insert({
        user_id: user.id,
        prep_session_id: id,
        question_id: current.id,
        practice_session_id: practiceSessionId,
        answer_text: text,
      })
      .select("id, question_id, answer_text")
      .single();
    setSavingAnswer(false);
    if (error) {
      toast({ title: "Couldn't save answer", variant: "destructive" });
      return null;
    }
    setSavedMap((m) => ({ ...m, [current.id]: data as SavedAnswer }));
    return data as SavedAnswer;
  };

  const onAnswerChange = (val: string) => {
    setAnswer(val);
    if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = window.setTimeout(() => {
      void persistAnswer(val);
    }, 1200);
  };

  const saveAttempt = async () => {
    if (!current || !user) return;
    if (answer.trim()) await persistAnswer(answer);
    const elapsed = elapsedRef.current;
    const { error } = await supabase.from("practice_attempts").insert({
      user_id: user.id,
      question_id: current.id,
      duration_seconds: elapsed > 0 ? elapsed : null,
      text_answer: answer || null,
      self_rating: selfRating,
      confidence: confidence,
    });
    if (error) {
      toast({ title: "Couldn't save attempt", variant: "destructive" });
      return;
    }
    if (!current.practised) {
      await supabase
        .from("interview_questions")
        .update({ practised: true })
        .eq("id", current.id);
      setQuestions((prev) =>
        prev.map((q) => (q.id === current.id ? { ...q, practised: true } : q))
      );
    }
    toast({ title: "Attempt saved" });
  };

  // ---------- Coach+ scoring ----------
  const scoreAnswer = async () => {
    if (!current || !id) return;
    if (!isCoachPlus) {
      toast({ title: "Answer scoring is available on Coach+." });
      return;
    }
    if (!answer || answer.trim().length < 10) {
      toast({ title: "Write a longer answer before scoring." });
      return;
    }
    setScoring(true);
    try {
      const saved = await persistAnswer(answer);
      if (!saved) {
        setScoring(false);
        return;
      }
      const { data, error } = await supabase.functions.invoke("score-answer", {
        body: {
          question_id: current.id,
          saved_answer_id: saved.id,
          prep_session_id: id,
        },
      });
      if (error) {
        const msg = (error as any)?.context?.error || error.message || "Scoring failed";
        toast({ title: msg, variant: "destructive" });
        return;
      }
      if (data?.error) {
        toast({ title: data.error, variant: "destructive" });
        return;
      }
      if (data?.score) {
        setScoresMap((m) => ({ ...m, [current.id]: data.score as AnswerScore }));
        toast({ title: "Coach feedback ready" });
      }
    } finally {
      setScoring(false);
    }
  };

  // ---------- Loading ----------
  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <SiteHeader />
        <main className="container-tight flex-1 py-10 space-y-6">
          <Skeleton className="h-8 w-1/2" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-32 w-full" />
        </main>
      </div>
    );
  }

  // ---------- Empty ----------
  if (!questions.length) {
    return (
      <div className="min-h-screen flex flex-col">
        <SiteHeader />
        <main className="container-tight flex-1 flex flex-col items-center justify-center py-24 text-center">
          <h1 className="font-display text-3xl font-semibold">Nothing to practise</h1>
          <p className="mt-2 text-muted-foreground max-w-md">
            This pack doesn't have any questions yet.
          </p>
          <Link to="/dashboard" className="mt-6">
            <Button variant="outline">Back to dashboard</Button>
          </Link>
        </main>
      </div>
    );
  }

  // ---------- Setup screen ----------
  if (!started) {
    const requiresCategory = mode === "random_in_category";
    const availableCategories = categories;
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <SiteHeader />
        <main className="container-tight flex-1 py-10">
          <Link
            to={`/prep/${id}/results`}
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-6"
          >
            <ArrowLeft className="h-3 w-3" /> Back to pack
          </Link>

          <div className="max-w-2xl">
            <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground mb-2">
              Practice mode
            </div>
            <h1 className="font-display text-3xl md:text-4xl font-semibold mb-2 truncate">
              {session?.title}
            </h1>
            <p className="text-muted-foreground mb-10">Choose how you want to practise.</p>

            <div className="space-y-8">
              <SetupGroup label="Practice order">
                <SetupChoices
                  value={mode}
                  onChange={(v) => setMode(v as PracticeMode)}
                  options={[
                    { label: "By category", value: "category" },
                    { label: "Random within category", value: "random_in_category" },
                    { label: "Random across all", value: "random_all" },
                  ]}
                />
              </SetupGroup>

              <SetupGroup
                label="Category"
                hint={requiresCategory ? "Required for random within category" : undefined}
              >
                <Select
                  value={setupCategory}
                  onValueChange={setSetupCategory}
                >
                  <SelectTrigger className="w-full md:w-72">
                    <SelectValue placeholder="Choose a category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All categories</SelectItem>
                    {availableCategories.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </SetupGroup>

              <SetupGroup label="Question count">
                <SetupChoices
                  value={String(setupCount)}
                  onChange={(v) => setSetupCount(Number(v))}
                  options={COUNT_OPTIONS.map((n) => ({
                    label: n === 0 ? "All" : String(n),
                    value: String(n),
                  }))}
                />
              </SetupGroup>

              <SetupGroup label="Timer">
                <SetupChoices
                  value={String(setupTimer)}
                  onChange={(v) => setSetupTimer(Number(v))}
                  options={TIMER_OPTIONS.map((t) => ({
                    label: t.label,
                    value: String(t.value),
                  }))}
                />
              </SetupGroup>
            </div>

            <div className="mt-10 flex items-center gap-3">
              <Button
                size="lg"
                onClick={startPractice}
                disabled={requiresCategory && setupCategory === "all"}
              >
                Start practice
              </Button>
              <span className="text-xs text-muted-foreground">
                {requiresCategory && setupCategory === "all"
                  ? "Pick a specific category to continue"
                  : "You can leave and resume anytime"}
              </span>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ---------- Practice run ----------
  const practisedCount = questions.filter((q) => q.practised).length;
  const overallProgress = queue.length
    ? ((safeIndex + 1) / queue.length) * 100
    : 0;
  const timerProgress =
    duration > 0 ? ((duration - remaining) / duration) * 100 : 0;

  const currentScore = current ? scoresMap[current.id] : null;
  const savedAnswerExists = current ? !!savedMap[current.id] : false;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SiteHeader />
      <main className="container-tight flex-1 py-6 md:py-10">
        <button
          onClick={exitPractice}
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-6"
        >
          <ArrowLeft className="h-3 w-3" /> End practice
        </button>

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground mb-2">
              Practice mode · {modeLabel(mode)}
              {setupCategory !== "all" && ` · ${setupCategory}`}
            </div>
            <h1 className="font-display text-2xl md:text-3xl font-semibold truncate">
              {session?.title}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={restartShuffled} className="gap-1.5">
              <RotateCcw className="h-3.5 w-3.5" /> Restart shuffled
            </Button>
          </div>
        </div>

        {/* Overall progress */}
        <div className="mb-6">
          <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
            <span>
              Question {safeIndex + 1} of {queue.length}
            </span>
            <span>
              {practisedCount}/{questions.length} practised overall
            </span>
          </div>
          <Progress value={overallProgress} className="h-1" />
        </div>

        <div className="grid lg:grid-cols-[1fr_320px] gap-6">
          {/* Question card */}
          <div className="space-y-6">
            <div className="border border-border bg-card p-6 md:p-8">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="secondary" className="text-[10px]">
                    {current?.category}
                  </Badge>
                  {current?.difficulty && (
                    <Badge variant="outline" className="text-[10px]">
                      {current.difficulty}
                    </Badge>
                  )}
                  {current?.practised && (
                    <Badge className="text-[10px] gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Practised
                    </Badge>
                  )}
                  {current?.starred && (
                    <Badge variant="outline" className="text-[10px] gap-1">
                      <Star className="h-3 w-3 fill-accent text-accent" />
                      Starred
                    </Badge>
                  )}
                </div>
                <span className="font-display text-xs text-muted-foreground shrink-0">
                  {String(current?.position ?? 0).padStart(3, "0")}
                </span>
              </div>

              <p className="font-display text-xl md:text-2xl leading-snug">
                {current?.question}
              </p>

              {(current?.why_matters || current?.what_good_covers) && (
                <div className="mt-6 space-y-3 border-t border-border pt-5 text-sm text-muted-foreground">
                  {current?.why_matters && (
                    <div>
                      <div className="text-[10px] uppercase tracking-widest mb-1">
                        Why this matters
                      </div>
                      <p>{current.why_matters}</p>
                    </div>
                  )}
                  {current?.what_good_covers && (
                    <div>
                      <div className="text-[10px] uppercase tracking-widest mb-1">
                        What good answers cover
                      </div>
                      <p>{current.what_good_covers}</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Answer notes */}
            <div>
              <div className="flex items-baseline justify-between mb-2">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  Write your answer in your own words
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {savingAnswer ? "Saving…" : savedAnswerExists ? "Saved" : "Autosaves as you type"}
                </div>
              </div>
              <Textarea
                value={answer}
                onChange={(e) => onAnswerChange(e.target.value)}
                placeholder="Don't copy the model answer. Write what you would actually say…"
                rows={7}
              />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => persistAnswer(answer)}
                  disabled={savingAnswer || !answer.trim()}
                >
                  Save answer
                </Button>

                {isCoachPlus ? (
                  <Button
                    size="sm"
                    onClick={scoreAnswer}
                    disabled={scoring || !answer.trim()}
                    className="gap-1.5"
                  >
                    {scoring ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" />
                    )}
                    Score my answer
                  </Button>
                ) : (
                  <Link to="/upgrade">
                    <Button size="sm" variant="outline" className="gap-1.5">
                      <Lock className="h-3.5 w-3.5" />
                      Score my answer
                    </Button>
                  </Link>
                )}
                {!isCoachPlus && (
                  <span className="text-[11px] text-muted-foreground">
                    Answer scoring is available on Coach+.
                  </span>
                )}
              </div>
            </div>

            {/* Coach feedback */}
            {currentScore && (
              <div className="border border-border bg-card p-6">
                <div className="flex items-baseline justify-between mb-4">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                    <Sparkles className="h-3 w-3" /> Coach feedback
                  </div>
                  <div className="font-display text-3xl font-semibold tabular-nums">
                    {currentScore.overall_score ?? "—"}
                    <span className="text-base text-muted-foreground">/10</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                  <ScoreChip label="Clarity" value={currentScore.clarity_score} />
                  <ScoreChip label="Structure" value={currentScore.structure_score} />
                  <ScoreChip label="Relevance" value={currentScore.relevance_score} />
                  <ScoreChip label="Evidence" value={currentScore.evidence_score} />
                  <ScoreChip label="Concision" value={currentScore.concision_score} />
                  <ScoreChip label="Authenticity" value={currentScore.authenticity_score} />
                  <ScoreChip
                    label="Interview impact"
                    value={currentScore.interview_impact_score}
                  />
                </div>

                {currentScore.feedback_json && (
                  <div className="space-y-4 text-sm">
                    <FeedbackBlock
                      label="What works"
                      body={currentScore.feedback_json.what_works}
                    />
                    <FeedbackBlock
                      label="What needs improving"
                      body={currentScore.feedback_json.needs_improving}
                    />
                    <FeedbackBlock
                      label="What to remove"
                      body={currentScore.feedback_json.what_to_remove}
                    />
                    <FeedbackBlock
                      label="Make more specific"
                      body={currentScore.feedback_json.make_more_specific}
                    />
                    <FeedbackBlock
                      label="Suggested stronger version"
                      body={currentScore.feedback_json.stronger_version}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Self ratings */}
            <div className="grid sm:grid-cols-2 gap-6">
              <RatingRow
                label="Self-rating"
                hint="How was that answer?"
                value={selfRating}
                onChange={setSelfRating}
              />
              <RatingRow
                label="Confidence"
                hint="How confident do you feel?"
                value={confidence}
                onChange={setConfidence}
              />
            </div>

            {/* Navigation */}
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <Button variant="outline" onClick={prev} className="gap-1.5">
                <ArrowLeft className="h-4 w-4" /> Previous
              </Button>
              <Button variant="outline" onClick={() => goTo(Math.floor(Math.random() * queue.length))} className="gap-1.5">
                <Shuffle className="h-4 w-4" /> Random
              </Button>
              <Button variant="outline" onClick={next} className="gap-1.5">
                Next <ArrowRight className="h-4 w-4" />
              </Button>
              <div className="flex-1" />
              <Button
                variant="ghost"
                onClick={saveAttempt}
                disabled={!answer && selfRating === null && confidence === null}
              >
                Save attempt
              </Button>
              <Button
                onClick={async () => {
                  await saveAttempt();
                  next();
                }}
              >
                Save & next
              </Button>
            </div>
          </div>

          {/* Timer sidebar */}
          <aside className="lg:sticky lg:top-6 self-start">
            {duration > 0 ? (
              <div className="border border-border bg-card p-6">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-1.5">
                  <TimerIcon className="h-3 w-3" /> Timer
                </div>
                <div
                  className={cn(
                    "font-display text-5xl font-semibold tabular-nums text-center my-2 transition-colors",
                    remaining === 0 && "text-destructive"
                  )}
                >
                  {formatTime(remaining)}
                </div>
                <Progress value={timerProgress} className="h-1 mb-5" />

                <div className="flex justify-center gap-2 mb-2">
                  {!running ? (
                    <Button onClick={startTimer} size="sm" className="gap-1.5">
                      <Play className="h-3.5 w-3.5" /> Start
                    </Button>
                  ) : (
                    <Button
                      onClick={pauseTimer}
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                    >
                      <Pause className="h-3.5 w-3.5" /> Pause
                    </Button>
                  )}
                  <Button
                    onClick={resetTimer}
                    size="sm"
                    variant="ghost"
                    className="gap-1.5"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Reset
                  </Button>
                </div>
              </div>
            ) : (
              <div className="border border-border bg-card p-6 text-sm text-muted-foreground">
                Timer is off for this run.
              </div>
            )}

            <div className="mt-4 text-[11px] text-muted-foreground leading-relaxed">
              Practise out loud. Use the timer like a real interview, then capture
              what you'd refine.
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
};

// ---------- Setup helpers ----------
const SetupGroup = ({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) => (
  <div>
    <div className="flex items-baseline justify-between mb-2">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
    </div>
    {children}
  </div>
);

const SetupChoices = ({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { label: string; value: string }[];
}) => (
  <div className="flex flex-wrap gap-2">
    {options.map((opt) => (
      <button
        key={opt.value}
        type="button"
        onClick={() => onChange(opt.value)}
        className={cn(
          "px-3 py-2 text-sm border transition-colors",
          value === opt.value
            ? "border-foreground bg-foreground text-background"
            : "border-border hover:bg-secondary"
        )}
      >
        {opt.label}
      </button>
    ))}
  </div>
);

const ScoreChip = ({ label, value }: { label: string; value: number | null }) => (
  <div className="border border-border p-2.5">
    <div className="text-[9px] uppercase tracking-widest text-muted-foreground mb-1">
      {label}
    </div>
    <div className="font-display text-lg tabular-nums">
      {value ?? "—"}
      <span className="text-xs text-muted-foreground">/10</span>
    </div>
  </div>
);

const FeedbackBlock = ({ label, body }: { label: string; body?: string }) => {
  if (!body) return null;
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
        {label}
      </div>
      <p className="leading-relaxed whitespace-pre-wrap">{body}</p>
    </div>
  );
};

const RatingRow = ({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: number | null;
  onChange: (v: number) => void;
}) => (
  <div>
    <div className="flex items-baseline justify-between mb-2">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className="text-[11px] text-muted-foreground">{hint}</div>
    </div>
    <div className="grid grid-cols-5 gap-1.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          onClick={() => onChange(n)}
          className={cn(
            "h-10 text-sm font-medium border transition-colors",
            value === n
              ? "border-foreground bg-foreground text-background"
              : "border-border hover:bg-secondary"
          )}
        >
          {n}
        </button>
      ))}
    </div>
  </div>
);

function modeLabel(m: PracticeMode): string {
  if (m === "category") return "By category";
  if (m === "random_in_category") return "Random within category";
  return "Random across all";
}

export default Practice;
