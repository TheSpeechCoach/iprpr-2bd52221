import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";

export interface Candidate {
  id: string;
  workspace_id: string;
  full_name: string;
  email: string | null;
  linkedin_url: string | null;
  current_role_text: string | null;
  notes: string | null;
  archived_at: string | null;
  created_at: string;
}

export const useCandidates = () => {
  const { currentWorkspaceId } = useWorkspace();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!currentWorkspaceId) {
      setCandidates([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("candidates")
      .select("*")
      .eq("workspace_id", currentWorkspaceId)
      .is("archived_at", null)
      .order("created_at", { ascending: false });
    setCandidates((data as Candidate[]) ?? []);
    setLoading(false);
  }, [currentWorkspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { candidates, loading, refresh: load };
};
