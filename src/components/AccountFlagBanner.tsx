import { AlertTriangle } from "lucide-react";
import { useAccountFlag } from "@/hooks/useAccountFlag";

/**
 * Soft warning shown to users whose accounts have been auto-flagged for
 * unusual activity. Does not block any features — purely informational.
 */
export function AccountFlagBanner() {
  const { flagged, loading } = useAccountFlag();
  if (loading || !flagged) return null;

  return (
    <div className="rounded-lg border border-amber-300/60 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700/40 px-4 py-3 flex items-start gap-3">
      <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-700 dark:text-amber-400 shrink-0" />
      <div className="text-sm text-amber-900 dark:text-amber-200">
        <p className="font-medium">Unusual activity detected on your account</p>
        <p className="mt-1 text-amber-800/90 dark:text-amber-300/90">
          Your account has been flagged for review. Pro accounts are licensed to a single named candidate. If you think this is a mistake, contact support.
        </p>
      </div>
    </div>
  );
}
