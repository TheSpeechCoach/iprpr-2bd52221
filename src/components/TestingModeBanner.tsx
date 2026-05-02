import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Beaker } from "lucide-react";

/**
 * Renders a persistent banner whenever `app_settings.testing_mode = true`.
 * Use to make it obvious to every visitor that this build is gated for
 * private testing only — commercial limits are relaxed in this mode.
 */
export const TestingModeBanner = () => {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "testing_mode")
        .maybeSingle();
      if (cancelled) return;
      setEnabled(data?.value === true || (data?.value as unknown) === "true");
    })();
    return () => { cancelled = true; };
  }, []);

  if (!enabled) return null;

  return (
    <div className="w-full border-b border-amber-300 bg-amber-100 px-4 py-2 text-center text-xs text-amber-900 sm:text-sm">
      <span className="inline-flex items-center gap-2">
        <Beaker className="h-3.5 w-3.5" aria-hidden="true" />
        <span><strong>Private testing mode is active.</strong> This version is for testing only.</span>
      </span>
    </div>
  );
};
