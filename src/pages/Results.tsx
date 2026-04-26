import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
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
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import jsPDF from "jspdf";
import { Document, Packer, Paragraph, HeadingLevel, TextRun } from "docx";
import { saveAs } from "file-saver";

interface Question {
  id: string;
  position: number;
  category: string;
  question: string;
  why_matters: string | null;
  what_good_covers: string | null;
  follow_up: string | null;
  answer_framework: string | null;
  difficulty: string | null;
  starred: boolean;
  practised: boolean;
  note: string | null;
}

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
}

const Results = () => {
  const { id } = useParams();
  const [session, setSession] = useState<Session | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [search, setSearch] = useState("");
  const [activeCat, setActiveCat] = useState("all");
  const [activeDiff, setActiveDiff] = useState("all");
  const [showStarred, setShowStarred] = useState(false);
  const [loading, setLoading] = useState(true);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

  const [retrying, setRetrying] = useState(false);

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
      const { data: s } = await supabase
        .from("prep_sessions")
        .select("status")
        .eq("id", id)
        .maybeSingle();
      if (cancelled) return;
      if (s?.status === "ready") {
        await loadAll();
        if (interval) clearInterval(interval);
      } else if (s?.status === "failed") {
        await loadAll();
        if (interval) clearInterval(interval);
      }
    };
    loadAll().then(() => {
      interval = setInterval(tick, 3000);
    });
    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

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
    toast({ title: "Note saved" });
  };

  const copyQuestion = (q: Question) => {
    navigator.clipboard.writeText(q.question);
    toast({ title: "Copied to clipboard" });
  };

  const exportPDF = () => {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 48;
    const maxW = pageW - margin * 2;
    let y = margin;

    const writeWrapped = (text: string, size: number, bold = false, gap = 6) => {
      doc.setFont("helvetica", bold ? "bold" : "normal");
      doc.setFontSize(size);
      const lines = doc.splitTextToSize(text, maxW);
      for (const line of lines) {
        if (y > pageH - margin) {
          doc.addPage();
          y = margin;
        }
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

    doc.save(`${session?.title ?? "interview-pack"}.pdf`);
  };

  const exportDOCX = async () => {
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

    const doc = new Document({ sections: [{ children }] });
    const blob = await Packer.toBlob(doc);
    saveAs(blob, `${session?.title ?? "interview-pack"}.docx`);
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
  if (session?.status === "generating") {
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
            Tailoring each question to your CV and the role. This usually takes 30–60 seconds — feel free to leave this page and come back from your dashboard.
          </p>
        </main>
      </div>
    );
  }

  // ----- Failed state -----
  if (session?.status === "failed") {
    return (
      <div className="min-h-screen flex flex-col">
        <SiteHeader />
        <main className="container-tight flex-1 flex flex-col items-center justify-center py-24 text-center">
          <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Something went wrong</div>
          <h1 className="mt-2 font-display text-3xl font-semibold">We couldn't finish your pack</h1>
          <p className="mt-3 text-muted-foreground max-w-md">
            This is usually a brief hiccup with the AI service. Retry now, or come back in a minute or two — your inputs are saved.
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
            <div className="mt-3 flex flex-wrap gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span>{questions.length} {questions.length === 1 ? "question" : "questions"}</span>
              <span>·</span>
              <span>{starredCount} starred</span>
              <span>·</span>
              <span>{practisedCount} practised</span>
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
              <DropdownMenuItem onClick={exportPDF}>
                <FileText className="h-4 w-4 mr-2" /> Download PDF
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportDOCX}>
                <FileType className="h-4 w-4 mr-2" /> Download DOCX
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid md:grid-cols-3 gap-px bg-border mb-10 border border-border">
          <SummaryCard
            label="Candidate"
            heading={session?.full_name || "Profile"}
            body={session?.candidate_summary}
          />
          <SummaryCard
            label="Role"
            heading={
              [session?.target_role, session?.company_name]
                .filter(Boolean)
                .join(" · ") || "Target role"
            }
            body={session?.role_summary}
          />
          <SummaryCard
            label="Top themes"
            heading={`${
              Array.isArray(session?.top_themes) ? session!.top_themes.length : 0
            } themes`}
            chips={
              Array.isArray(session?.top_themes)
                ? (session!.top_themes as string[])
                : []
            }
          />
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
                    {c}
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
          Showing {filtered.length} of {questions.length}
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
              Clear filters
            </Button>
          </div>
        ) : (
          <Accordion type="multiple" className="border border-border">
            {filtered.map((q) => (
              <AccordionItem
                key={q.id}
                value={q.id}
                className="border-b border-border last:border-b-0"
              >
                <AccordionTrigger className="hover:no-underline px-4 md:px-5 py-4 text-left">
                  <div className="flex items-start gap-3 md:gap-4 w-full">
                    <span className="font-display text-xs text-muted-foreground mt-0.5 w-8 shrink-0">
                      {String(q.position).padStart(3, "0")}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium pr-2">
                        {q.question}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Badge variant="secondary" className="text-[10px]">
                          {q.category}
                        </Badge>
                        {q.difficulty && (
                          <Badge variant="outline" className="text-[10px]">
                            {q.difficulty}
                          </Badge>
                        )}
                        {q.practised && (
                          <Badge className="text-[10px] gap-1">
                            <CheckCircle2 className="h-3 w-3" /> Practised
                          </Badge>
                        )}
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
                <AccordionContent className="px-4 md:px-5 pb-5">
                  <div className="md:ml-12 space-y-4 text-sm">
                    {q.why_matters && (
                      <Block label="Why this matters" body={q.why_matters} />
                    )}
                    {q.what_good_covers && (
                      <Block
                        label="What good answers cover"
                        body={q.what_good_covers}
                      />
                    )}
                    {q.answer_framework && (
                      <Block label="Answer framework" body={q.answer_framework} />
                    )}
                    {q.follow_up && (
                      <Block label="Likely follow-up" body={q.follow_up} />
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
                        placeholder="Capture your structured answer or key points…"
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
        )}
      </main>
    </div>
  );
};

const SummaryCard = ({
  label,
  heading,
  body,
  chips,
}: {
  label: string;
  heading?: string;
  body?: string | null;
  chips?: string[];
}) => (
  <div className="bg-background p-6">
    <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
      {label}
    </div>
    {heading && (
      <div className="font-display text-base font-medium mb-2">{heading}</div>
    )}
    {body !== undefined && (
      <div className="text-sm leading-relaxed text-muted-foreground">
        {body || <span>—</span>}
      </div>
    )}
    {chips && chips.length > 0 && (
      <div className="flex flex-wrap gap-1.5">
        {chips.map((c) => (
          <Badge key={c} variant="secondary" className="text-[10px]">
            {c}
          </Badge>
        ))}
      </div>
    )}
    {chips && chips.length === 0 && (
      <div className="text-sm text-muted-foreground">—</div>
    )}
  </div>
);

const Block = ({ label, body }: { label: string; body: string }) => (
  <div>
    <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
      {label}
    </div>
    <p className="text-sm leading-relaxed">{body}</p>
  </div>
);

export default Results;
