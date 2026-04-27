import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { copy } from "@/lib/copy";

interface Props {
  /** Render variant: full wall (after question 10), inline note, or dashboard prompt. */
  variant?: "wall" | "inline" | "dashboard";
  /** Where to send the user. Defaults to /upgrade?offer=intro. */
  ctaHref?: string;
  className?: string;
}

const HREF = "/upgrade?offer=intro";

/**
 * Pro $19 first-month offer callout.
 * Only render when `useProIntroOfferEligibility().eligible` is true —
 * this component does not check eligibility itself.
 */
export function IntroOfferCallout({ variant = "wall", ctaHref = HREF, className }: Props) {
  const t = copy.upgrade.intro;

  if (variant === "dashboard") {
    return (
      <div
        className={`flex flex-col gap-3 border border-border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between ${className ?? ""}`}
      >
        <p className="text-sm text-foreground">{t.dashboardPrompt}</p>
        <Link to={ctaHref}>
          <Button size="sm">{t.buttonCta}</Button>
        </Link>
      </div>
    );
  }

  if (variant === "inline") {
    return (
      <div className={`border border-border bg-muted/30 p-5 ${className ?? ""}`}>
        <p className="text-sm text-foreground">{t.resultsLine}</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Link to={ctaHref}>
            <Button>{t.buttonCta}</Button>
          </Link>
          <span className="text-xs text-muted-foreground">{t.smallPrint}</span>
        </div>
      </div>
    );
  }

  // wall
  return (
    <div className={`border border-border bg-background p-8 ${className ?? ""}`}>
      <h3 className="font-display text-2xl font-semibold">{t.wallTitle}</h3>
      <p className="mt-3 whitespace-pre-line text-sm text-muted-foreground">{t.wallBody}</p>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Link to={ctaHref}>
          <Button size="lg">{t.buttonCta}</Button>
        </Link>
        <span className="text-xs text-muted-foreground">{t.smallPrint}</span>
      </div>
    </div>
  );
}
