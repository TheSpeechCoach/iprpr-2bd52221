import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { track } from "@/lib/analytics";
import { copy } from "@/lib/copy";

const signupSchema = z.object({
  fullName: z.string().trim().min(1, "Your name is required").max(120),
  candidateFullName: z
    .string()
    .trim()
    .min(2, "Candidate full name is required")
    .max(120),
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
  email: z.string().trim().email().max(255),
  password: z.string().min(6).max(200),
});

const Auth = () => {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [candidateFullName, setCandidateFullName] = useState("");
  const [candidateEmail, setCandidateEmail] = useState("");
  const [candidateLinkedinUrl, setCandidateLinkedinUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();
  const { user } = useAuth();

  useEffect(() => { if (user) nav("/dashboard"); }, [user, nav]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const parsed = signupSchema.safeParse({
          fullName,
          candidateFullName,
          candidateEmail,
          candidateLinkedinUrl: candidateLinkedinUrl || undefined,
          email,
          password,
        });
        if (!parsed.success) {
          const first = parsed.error.issues[0]?.message ?? "Please check the form.";
          toast({ title: "Check your details", description: first, variant: "destructive" });
          setLoading(false);
          return;
        }
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`,
            data: {
              full_name: fullName.trim(),
              candidate_full_name: candidateFullName.trim(),
              candidate_email: candidateEmail.trim(),
              candidate_linkedin_url: candidateLinkedinUrl.trim() || null,
            },
          },
        });
        if (error) throw error;
        void track("user_signed_up", {
          userId: data.user?.id ?? null,
          plan: "free",
          metadata: { confirmation_required: !data.session },
        });
        if (!data.session) {
          toast({
            title: "Check your inbox",
            description: "We've sent a confirmation link. Verify your email, then sign in.",
          });
          setMode("signin");
          setPassword("");
          return;
        }
        toast({ title: "Account created", description: "You're signed in." });
        nav("/dashboard");
      } else {
        if (password.length < 6) {
          toast({ title: "Password too short", description: "Use at least 6 characters.", variant: "destructive" });
          return;
        }
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        nav("/dashboard");
      }
    } catch (err: any) {
      const msg = err?.message ?? "Something went wrong. Please try again.";
      const friendly = /invalid login credentials/i.test(msg)
        ? "Email or password is incorrect."
        : /already registered/i.test(msg)
        ? "An account with this email already exists. Try signing in."
        : msg;
      toast({ title: "Authentication failed", description: friendly, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid md:grid-cols-2">
      <div className="hidden md:flex flex-col justify-between bg-foreground text-background p-12">
        <Link to="/" className="font-display font-semibold">Interview Prep Pal</Link>
        <div>
          <h1 className="font-display text-5xl font-semibold leading-tight">Prepare with intention.</h1>
          <p className="mt-4 text-background/70 max-w-sm">Tailored interview questions, practice mode, and answer angles — all from your CV and the role.</p>
          <p className="mt-12 text-xs uppercase tracking-widest text-background/40">From The Speech Coach</p>
        </div>
      </div>

      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <h2 className="font-display text-3xl font-semibold">{mode === "signin" ? copy.auth.signInTitle : copy.auth.signUpTitle}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {mode === "signin" ? "Sign in to continue your prep." : "Start preparing in under a minute."}
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            {mode === "signup" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="name">{copy.auth.fullNameLabel}</Label>
                  <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} required maxLength={120} />
                </div>

                <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-3">
                  <p className="text-xs text-muted-foreground">{copy.auth.candidateLockNotice}</p>

                  <div className="space-y-2">
                    <Label htmlFor="candidateName">{copy.auth.candidateNameLabel}</Label>
                    <Input
                      id="candidateName"
                      value={candidateFullName}
                      onChange={(e) => setCandidateFullName(e.target.value)}
                      required
                      maxLength={120}
                      placeholder="e.g. Alex Morgan"
                    />
                    <p className="text-xs text-muted-foreground">{copy.auth.candidateNameHelp}</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="candidateEmail">{copy.auth.candidateEmailLabel}</Label>
                    <Input
                      id="candidateEmail"
                      type="email"
                      value={candidateEmail}
                      onChange={(e) => setCandidateEmail(e.target.value)}
                      required
                      maxLength={255}
                    />
                    <p className="text-xs text-muted-foreground">{copy.auth.candidateEmailHelp}</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="candidateLinkedin">{copy.auth.candidateLinkedinLabel}</Label>
                    <Input
                      id="candidateLinkedin"
                      type="url"
                      value={candidateLinkedinUrl}
                      onChange={(e) => setCandidateLinkedinUrl(e.target.value)}
                      maxLength={300}
                      placeholder="https://www.linkedin.com/in/…"
                    />
                    <p className="text-xs text-muted-foreground">{copy.auth.candidateLinkedinHelp}</p>
                  </div>
                </div>
              </>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">{copy.auth.emailLabel}</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={255} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{copy.auth.passwordLabel}</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} maxLength={200} />
            </div>
            <Button type="submit" className="w-full bg-accent hover:bg-accent/90 text-accent-foreground" disabled={loading}>
              {loading ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
            </Button>
          </form>

          <div className="mt-6 text-sm text-center text-muted-foreground">
            {mode === "signin" ? (
              <>New here? <button onClick={() => setMode("signup")} className="text-foreground underline underline-offset-4">Create an account</button></>
            ) : (
              <>Already have an account? <button onClick={() => setMode("signin")} className="text-foreground underline underline-offset-4">Sign in</button></>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Auth;
