import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type WorkspaceRole = "owner" | "admin" | "member";

export interface Workspace {
  id: string;
  name: string;
  owner_id: string;
  plan: string;
  seat_tier: string | null;
  is_personal: boolean;
  role: WorkspaceRole;
}

interface WorkspaceContextValue {
  loading: boolean;
  workspaces: Workspace[];
  currentWorkspaceId: string | null;
  current: Workspace | null;
  setCurrentWorkspaceId: (id: string) => void;
  refresh: () => Promise<void>;
}

const STORAGE_KEY = "ipp.currentWorkspaceId";

const WorkspaceContext = createContext<WorkspaceContextValue>({
  loading: true,
  workspaces: [],
  currentWorkspaceId: null,
  current: null,
  setCurrentWorkspaceId: () => {},
  refresh: async () => {},
});

export const WorkspaceProvider = ({ children }: { children: ReactNode }) => {
  const { user, loading: authLoading } = useAuth();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [currentWorkspaceId, setCurrentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) {
      setWorkspaces([]);
      setCurrentId(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("workspace_members")
      .select("role, workspaces:workspace_id(id, name, owner_id, plan, seat_tier, is_personal)")
      .eq("user_id", user.id);

    if (error || !data) {
      setWorkspaces([]);
      setLoading(false);
      return;
    }

    const list: Workspace[] = data
      .map((row: any) => {
        const w = row.workspaces;
        if (!w) return null;
        return {
          id: w.id,
          name: w.name,
          owner_id: w.owner_id,
          plan: w.plan,
          seat_tier: w.seat_tier,
          is_personal: w.is_personal,
          role: row.role as WorkspaceRole,
        };
      })
      .filter(Boolean) as Workspace[];

    // Personal workspace first, then by name
    list.sort((a, b) => {
      if (a.is_personal !== b.is_personal) return a.is_personal ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    setWorkspaces(list);

    const stored = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    const valid = stored && list.some((w) => w.id === stored) ? stored : list[0]?.id ?? null;
    setCurrentId(valid);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (!authLoading) void load();
  }, [authLoading, load]);

  const setCurrentWorkspaceId = useCallback((id: string) => {
    setCurrentId(id);
    if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, id);
  }, []);

  const current = useMemo(
    () => workspaces.find((w) => w.id === currentWorkspaceId) ?? null,
    [workspaces, currentWorkspaceId],
  );

  return (
    <WorkspaceContext.Provider
      value={{ loading, workspaces, currentWorkspaceId, current, setCurrentWorkspaceId, refresh: load }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
};

export const useWorkspace = () => useContext(WorkspaceContext);
