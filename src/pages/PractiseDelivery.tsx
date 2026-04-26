import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Mic, ExternalLink } from "lucide-react";

interface Payload {
  question?: string;
  tier?: string;
  user_answer?: string;
  question_id?: string;
  session_id?: string;
}

const STORAGE_KEY = "tsc.pendingPracticePayload";

const PractiseDelivery = () => {
  const loc = useLocation();
  const [payload, setPayload] = useState<Payload>({});

  useEffect(() => {
    const fromState = (loc.state ?? {}) as Payload;
    if (fromState.question) {
      setPayload(fromState);
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(fromState));
      } catch {}
      return;
    }
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) setPayload(JSON.parse(raw));
    } catch {}
  }, [loc.state]);

  const tierLabel =
    payload.tier === "foundation" ? "Foundation" :
    payload.tier === "strong" ? "Strong" :
    payload.tier === "standout" ? "Standout" : null;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SiteHeader />
      <main className="container-tight flex-1 py-10">
        <Link
          to={payload.session_id ? `/prep/${payload.session_id}/results` : "/dashboard"}
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-6"
        >
          <ArrowLeft className="h-3 w-3" /> Back to your pack
        </Link>

        <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground mb-2">
          Practise delivery
        </div>
        <h1 className="font-display text-3xl md:text-4xl font-semibold leading-tight max-w-2xl">
          Take this into the Speech Coach app
        </h1>
        <p className="mt-3 text-muted-foreground max-w-xl">
          Delivery is what gets you hired. Read your answer aloud, in your own voice, until it sounds like you in the room.
        </p>

        <div className="mt-10 border border-border bg-background">
          <div className="px-6 py-5 border-b border-border">
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-2">
              The question
            </div>
            <p className="text-base font-medium leading-snug">
              {payload.question ?? "No question selected. Open a question in your pack and tap “Practise delivery”."}
            </p>
          </div>

          {tierLabel && (
            <div className="px-6 py-4 border-b border-border">
              <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-1">
                Anchor tier
              </div>
              <p className="text-sm">{tierLabel}</p>
            </div>
          )}

          {payload.user_answer && (
            <div className="px-6 py-5 border-b border-border">
              <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-2">
                Your answer (in your words)
              </div>
              <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">
                {payload.user_answer}
              </p>
            </div>
          )}

          <div className="px-6 py-5 bg-secondary/30">
            <div className="flex items-start gap-3">
              <Mic className="h-4 w-4 text-accent mt-0.5" strokeWidth={1.5} />
              <div className="flex-1">
                <p className="text-sm leading-relaxed">
                  The Speech Coach fluency app will open in a new tab. Your question and answer are saved here, ready to hand off as soon as deep linking is live.
                </p>
                <Button className="mt-4 gap-2 bg-accent hover:bg-accent/90 text-accent-foreground" disabled>
                  <ExternalLink className="h-4 w-4" /> Open Speech Coach (coming soon)
                </Button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default PractiseDelivery;
