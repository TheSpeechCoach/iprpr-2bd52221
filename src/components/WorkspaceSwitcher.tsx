import { useWorkspace } from "@/hooks/useWorkspace";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Check, ChevronDown, Users } from "lucide-react";
import { Link } from "react-router-dom";

export const WorkspaceSwitcher = () => {
  const { workspaces, current, currentWorkspaceId, setCurrentWorkspaceId, loading } = useWorkspace();

  if (loading || !current) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 max-w-[200px]">
          <Users className="h-3.5 w-3.5" />
          <span className="truncate">{current.name}</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-xs uppercase tracking-wider text-muted-foreground">
          Workspaces
        </DropdownMenuLabel>
        {workspaces.map((w) => (
          <DropdownMenuItem
            key={w.id}
            onClick={() => setCurrentWorkspaceId(w.id)}
            className="flex items-center justify-between gap-2"
          >
            <div className="flex flex-col min-w-0">
              <span className="truncate text-sm">{w.name}</span>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {w.is_personal ? "Personal" : w.role} · {w.plan}
              </span>
            </div>
            {w.id === currentWorkspaceId && <Check className="h-4 w-4 text-accent" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/workspace" className="text-sm">Manage workspace</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
