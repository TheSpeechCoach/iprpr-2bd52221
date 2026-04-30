import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { track } from "@/lib/analytics";
import { BRAND } from "@/config/brand";

const teamSchema = z.object({
  fullName: z.string().trim().min(1, "Your full name is required").max(120),
  email: z.string().trim().email("Enter a valid work email").max(255),
  companyName: z.string().trim().min(1, "Company name is required").max(160),
  teamSize: z.string().min(1, "Select a team size"),
  workRole: z.string().trim().max(120).optional(),
  password: z.string().min(6, "Password must be at least 6 characters").max(200),
});

const TEAM_SIZES = ["1–5", "6–20", "21–50", "51–200", "200+"];

const AuthTeam = () => {
  const nav = useNavigate();
  const { user } = useAuth();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [teamSize, setTeamSize] = useState("");
  const [workRole, setWorkRole] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (user) nav("/dashboard"); }, [user, nav]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = teamSchema.safeParse({
      fullName,
      email,
      companyName,
      teamSize,
      workRole: workRole || undefined,
      password,
    });
    if (!parsed.success) {
      toast({
        title: "Check your details",
        description: parsed.error.issues[0]?.message ?? "Please review the form.",
        variant: "destructive",
      });
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/dashboard`,
          data: {
            full_name: fullName.trim(),
            signup_type: "team",
            company_name: companyName.trim(),
            team_size: teamSize,
            work_role: workRole.trim() || null,
          },
        },
      });
      if (error) throw error;
      void track("user_signed_up", {
        userId: data.user?.id ?? null,
        plan: "free",
        metadata: {
          signup_type: "team",
          company_name: companyName.trim(),
          team_size: teamSize,
          confirmation_required: !data.session,
        },
      });
      if (!data.session) {
        toast({
          title: "Check your inbox",
          description: "We've sent a confirmation link. Verify your email, then sign in.",
        });
        nav("/auth");
        return;
      }
      toast({ title: "Team workspace created", description: "Invite your team from the workspace settings." });
      nav("/workspace");
    } catch (err: any) {
      const msg = err?.message ?? "";
      const friendly = /already registered|already been registered|user already/i.test(msg)
        ? "An account with this email already exists. Try signing in instead."
        : "We couldn't create your account. Please check your details and try again.";
      toast({ title: "Sign-up problem", description: friendly, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid md:grid-cols-2">
      <div className="hidden md:flex flex-col justify-between bg-foreground text-background p-12">
        <Link to="/" className="font-display font-semibold">{BRAND.appName}</Link>
        <div>
          <h1 className="font-display text-5xl font-semibold leading-tight">{BRAND.line}</h1>
          <p className="mt-4 text-background/70 max-w-sm">
            Set up a shared workspace for your team. Invite members, manage candidates, and prep together.
          </p>
          <p className="mt-12 text-xs uppercase tracking-widest text-background/40">From The Speech Coach</p>
        </div>
      </div>

      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <h2 className="font-display text-3xl font-semibold">Create a team workspace</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Set up {BRAND.appName} for your organisation.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Full name</Label>
              <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} required maxLength={120} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Work email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={255} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="company">Company name</Label>
              <Input id="company" value={companyName} onChange={(e) => setCompanyName(e.target.value)} required maxLength={160} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="teamSize">Team size</Label>
              <Select value={teamSize} onValueChange={setTeamSize}>
                <SelectTrigger id="teamSize">
                  <SelectValue placeholder="Select team size" />
                </SelectTrigger>
                <SelectContent>
                  {TEAM_SIZES.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Your role <span className="text-muted-foreground">(optional)</span></Label>
              <Input id="role" value={workRole} onChange={(e) => setWorkRole(e.target.value)} maxLength={120} placeholder="e.g. Head of Talent" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} maxLength={200} />
            </div>

            <Button type="submit" className="w-full bg-accent hover:bg-accent/90 text-accent-foreground" disabled={loading}>
              {loading ? "Please wait…" : "Create team workspace"}
            </Button>
          </form>

          <div className="mt-6 text-sm text-center text-muted-foreground">
            Just for yourself? <Link to="/auth" className="text-foreground underline underline-offset-4">Create an individual account</Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthTeam;
