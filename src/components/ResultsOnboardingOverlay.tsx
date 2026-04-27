import { useEffect, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ListChecks, Layers, PenLine, ArrowRight, ArrowLeft } from "lucide-react";

const STORAGE_KEY = "tsc.onboarding.results.v1";

interface Step {
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  body: string;
}

const STEPS: Step[] = [
  {
    icon: <ListChecks className="h-5 w-5 text-accent" strokeWidth={1.75} />,
    eyebrow: "Step 1 of 3",
    title: "These are the questions you're likely to be asked",
    body: "Tailored to your CV and the role. Skim the first ten — they're the ones a real interviewer is most likely to lead with.",
  },
  {
    icon: <Layers className="h-5 w-5 text-accent" strokeWidth={1.75} />,
    eyebrow: "Step 2 of 3",
    title: "Use the answer tiers to understand structure",
    body: "Each question has Foundation, Strong, and Standout examples. Read them aloud to feel the shape of a confident answer.",
  },
  {
    icon: <PenLine className="h-5 w-5 text-accent" strokeWidth={1.75} />,
    eyebrow: "Step 3 of 3",
    title: "Then write your own answers in your own words",
    body: "Don't memorise — adapt. Your version, your voice, your specifics. That's what lands in the room.",
  },
];

interface Props {
  /** Only render the overlay once the pack is ready. */
  ready: boolean;
}

export const ResultsOnboardingOverlay = ({ ready }: Props) => {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!ready) return;
    try {
      if (localStorage.getItem(STORAGE_KEY)) return;
    } catch {
      return;
    }
    // Slight delay so the page has settled before the overlay appears.
    const t = setTimeout(() => setOpen(true), 600);
    return () => clearTimeout(t);
  }, [ready]);

  const dismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
    setOpen(false);
  };

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : dismiss())}>
      <DialogContent className="max-w-md p-0 overflow-hidden">
        <div className="p-6 md:p-7">
          <div className="flex items-center gap-2 mb-4">
            {current.icon}
            <span className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              {current.eyebrow}
            </span>
          </div>
          <h2 className="font-display text-xl md:text-2xl font-semibold leading-snug">
            {current.title}
          </h2>
          <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
            {current.body}
          </p>

          {/* Progress dots */}
          <div className="flex items-center gap-1.5 mt-6">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={`h-1 rounded-full transition-all ${
                  i === step ? "w-6 bg-accent" : "w-3 bg-border"
                }`}
              />
            ))}
          </div>

          <div className="mt-6 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={dismiss}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Skip
            </button>
            <div className="flex items-center gap-2">
              {step > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setStep((s) => s - 1)}
                  className="gap-1"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Back
                </Button>
              )}
              {isLast ? (
                <Button
                  size="sm"
                  onClick={dismiss}
                  className="bg-accent hover:bg-accent/90 text-accent-foreground"
                >
                  Start preparing
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() => setStep((s) => s + 1)}
                  className="gap-1 bg-accent hover:bg-accent/90 text-accent-foreground"
                >
                  Next <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
