import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface AccountFlagState {
  flagged: boolean;
  loading: boolean;
}

/**
 * Returns whether the current user has an open automated abuse flag.
 * Used to show a soft warning banner. Does NOT block any actions.
 */
export function useAccountFlag(): AccountFlagState {
  const { user, loading: authLoading } = useAuth();
  const [state, setState] = useState<AccountFlagState>({ flagged: false, loading: true });

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setState({ flagged: false, loading: false }); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("account_flags")
        .select("id")
        .eq("user_id", user.id)
        .eq("status", "open")
        .limit(1)
        .maybeSingle();
      if (!cancelled) setState({ flagged: !!data?.id, loading: false });
    })();
    return () => { cancelled = true; };
  }, [user, authLoading]);

  return state;
}
