import { useProUsage } from "@/hooks/useProUsage";
import { PRO_LIMITS, formatResetDate } from "@/lib/proLimits";
import { AlertTriangle, Ban } from "lucide-react";

/**
 * Pro plan usage banner. Shows nothing for free / Coach+ / under 80% usage.
 * Surfaces an amber soft-warn at 80%+ and a destructive hard-block notice at 100%.
 */
export const ProUsageBanner = ({ className }: { className?: string }) => {
  const usage = useProUsage();
  if (usage.loading) return null;
  if (!usage.hasAnyWarning && !usage.hasAnyBlock) return null;

  const reset = formatResetDate(usage.periodEnd);
  const block = usage.hasAnyBlock;
  const Icon = block ? Ban : AlertTriangle;

  const lines: string[] = [];
  if (usage.rolesStatus !== "ok") {
    lines.push(
      `${usage.distinctRoles} of ${PRO_LIMITS.distinctRolesPerPeriod} target roles used`,
    );
  }
  if (usage.cvsStatus !== "ok") {
    lines.push(
      `${usage.distinctCvs} of ${PRO_LIMITS.distinctCvsPerPeriod} CV uploads used`,
    );
  }
  if (usage.jobSpecsStatus !== "ok") {
    lines.push(
      `${usage.jobSpecs} of ${PRO_LIMITS.jobSpecsPerPeriod} job specs used`,
    );
  }

  const tone = block
    ? "border-destructive/40 bg-destructive/5 text-destructive"
    : "border-accent/40 bg-accent/5 text-foreground";

  return (
    <div className={`border ${tone} p-4 flex gap-3 items-start ${className ?? ""}`}>
      <Icon className="h-4 w-4 mt-0.5 shrink-0" />
      <div className="text-sm">
        <div className="font-medium">
          {block ? "Pro plan limit reached" : "Approaching your Pro plan limit"}
        </div>
        <ul className="mt-1 text-xs text-muted-foreground space-y-0.5">
          {lines.map((l) => (
            <li key={l}>· {l}</li>
          ))}
        </ul>
        <div className="mt-2 text-xs text-muted-foreground">
          {block
            ? `You've reached this period's allowance. Limits reset on ${reset}.`
            : `Your allowance resets on ${reset}.`}
        </div>
      </div>
    </div>
  );
};
