import { Bookmark, Users } from "lucide-react";
import { cn } from "@/lib/utils";

interface SoftUrgencyNoteProps {
  /** Show the "session remains saved" reassurance line. Default: true. */
  showSaved?: boolean;
  /** Show the social-proof reinforcement line. Default: true. */
  showSocialProof?: boolean;
  /** Optional gentle reminder line (e.g. "Pick this back up whenever you're ready"). */
  reminder?: string;
  className?: string;
  align?: "left" | "center";
}

/**
 * Soft, non-intrusive urgency messaging used alongside upgrade prompts.
 * Calm, confident, matter-of-fact — no countdowns, no aggressive tactics.
 */
export const SoftUrgencyNote = ({
  showSaved = true,
  showSocialProof = true,
  reminder,
  className,
  align = "left",
}: SoftUrgencyNoteProps) => {
  return (
    <div
      className={cn(
        "space-y-2 text-xs text-muted-foreground",
        align === "center" && "text-center",
        className,
      )}
    >
      {showSaved && (
        <div
          className={cn(
            "flex items-start gap-2",
            align === "center" && "justify-center",
          )}
        >
          <Bookmark className="h-3.5 w-3.5 mt-0.5 shrink-0 text-foreground/60" strokeWidth={1.75} />
          <span>
            This session will remain saved, but full access is limited until upgrade.
          </span>
        </div>
      )}
      {showSocialProof && (
        <div
          className={cn(
            "flex items-start gap-2",
            align === "center" && "justify-center",
          )}
        >
          <Users className="h-3.5 w-3.5 mt-0.5 shrink-0 text-foreground/60" strokeWidth={1.75} />
          <span>Most users upgrade at this stage to complete their preparation properly.</span>
        </div>
      )}
      {reminder && (
        <div
          className={cn(
            "text-foreground/70",
            align === "center" && "text-center",
          )}
        >
          {reminder}
        </div>
      )}
    </div>
  );
};
