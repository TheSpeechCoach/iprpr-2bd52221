import { useState } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { MessageSquareWarning, Loader2 } from "lucide-react";

const ISSUE_TYPES = [
  { value: "bug", label: "Bug — something is broken" },
  { value: "ui", label: "UI / copy issue" },
  { value: "generation", label: "Generation problem" },
  { value: "billing", label: "Billing / pricing" },
  { value: "other", label: "Other feedback" },
];

/**
 * Compact "Report an issue" trigger for the SiteHeader.
 * Captures: user_id, user_email, page_url, issue_type, message, created_at.
 * Only rendered when a user is signed in.
 */
export const ReportIssueButton = () => {
  const { user } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [issueType, setIssueType] = useState<string>("bug");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!user) return null;

  const reset = () => {
    setIssueType("bug");
    setMessage("");
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = message.trim();
    if (trimmed.length < 5) {
      toast({
        title: "Add a little more detail",
        description: "Please describe what happened in at least a sentence.",
        variant: "destructive",
      });
      return;
    }
    if (trimmed.length > 4000) {
      toast({
        title: "Message is too long",
        description: "Please keep it under 4,000 characters.",
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);
    try {
      const pageUrl =
        typeof window !== "undefined"
          ? window.location.href
          : location.pathname;
      const { error } = await supabase.from("beta_feedback").insert({
        user_id: user.id,
        user_email: user.email ?? null,
        page_url: pageUrl,
        issue_type: issueType,
        message: trimmed,
      });
      if (error) throw error;
      toast({
        title: "Thanks — feedback received",
        description: "We'll take a look. You can keep using the app as normal.",
      });
      reset();
      setOpen(false);
    } catch (err: unknown) {
      toast({
        title: "Couldn't send feedback",
        description: err?.message ?? "Please try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <button
          type="button"
          className="hidden sm:inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <MessageSquareWarning className="h-3.5 w-3.5" aria-hidden="true" />
          Report an issue
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Report an issue</DialogTitle>
          <DialogDescription>
            Tell us what's broken or what could be better. We capture the page
            you're on and your account email so we can follow up.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="issue-type">Issue type</Label>
            <Select value={issueType} onValueChange={setIssueType}>
              <SelectTrigger id="issue-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ISSUE_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="issue-message">Message</Label>
            <Textarea
              id="issue-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="What happened? What did you expect?"
              rows={5}
              maxLength={4000}
            />
            <div className="text-[11px] text-muted-foreground">
              {message.length}/4000
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sending…
                </>
              ) : (
                "Send feedback"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
