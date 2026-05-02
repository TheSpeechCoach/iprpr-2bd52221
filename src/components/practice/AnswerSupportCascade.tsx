import { ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Lock, Sparkles, Crown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Plan } from "@/lib/planLimits";

/**
 * Step-by-step answer support cascade.
 *
 * Renders the four labelled stages (Understand, Build, Practise, Feedback)
 * as a single-open accordion. Locked stages remain visible with a teaser
 * and a single clear CTA so users understand what upgrading unlocks.
 *
 * This component is presentational only — children supply the live UI for
 * each unlocked step (textarea, buttons, feedback panel, etc.).
 */
export type CascadeStepKey = "understand" | "build" | "practise" | "feedback";

export interface CascadeStep {
  key: CascadeStepKey;
  number: number;
  title: string;
  /** Tier badge: "Free" / "Pro" / "Coach+" */
  tier: "free" | "pro" | "coach_plus";
  unlocked: boolean;
  /** Body shown when this step is unlocked. */
  unlockedBody: ReactNode;
  /** Copy shown when locked. */
  lockedTeaser: string;
  /** CTA wording when locked. */
  lockedCta: string;
  /** Where the CTA points to. */
  lockedHref: string;
}

interface Props {
  plan: Plan;
  steps: CascadeStep[];
  defaultOpen?: CascadeStepKey;
}

const TIER_BADGE: Record<
  CascadeStep["tier"],
  { label: string; className: string; icon?: typeof Sparkles }
> = {
  free: {
    label: "Free",
    className: "border-border text-muted-foreground bg-transparent",
  },
  pro: {
    label: "Pro",
    className: "border-accent/40 text-accent bg-accent/5",
    icon: Sparkles,
  },
  coach_plus: {
    label: "Coach+",
    className:
      "border-foreground text-foreground bg-foreground/[0.03] font-semibold",
    icon: Crown,
  },
};

const TIER_ACCENT: Record<CascadeStep["tier"], string> = {
  free: "border-l-border",
  pro: "border-l-accent/60",
  coach_plus: "border-l-foreground",
};

export const AnswerSupportCascade = ({
  steps,
  defaultOpen = "understand",
}: Props) => {
  return (
    <Accordion
      type="single"
      collapsible
      defaultValue={defaultOpen}
      className="space-y-2"
    >
      {steps.map((step) => {
        const tier = TIER_BADGE[step.tier];
        const Icon = tier.icon;
        return (
          <AccordionItem
            key={step.key}
            value={step.key}
            className={cn(
              "border border-border border-l-2 bg-card",
              TIER_ACCENT[step.tier],
            )}
          >
            <AccordionTrigger className="px-4 md:px-5 py-3 hover:no-underline">
              <div className="flex flex-1 items-center gap-3 min-w-0 text-left">
                <span className="font-display text-xs tabular-nums text-muted-foreground w-5 shrink-0">
                  {step.number}.
                </span>
                <span className="font-medium text-sm md:text-base truncate">
                  {step.title}
                </span>
                <span className="ml-auto flex items-center gap-2 shrink-0">
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px] uppercase tracking-wider gap-1 px-1.5 py-0.5",
                      tier.className,
                    )}
                  >
                    {Icon && <Icon className="h-3 w-3" />}
                    {tier.label}
                  </Badge>
                  {!step.unlocked && (
                    <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 md:px-5">
              {step.unlocked ? (
                <div className="pt-1">{step.unlockedBody}</div>
              ) : (
                <LockedTeaser step={step} />
              )}
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
};

const LockedTeaser = ({ step }: { step: CascadeStep }) => (
  <div className="rounded-sm border border-dashed border-border bg-muted/30 p-4 md:p-5">
    <p className="text-sm text-muted-foreground leading-relaxed">
      {step.lockedTeaser}
    </p>
    <div className="mt-4">
      <Link to={step.lockedHref}>
        <Button size="sm" variant="default" className="gap-1.5">
          <Lock className="h-3.5 w-3.5" />
          {step.lockedCta}
        </Button>
      </Link>
    </div>
  </div>
);
