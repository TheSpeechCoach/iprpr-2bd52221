import { useState } from "react";
import { Link } from "react-router-dom";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";

const emailSchema = z.string().trim().email("Enter a valid email").max(255);

const NEUTRAL_MESSAGE =
  "If an account exists for this email, we've sent password reset instructions.";

const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      toast({
        title: "Check your email",
        description: parsed.error.issues[0]?.message ?? "Enter a valid email",
        variant: "destructive",
      });
      return;
    }
    setLoading(true);
    try {
      // Fire-and-forget: ignore any error so we never reveal account existence.
      await supabase.auth.resetPasswordForEmail(parsed.data, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
    } catch {
      // intentionally swallowed
    } finally {
      setSubmitted(true);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-8 bg-background">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-3xl font-semibold">Reset your password</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Enter the email address linked to your account and we'll send you a reset link.
        </p>

        {submitted ? (
          <div className="mt-8 space-y-4">
            <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm">
              {NEUTRAL_MESSAGE}
            </div>
            <Button asChild className="w-full">
              <Link to="/auth">Back to sign in</Link>
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                maxLength={255}
                autoComplete="email"
              />
            </div>
            <Button
              type="submit"
              className="w-full bg-accent hover:bg-accent/90 text-accent-foreground"
              disabled={loading}
            >
              {loading ? "Please wait…" : "Send reset link"}
            </Button>
            <div className="text-sm text-center text-muted-foreground">
              <Link to="/auth" className="text-foreground underline underline-offset-4">
                Back to sign in
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default ForgotPassword;
