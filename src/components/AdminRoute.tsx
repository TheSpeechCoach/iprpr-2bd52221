import { ReactNode, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

/**
 * AdminRoute
 *
 * ⚠️ PRIVATE BETA ONLY ⚠️
 * This component exposes a one-click "Enable admin access" bootstrap button
 * when ALL of the following are true:
 *   - VITE_TESTING_MODE === "true"
 *   - VITE_OWNER_ADMIN_EMAIL matches the logged-in user's email
 *   - The server-side bootstrap-admin function also has TESTING_MODE=true
 *     and OWNER_ADMIN_EMAIL set to the same address.
 *
 * Before production:
 *   - Set TESTING_MODE=false on the edge function (server-side secret).
 *   - Set VITE_TESTING_MODE=false in the frontend environment.
 *   - The button will then disappear and bootstrap-admin will refuse to run.
 *   - Existing platform_admin role assignments remain intact.
 *
 * The frontend VITE_ vars are used ONLY to decide whether to show the button.
 * All real authorisation happens server-side in the bootstrap-admin function
 * and via the `admin` app_role in user_roles (enforced by RLS).
 */
export const AdminRoute = ({ children }: { children: ReactNode }) => {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const [bootstrapping, setBootstrapping] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const ownerEmail = (import.meta.env.VITE_OWNER_ADMIN_EMAIL as string | undefined)?.trim().toLowerCase();
  const testingMode = String(import.meta.env.VITE_TESTING_MODE ?? "false").toLowerCase() === "true";
  const userEmail = (user?.email ?? "").trim().toLowerCase();
  const ownerEmailConfigured = Boolean(ownerEmail) && ownerEmail !== "your-email@example.com";
  const canBootstrap = Boolean(testingMode && ownerEmailConfigured && userEmail === ownerEmail);
  // Show owner-config hint if testing mode is on but the env vars don't line up.
  const showSetupHint = testingMode && !canBootstrap;

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
          {canBootstrap ? (
            <>
              <h1 className="font-display text-2xl font-semibold">Admin access not enabled</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                This account matches the configured owner email. Enable admin access to open the platform dashboard.
              </p>
              <Button
                className="mt-4"
                disabled={bootstrapping}
                onClick={async () => {
                  setErrorMessage(null);
                  setBootstrapping(true);
                  const { data, error } = await supabase.functions.invoke("bootstrap-admin", { body: {} });
                  if (error) {
                    setBootstrapping(false);
                    setErrorMessage(error.message || "Could not enable admin access. Please try again.");
                    return;
                  }
                  const result = data as { ok?: boolean; error?: string } | null;
                  if (result?.ok !== true) {
                    setBootstrapping(false);
                    setErrorMessage(result?.error || "Admin access was not enabled.");
                    return;
                  }
                  // Refresh session so JWT/profile/admin state reflect the new role,
                  // then hard-reload /admin so useIsAdmin re-queries user_roles.
                  try { await supabase.auth.refreshSession(); } catch { /* non-fatal */ }
                  window.location.assign("/admin");
                }}
              >
                {bootstrapping ? "Enabling…" : "Enable admin access"}
              </Button>
              {errorMessage ? <p className="mt-3 text-sm text-destructive">{errorMessage}</p> : null}
              <p className="mt-6 text-[11px] text-muted-foreground leading-relaxed">
                Private beta only. Disable <code>TESTING_MODE</code> before production to remove this button.
              </p>
            </>
          ) : (
            <>
              <h1 className="font-display text-2xl font-semibold">Restricted area</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                This page is for platform administrators only.
              </p>
              {showSetupHint && (
                <div className="mt-5 rounded-md border border-border bg-muted/40 p-4 text-xs text-muted-foreground space-y-2">
                  <p className="font-semibold text-foreground">Owner setup (private beta)</p>
                  <p>
                    To enable the bootstrap button on this page, configure the following and reload:
                  </p>
                  <ul className="list-disc pl-4 space-y-1">
                    <li>Frontend env: <code>VITE_TESTING_MODE=true</code></li>
                    <li>Frontend env: <code>VITE_OWNER_ADMIN_EMAIL=&lt;owner login email&gt;</code></li>
                    <li>Edge function secret: <code>TESTING_MODE=true</code></li>
                    <li>Edge function secret: <code>OWNER_ADMIN_EMAIL=&lt;same owner login email&gt;</code></li>
                  </ul>
                  <p>
                    Then sign in with the owner email and revisit <code>/admin</code>.
                  </p>
                  <p className="pt-1">
                    Signed in as <span className="text-foreground">{user.email}</span>
                    {ownerEmailConfigured ? <> · expected <span className="text-foreground">{ownerEmail}</span></> : null}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
