import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { copy } from "@/lib/copy";

const schema = z.object({
  candidateFullName: z.string().trim().min(2, "Candidate full name is required").max(120),
  candidateEmail: z.string().trim().email("Enter a valid email").max(255),
  candidateLinkedinUrl: z
    .string()
    .trim()
    .max(300)
    .optional()
    .refine(
      (v) => !v || /^https?:\/\/(www\.)?linkedin\.com\/.+/i.test(v),
      "Enter a valid LinkedIn URL or leave blank",
    ),
});

export function CandidateLockGate({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const nav = useNavigate();
  const [checking, setChecking] = useState(true);
  const [needsLock, setNeedsLock] = useState(false);
  const [candidateFullName, setCandidateFullName] = useState("");
  const [candidateEmail, setCandidateEmail] = useState("");
  const [candidateLinkedinUrl, setCandidateLinkedinUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setChecking(false); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("candidate_full_name, candidate_email, candidate_linkedin_url")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (!data?.candidate_full_name || !data?.candidate_email) {
        setNeedsLock(true);
        setCandidateEmail(data?.candidate_email ?? user.email ?? "");
        setCandidateLinkedinUrl(data?.candidate_linkedin_url ?? "");
      }
      setChecking(false);
    })();
    return () => { cancelled = true; };
  }, [user, authLoading]);

  const handleLock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const parsed = schema.safeParse({
      candidateFullName,
      candidateEmail,
      candidateLinkedinUrl: candidateLinkedinUrl || undefined,
    });
    if (!parsed.success) {
      toast({
        title: "Check your details",
        description: parsed.error.issues[0]?.message ?? "Please review the form.",
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        candidate_full_name: candidateFullName.trim(),
        candidate_email: candidateEmail.trim(),
        candidate_linkedin_url: candidateLinkedinUrl.trim() || null,
        candidate_locked_at: new Date().toISOString(),
      })
      .eq("id", user.id);
    setSubmitting(false);
    if (error) {
      toast({ title: "Could not save", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Candidate set", description: "Your account is now locked to this candidate." });
    setNeedsLock(false);
    nav("/dashboard");
  };

  if (authLoading || checking) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">{copy.common.status.loading}</div>;
  }

  if (needsLock && user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div className="w-full max-w-md">
          <h1 className="font-display text-2xl font-semibold">Confirm your candidate</h1>
          <p className="mt-2 text-sm text-muted-foreground">{copy.auth.candidateNameHelp}</p>
          <form onSubmit={handleLock} className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cName">{copy.auth.candidateNameLabel}</Label>
              <Input id="cName" value={candidateFullName} onChange={(e) => setCandidateFullName(e.target.value)} required maxLength={120} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cEmail">{copy.auth.candidateEmailLabel}</Label>
              <Input id="cEmail" type="email" value={candidateEmail} onChange={(e) => setCandidateEmail(e.target.value)} required maxLength={255} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cLinkedin">{copy.auth.candidateLinkedinLabel}</Label>
              <Input id="cLinkedin" type="url" value={candidateLinkedinUrl} onChange={(e) => setCandidateLinkedinUrl(e.target.value)} maxLength={300} placeholder="https://www.linkedin.com/in/…" />
            </div>
            <p className="text-xs text-muted-foreground">{copy.auth.candidateLockNotice}</p>
            <Button type="submit" className="w-full bg-accent hover:bg-accent/90 text-accent-foreground" disabled={submitting}>
              {submitting ? "Saving…" : "Lock candidate to this account"}
            </Button>
          </form>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
