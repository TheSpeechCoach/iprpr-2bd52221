import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { BRAND } from "@/config/brand";

const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters")
  .max(200)
  .refine((v) => /[A-Za-z]/.test(v) && /[0-9]/.test(v), {
    message: "Include at least one letter and one number",
  });

const ResetPassword = () => {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [recoveryReady, setRecoveryReady] = useState(false);
  const nav = useNavigate();

  useEffect(() => {
    // Supabase parses the recovery hash and emits a PASSWORD_RECOVERY event.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setRecoveryReady(true);
      }
    });
    // Also check current session in case the hash was already consumed.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setRecoveryReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = passwordSchema.safeParse(password);
    if (!parsed.success) {
      toast({
        title: "Password too weak",
        description: parsed.error.issues[0]?.message ?? "Choose a stronger password.",
        variant: "destructive",
      });
      return;
    }
    if (password !== confirm) {
      toast({
        title: "Passwords don't match",
        description: "Make sure both fields are identical.",
        variant: "destructive",
      });
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setSuccess(true);
      // Sign the user out so they sign in again with the new password.
      await supabase.auth.signOut();
      toast({
        title: "Password updated",
        description: "Your password has been updated. You can now sign in.",
      });
      setTimeout(() => nav("/auth"), 1500);
    } catch (err: any) {
      toast({
        title: "Couldn't update password",
        description: err?.message ?? "Please try the reset link again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-8 bg-background">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-3xl font-semibold">Set a new password</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Choose a strong password you don't use elsewhere.
        </p>

        {success ? (
          <div className="mt-8 space-y-4">
            <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm">
              Your password has been updated. You can now sign in.
            </div>
            <Button asChild className="w-full">
              <Link to="/auth">Go to sign in</Link>
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            {!recoveryReady && (
              <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                Waiting for your reset link to be verified… If nothing happens, request a new link.
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="password">New password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                maxLength={200}
                autoComplete="new-password"
              />
              <p className="text-xs text-muted-foreground">
                At least 8 characters, with a letter and a number.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">Confirm new password</Label>
              <Input
                id="confirm"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={8}
                maxLength={200}
                autoComplete="new-password"
              />
            </div>
            <Button
              type="submit"
              className="w-full bg-accent hover:bg-accent/90 text-accent-foreground"
              disabled={loading || !recoveryReady}
            >
              {loading ? "Updating…" : "Update password"}
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

export default ResetPassword;
