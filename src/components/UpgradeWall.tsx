import { Button } from "@/components/ui/button";

type UpgradeWallProps = {
  eligibleForIntroOffer: boolean;
  onUpgrade: () => void;
  className?: string;
};

/**
 * Upgrade wall shown after a Free user reaches the 10-question preview limit.
 *
 * Eligibility for the $19 first-month intro offer is decided by the caller
 * (typically via `useProIntroOfferEligibility`) — this component does not
 * check it itself and never gates checkout discounts on its own.
 */
export function UpgradeWall({
  eligibleForIntroOffer,
  onUpgrade,
  className,
}: UpgradeWallProps) {
  return (
    <section
      className={`border border-border bg-background p-6 ${className ?? ""}`}
    >
      <p className="text-[11px] uppercase tracking-[0.2em] text-destructive">
        Free preview limit reached
      </p>
      <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight text-foreground">
        You've reached your free limit.
      </h2>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        Upgrade to Pro to unlock full training and feedback across the complete 50-question set.
      </p>

      {eligibleForIntroOffer ? (
        <>
          <p className="mt-4 text-lg font-medium text-foreground">
            Unlock Pro today for $19 for your first month.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Then $29/month. Cancel anytime.
          </p>
          <Button onClick={onUpgrade} size="lg" className="mt-5">
            Unlock Pro for $19
          </Button>
        </>
      ) : (
        <>
          <p className="mt-4 text-lg font-medium text-foreground">
            Train with the full 50-question set and get clear feedback on every answer.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            $29/month. Cancel anytime.
          </p>
          <Button onClick={onUpgrade} size="lg" className="mt-5">
            Unlock full training and feedback
          </Button>
        </>
      )}
    </section>
  );
}
