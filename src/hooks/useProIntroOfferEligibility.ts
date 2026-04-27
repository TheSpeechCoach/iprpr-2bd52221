import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * Server-validated eligibility for the Pro $19 first-month offer.
 *
 * Eligibility rules (enforced in DB function `is_eligible_for_pro_intro_offer`):
 *  - User on Free in both sandbox and live
 *  - At least one prep session created
 *  - Has never redeemed the intro offer before
 *
 * The hook is a UX hint only — checkout always re-validates server-side
 * before applying the discount. Never gate sensitive logic on this alone.
 */
export function useProIntroOfferEligibility() {
  const { user } = useAuth();
  const [eligible, setEligible] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setEligible(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.rpc("is_eligible_for_pro_intro_offer", {
      _user_id: user.id,
    });
    if (error) {
      console.error("intro offer eligibility check failed", error);
      setEligible(false);
    } else {
      setEligible(!!data);
    }
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { eligible, loading, refresh };
}
