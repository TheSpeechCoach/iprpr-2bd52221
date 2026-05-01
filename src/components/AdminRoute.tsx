import { ReactNode, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const AdminRoute = ({ children }: { children: ReactNode }) => {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const [bootstrapping, setBootstrapping] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Admin bootstrap is for private beta only. Disable TESTING_MODE before production.
  const ownerEmail = (import.meta.env.VITE_OWNER_ADMIN_EMAIL as string | undefined)?.trim().toLowerCase();
  const testingMode = String(import.meta.env.VITE_TESTING_MODE ?? "false").toLowerCase() === "true";
  const userEmail = (user?.email ?? "").trim().toLowerCase();
  const canBootstrap = Boolean(testingMode && ownerEmail && userEmail === ownerEmail);

  if (authLoading || adminLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md w-full border border-border rounded-md p-8 bg-background">
          <h1 className="font-display text-2xl font-semibold">Restricted area</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This page is for platform administrators only.
          </p>
          {canBootstrap ? (
            <p className="mt-4 text-sm text-muted-foreground">
              Admin access has not been enabled for this account.
            </p>
          ) : null}
          {canBootstrap && (
            <Button
              className="mt-4"
              disabled={bootstrapping}
              onClick={async () => {
                setErrorMessage(null);
                setBootstrapping(true);
                const { data, error } = await supabase.functions.invoke("bootstrap-admin", { body: {} });
                setBootstrapping(false);
                if (error) {
                  setErrorMessage(error.message || "Could not enable admin access. Please try again.");
                  return;
                }
                if ((data as any)?.ok !== true) {
                  setErrorMessage((data as any)?.error || "Admin access was not enabled.");
                  return;
                }
                window.location.assign("/admin");
              }}
            >
              {bootstrapping ? "Enabling…" : "Enable admin access"}
            </Button>
          )}
          {errorMessage ? <p className="mt-3 text-sm text-destructive">{errorMessage}</p> : null}
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
