import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
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

const PRESETS = [60, 120, 180, 300];

const formatTime = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
};

const Practice = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();

  const [session, setSession] = useState<Session | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);

  const [category, setCategory] = useState<string>(params.get("cat") ?? "all");
  const [index, setIndex] = useState(0);

  const [answer, setAnswer] = useState("");
  const [selfRating, setSelfRating] = useState<number | null>(null);
  const [confidence, setConfidence] = useState<number | null>(null);

  // Timer
  const [duration, setDuration] = useState(120);
  const [remaining, setRemaining] = useState(120);
  const [running, setRunning] = useState(false);
  const startedAtRef = useRef<number | null>(null);
  const elapsedRef = useRef(0);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      const { data: s } = await supabase
        .from("prep_sessions")
        .select("id, title, status")
        .eq("id", id)
        .maybeSingle();
      if (cancelled) return;
      setSession(s as Session);
      const { data: qs } = await supabase
        .from("interview_questions")
        .select(
          "id, position, category, question, why_matters, what_good_covers, follow_up, difficulty, starred, practised"
        )
        .eq("session_id", id)
        .order("position");
      if (cancelled) return;
      setQuestions((qs ?? []) as Question[]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const categories = useMemo(
    () => Array.from(new Set(questions.map((q) => q.category))).sort(),
    [questions]
  );

  const filtered = useMemo(
    () =>
      category === "all"
        ? questions
        : questions.filter((q) => q.category === category),
    [questions, category]
  );

  const safeIndex = Math.min(index, Math.max(filtered.length - 1, 0));
  const current = filtered[safeIndex];

  // Reset per-question state when question changes
  useEffect(() => {
    setAnswer("");
    setSelfRating(null);
    setConfidence(null);
    elapsedRef.current = 0;
    setRemaining(duration);
    setRunning(false);
    startedAtRef.current = null;
  }, [current?.id, duration]);

  // Timer tick
  useEffect(() => {
    if (!running) return;
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
  }, [running]);

  const startTimer = () => {
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
    if (filtered.length === 0) return;
    const next = (i + filtered.length) % filtered.length;
    setIndex(next);
  };
  const prev = () => goTo(safeIndex - 1);
  const next = () => goTo(safeIndex + 1);
  const random = () => {
    if (filtered.length <= 1) return;
    let r = safeIndex;
    while (r === safeIndex) r = Math.floor(Math.random() * filtered.length);
    setIndex(r);
  };

  const saveAttempt = async (opts?: { advance?: boolean }) => {
    if (!current || !user) return;
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
    if (opts?.advance) next();
  };

  const updateCategory = (val: string) => {
    setCategory(val);
    setIndex(0);
    const p = new URLSearchParams(params);
    if (val === "all") p.delete("cat");
    else p.set("cat", val);
    setParams(p, { replace: true });
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
          <h1 className="font-display text-3xl font-semibold">
            Nothing to practise
          </h1>
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

  const practisedCount = questions.filter((q) => q.practised).length;
  const overallProgress = (practisedCount / questions.length) * 100;
  const timerProgress =
    duration > 0 ? ((duration - remaining) / duration) * 100 : 0;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SiteHeader />
      <main className="container-tight flex-1 py-6 md:py-10">
        <Link
          to={`/prep/${id}/results`}
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-6"
        >
          <ArrowLeft className="h-3 w-3" /> Back to pack
        </Link>

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground mb-2">
              Practice mode
            </div>
            <h1 className="font-display text-2xl md:text-3xl font-semibold truncate">
              {session?.title}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <Select value={category} onValueChange={updateCategory}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Overall progress */}
        <div className="mb-6">
          <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
            <span>
              Question {safeIndex + 1} of {filtered.length}
              {category !== "all" && ` · ${category}`}
            </span>
            <span>
              {practisedCount}/{questions.length} practised
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
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
                Your answer notes
              </div>
              <Textarea
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="Speak aloud, then capture your structure here…"
                rows={6}
              />
            </div>

            {/* Ratings */}
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
              <Button variant="outline" onClick={random} className="gap-1.5">
                <Shuffle className="h-4 w-4" /> Random
              </Button>
              <Button variant="outline" onClick={next} className="gap-1.5">
                Next <ArrowRight className="h-4 w-4" />
              </Button>
              <div className="flex-1" />
              <Button
                variant="ghost"
                onClick={() => saveAttempt()}
                disabled={!answer && selfRating === null && confidence === null}
              >
                Save attempt
              </Button>
              <Button onClick={() => saveAttempt({ advance: true })}>
                Save & next
              </Button>
            </div>
          </div>

          {/* Timer sidebar */}
          <aside className="lg:sticky lg:top-6 self-start">
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

              <div className="flex justify-center gap-2 mb-5">
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

              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
                Presets
              </div>
              <div className="grid grid-cols-4 gap-1.5 mb-4">
                {PRESETS.map((p) => (
                  <button
                    key={p}
                    onClick={() => setDuration(p)}
                    className={cn(
                      "text-xs py-1.5 border transition-colors",
                      duration === p
                        ? "border-foreground bg-foreground text-background"
                        : "border-border hover:bg-secondary"
                    )}
                  >
                    {p < 60 ? `${p}s` : `${p / 60}m`}
                  </button>
                ))}
              </div>

              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
                Custom (seconds)
              </div>
              <div className="flex gap-2">
                <input
                  type="number"
                  min={10}
                  max={3600}
                  value={duration}
                  onChange={(e) =>
                    setDuration(
                      Math.max(10, Math.min(3600, Number(e.target.value) || 60))
                    )
                  }
                  className="flex-1 h-9 px-3 text-sm border border-input bg-background"
                />
              </div>
            </div>

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

export default Practice;
