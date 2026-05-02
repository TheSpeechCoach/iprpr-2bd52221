import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ExternalLink, UserMinus } from "lucide-react";

/**
 * Admin-only guidance panel for resetting test accounts during private beta.
 * Visible only when:
 *  - testing_mode = true in app_settings, AND
 *  - the current user has the platform admin role.
 *
 * This panel does NOT delete users itself. It links the admin to the backend
 * Users panel where deletion happens safely with proper auth cascade.
 */
const BACKEND_USERS_URL =
  "https://supabase.com/dashboard/project/qnqqojmfzpycdxezdviz/auth/users";

export const ResetTestAccountsPanel = () => {
  const { user } = useAuth();
  const [enabled, setEnabled] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) return;
      const [{ data: setting }, { data: roleRow }] = await Promise.all([
        supabase.from("app_settings").select("value").eq("key", "testing_mode").maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle(),
      ]);
      if (cancelled) return;
      setEnabled(setting?.value === true || (setting?.value as unknown) === "true");
      setIsAdmin(!!roleRow);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  if (!user || !enabled || !isAdmin) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 border-amber-300 bg-amber-50 px-2 text-xs text-amber-900 hover:bg-amber-100 hover:text-amber-900"
        >
          <UserMinus className="h-3.5 w-3.5" />
          Reset test accounts
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 text-sm">
        <div className="space-y-3">
          <div>
            <h3 className="font-semibold text-foreground">Reset test accounts</h3>
            <p className="mt-1 text-muted-foreground">
              To reuse an email address during private beta, delete the test user from
              the backend Users panel. Once deleted, the same email can sign up again
              immediately.
            </p>
          </div>

          <Button
            asChild
            size="sm"
            className="w-full"
          >
            <a href={BACKEND_USERS_URL} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-2 h-3.5 w-3.5" />
              Open Users panel
            </a>
          </Button>

          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer font-medium text-foreground">
              Can't open the panel? Manual steps
            </summary>
            <ol className="mt-2 list-decimal space-y-1 pl-4">
              <li>Open the project backend</li>
              <li>Go to Authentication</li>
              <li>Open Users</li>
              <li>Delete the relevant test accounts</li>
              <li>Ask the tester to sign up again</li>
            </ol>
          </details>

          <p className="text-[11px] text-muted-foreground">
            Email confirmation is disabled in testing mode, so testers can sign up again
            with the same address straight away.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
};
