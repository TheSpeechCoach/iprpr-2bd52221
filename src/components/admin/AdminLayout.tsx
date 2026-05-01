import { ReactNode } from "react";
import { Navigate, NavLink, useLocation } from "react-router-dom";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { LayoutDashboard, Users, FileText, Cpu, MessageSquare, FlaskConical, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

const NAV = [
  { to: "/admin", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/admin/users", label: "Users", icon: Users },
  { to: "/admin/sessions", label: "Sessions", icon: FileText },
  { to: "/admin/generation-jobs", label: "Generation jobs", icon: Cpu },
  { to: "/admin/feedback", label: "Beta feedback", icon: MessageSquare },
  { to: "/admin/testing", label: "Testing", icon: FlaskConical },
];

export function AdminLayout({ children }: { children: ReactNode }) {
  const { user, loading: authLoading, signOut } = useAuth();
  const { isAdmin, loading } = useIsAdmin();
  const { pathname } = useLocation();

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-6 w-6 border-2 border-foreground border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-3">
          <ShieldAlert className="h-10 w-10 mx-auto text-destructive" />
          <h1 className="text-2xl font-semibold">Restricted area</h1>
          <p className="text-sm text-muted-foreground">
            This page is for platform administrators only.
          </p>
          <Button asChild variant="outline" size="sm">
            <NavLink to="/dashboard">Back to dashboard</NavLink>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-background">
      <aside className="w-60 shrink-0 border-r border-border flex flex-col">
        <div className="px-4 h-14 flex items-center border-b border-border">
          <NavLink to="/admin" className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-sm bg-foreground flex items-center justify-center">
              <span className="text-background text-xs font-bold">i</span>
            </div>
            <div className="leading-none">
              <div className="text-sm font-semibold">iPrpr Admin</div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">internal</div>
            </div>
          </NavLink>
        </div>
        <nav className="flex-1 p-2 space-y-0.5">
          {NAV.map((item) => {
            const active = item.end ? pathname === item.to : pathname.startsWith(item.to);
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-foreground text-background"
                    : "text-foreground/80 hover:bg-muted",
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>
        <div className="p-3 border-t border-border space-y-2">
          <div className="text-[11px] text-muted-foreground truncate" title={user.email ?? undefined}>
            {user.email}
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm" className="flex-1">
              <NavLink to="/dashboard">App</NavLink>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => signOut()}>Sign out</Button>
          </div>
        </div>
      </aside>
      <main className="flex-1 min-w-0">
        <div className="border-b border-border bg-destructive/5 px-6 py-2 text-[12px] text-destructive">
          This dashboard contains personal data from CVs, job applications, and saved answers. Do not export or share without consent.
        </div>
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
