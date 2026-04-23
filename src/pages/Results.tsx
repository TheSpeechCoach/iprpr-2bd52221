import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Star, Search, ArrowLeft } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Question {
  id: string; position: number; category: string; question: string;
  why_matters: string | null; what_good_covers: string | null;
  follow_up: string | null; answer_framework: string | null;
  difficulty: string | null; starred: boolean; practised: boolean;
}

interface Session {
  id: string; title: string; status: string;
  candidate_summary: string | null; role_summary: string | null;
  top_themes: any; red_flags: any; target_role: string | null; company_name: string | null;
}

const Results = () => {
  const { id } = useParams();
  const [session, setSession] = useState<Session | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [search, setSearch] = useState("");
  const [activeCat, setActiveCat] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    const load = async () => {
      const { data: s } = await supabase.from("prep_sessions").select("*").eq("id", id).maybeSingle();
      if (cancelled) return;
      setSession(s as Session);
      const { data: qs } = await supabase.from("interview_questions").select("*").eq("session_id", id).order("position");
      if (cancelled) return;
      setQuestions((qs ?? []) as Question[]);
      setLoading(false);
    };
    load();
    // Poll while generating
    const interval = setInterval(async () => {
      const { data: s } = await supabase.from("prep_sessions").select("status").eq("id", id).maybeSingle();
      if (s?.status === "ready") { load(); clearInterval(interval); }
      if (s?.status === "failed") { clearInterval(interval); toast({ title: "Generation failed", variant: "destructive" }); }
    }, 3000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [id]);

  const toggleStar = async (q: Question) => {
    await supabase.from("interview_questions").update({ starred: !q.starred }).eq("id", q.id);
    setQuestions((prev) => prev.map((x) => x.id === q.id ? { ...x, starred: !x.starred } : x));
  };

  const togglePractised = async (q: Question) => {
    await supabase.from("interview_questions").update({ practised: !q.practised }).eq("id", q.id);
    setQuestions((prev) => prev.map((x) => x.id === q.id ? { ...x, practised: !x.practised } : x));
  };

  const categories = Array.from(new Set(questions.map((q) => q.category)));
  const filtered = questions.filter((q) =>
    (activeCat === "all" || q.category === activeCat) &&
    (search === "" || q.question.toLowerCase().includes(search.toLowerCase()))
  );

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col">
        <SiteHeader />
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }

  if (session?.status === "generating") {
    return (
      <div className="min-h-screen flex flex-col">
        <SiteHeader />
        <main className="container-tight flex-1 flex flex-col items-center justify-center py-24 text-center">
          <Loader2 className="h-10 w-10 animate-spin text-accent" strokeWidth={1.5} />
          <h1 className="mt-6 font-display text-3xl font-semibold">Generating your interview pack</h1>
          <p className="mt-2 text-muted-foreground max-w-md">This usually takes around 30–60 seconds. We're tailoring 100 questions to your CV and the role.</p>
        </main>
      </div>
    );
  }

  if (session?.status === "failed") {
    return (
      <div className="min-h-screen flex flex-col">
        <SiteHeader />
        <main className="container-tight flex-1 flex flex-col items-center justify-center py-24 text-center">
          <h1 className="font-display text-3xl font-semibold">Generation failed</h1>
          <p className="mt-2 text-muted-foreground max-w-md">Something went wrong. Please try again or check your inputs.</p>
          <Link to="/dashboard" className="mt-6"><Button variant="outline">Back to dashboard</Button></Link>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main className="container-tight flex-1 py-10">
        <Link to="/dashboard" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-6">
          <ArrowLeft className="h-3 w-3" /> Back to dashboard
        </Link>

        <div className="mb-10">
          <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground mb-2">Interview pack</div>
          <h1 className="font-display text-4xl font-semibold">{session?.title}</h1>
        </div>

        {/* Summary cards */}
        <div className="grid md:grid-cols-3 gap-px bg-border mb-10">
          <SummaryCard title="Candidate" body={session?.candidate_summary} />
          <SummaryCard title="Role" body={session?.role_summary} />
          <SummaryCard title="Top themes" body={Array.isArray(session?.top_themes) ? (session?.top_themes as string[]).join(" · ") : null} />
        </div>

        {/* Search + filter */}
        <div className="flex gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search questions" className="pl-10" />
          </div>
        </div>

        <Tabs value={activeCat} onValueChange={setActiveCat}>
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="all">All ({questions.length})</TabsTrigger>
            {categories.map((c) => (
              <TabsTrigger key={c} value={c}>{c}</TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value={activeCat} className="mt-6">
            {filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground py-12 text-center">No questions match.</p>
            ) : (
              <Accordion type="multiple" className="border border-border">
                {filtered.map((q) => (
                  <AccordionItem key={q.id} value={q.id} className="border-b border-border last:border-b-0">
                    <AccordionTrigger className="hover:no-underline px-5 py-4 text-left">
                      <div className="flex items-start gap-4 w-full">
                        <span className="font-display text-xs text-muted-foreground mt-0.5 w-8">{String(q.position).padStart(3, "0")}</span>
                        <div className="flex-1">
                          <div className="text-sm font-medium">{q.question}</div>
                          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1">
                            {q.category}{q.difficulty ? ` · ${q.difficulty}` : ""}
                          </div>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleStar(q); }}
                          className="shrink-0"
                        >
                          <Star className={`h-4 w-4 ${q.starred ? "fill-accent text-accent" : "text-muted-foreground"}`} />
                        </button>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-5 pb-5">
                      <div className="ml-12 space-y-4 text-sm">
                        {q.why_matters && <Block label="Why this matters" body={q.why_matters} />}
                        {q.what_good_covers && <Block label="What good answers cover" body={q.what_good_covers} />}
                        {q.answer_framework && <Block label="Answer framework" body={q.answer_framework} />}
                        {q.follow_up && <Block label="Likely follow-up" body={q.follow_up} />}
                        <div className="flex gap-2 pt-2">
                          <Button size="sm" variant={q.practised ? "default" : "outline"} onClick={() => togglePractised(q)}>
                            {q.practised ? "Practised" : "Mark as practised"}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(q.question); toast({ title: "Copied" }); }}>
                            Copy question
                          </Button>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

const SummaryCard = ({ title, body }: { title: string; body: string | null | undefined }) => (
  <div className="bg-background p-6">
    <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">{title}</div>
    <div className="text-sm leading-relaxed">{body || <span className="text-muted-foreground">—</span>}</div>
  </div>
);

const Block = ({ label, body }: { label: string; body: string }) => (
  <div>
    <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">{label}</div>
    <p className="text-sm leading-relaxed">{body}</p>
  </div>
);

export default Results;
