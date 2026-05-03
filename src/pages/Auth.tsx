import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { track } from "@/lib/analytics";
import { copy } from "@/lib/copy";
import { BRAND } from "@/config/brand";
import { Users } from "lucide-react";

const signupSchema = z.object({
  fullName: z.string().trim().min(1, "Your full name is required").max(120),
  email: z.string().trim().email("Enter a valid email").max(255),
  password: z.string().min(6, "Password must be at least 6 characters").max(200),
});

const Auth = () => {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get("redirect") || "/dashboard";
  const { user } = useAuth();

  useEffect(() => { if (user) nav(redirectTo); }, [user, nav, redirectTo]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const parsed = signupSchema.safeParse({ fullName, email, password });
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
            emailRedirectTo: `${window.location.origin}${redirectTo}`,
            data: {
              full_name: fullName.trim(),
              signup_type: "individual",
            },
          },
        });
        if (error) throw error;
        void track("user_signed_up", {
          userId: data.user?.id ?? null,
          plan: "free",
          metadata: { confirmation_required: !data.session, signup_type: "individual" },
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
        nav(redirectTo);
      } else {
        if (password.length < 6) {
          toast({ title: "Password too short", description: "Use at least 6 characters.", variant: "destructive" });
          return;
        }
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        nav(redirectTo);
      }
    } catch (err: any) {
      const msg = err?.message ?? "";
      const code = err?.code ?? err?.error_code ?? "";
      const isWeakPassword =
        code === "weak_password" ||
        /weak[_ ]password|pwned|known to be weak|easy to guess/i.test(msg);
      const isExisting =
        code === "user_already_exists" ||
        /already registered|already been registered|user already/i.test(msg);
      const isSignupAttempt = mode === "signup";

      const friendly = isWeakPassword
        ? "This password has appeared in a known data breach. Please choose a stronger, unique password (try a longer passphrase)."
        : isExisting
        ? "An account with this email already exists. Try signing in, or use \"Forgotten password?\" to reset it."
        : /invalid login credentials/i.test(msg)
        ? "We couldn't complete sign-in. Please check your details or request a new link."
        : /email not confirmed/i.test(msg)
        ? "Your email isn't confirmed yet. Please check your inbox for the verification link or request a new one."
        : /rate limit|too many/i.test(msg)
        ? "Too many attempts. Please wait a moment and try again."
        : isSignupAttempt
        ? "We couldn't create your account. Please check your details and try again."
        : "We couldn't complete sign-in. Please check your details or request a new link.";
      const title = isSignupAttempt ? "Sign-up problem" : "Sign-in problem";
      toast({ title, description: friendly, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const isSignup = mode === "signup";

  return (
    <div className="min-h-screen grid md:grid-cols-2">
      <div className="hidden md:flex flex-col justify-between bg-foreground text-background p-12">
        <Link to="/" className="font-display font-semibold">{BRAND.appName}</Link>
        <div>
          <h1 className="font-display text-5xl font-semibold leading-tight">{BRAND.appName}.</h1>
          <p className="mt-4 text-background/70 max-w-sm whitespace-pre-line">{BRAND.tagline}</p>
          <p className="mt-12 text-xs uppercase tracking-widest text-background/40">From The Speech Coach</p>
        </div>
      </div>

      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <h2 className="font-display text-3xl font-semibold">
            {isSignup ? "Create your account" : copy.auth.signInTitle}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {isSignup ? "Start preparing for your interviews." : "Sign in to continue your prep."}
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {isSignup && (
              <div className="space-y-2">
                <Label htmlFor="name">Full name</Label>
                <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} required maxLength={120} />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email address</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={255} />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                {!isSignup && (
                  <Link
                    to="/forgot-password"
                    className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4"
                  >
                    Forgotten password?
                  </Link>
                )}
              </div>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} maxLength={200} />
            </div>
            <Button type="submit" className="w-full bg-accent hover:bg-accent/90 text-accent-foreground" disabled={loading}>
              {loading ? "Please wait…" : isSignup ? "Create account" : "Sign in"}
            </Button>
          </form>

          {isSignup && (
            <div className="mt-6 rounded-lg border border-border bg-muted/40 p-4">
              <div className="flex items-start gap-3">
                <Users className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                <div className="text-sm">
                  <p className="font-medium">Setting up for a team?</p>
                  <Link
                    to="/signup/team"
                    className="text-muted-foreground hover:text-foreground underline underline-offset-4"
                  >
                    Create a team workspace →
                  </Link>
                </div>
              </div>
            </div>
          )}

          <div className="mt-6 text-sm text-center text-muted-foreground">
            {isSignup ? (
              <>Already have an account? <button onClick={() => setMode("signin")} className="text-foreground underline underline-offset-4">Sign in</button></>
            ) : (
              <>New here? <button onClick={() => setMode("signup")} className="text-foreground underline underline-offset-4">Create an account</button></>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Auth;
