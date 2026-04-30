import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { WorkspaceSwitcher } from "@/components/WorkspaceSwitcher";
import { TestingPlanSwitcher } from "@/components/TestingPlanSwitcher";
import { TestingModeBanner } from "@/components/TestingModeBanner";
import { ResetTestAccountsPanel } from "@/components/ResetTestAccountsPanel";
import { ReportIssueButton } from "@/components/ReportIssueButton";
import { BRAND } from "@/config/brand";

export const SiteHeader = () => {
  const { user, signOut } = useAuth();
  const nav = useNavigate();

  return (
    <header className="border-b border-border bg-background">
      <TestingModeBanner />
      <div className="container-tight flex h-16 items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <div className="h-7 w-7 bg-foreground rounded-sm flex items-center justify-center">
            <span className="text-background font-display font-bold text-sm">I</span>
          </div>
          <div className="leading-none">
            <div className="font-display font-semibold text-base">{BRAND.appName}</div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">by The Speech Coach</div>
          </div>
        </Link>
        <nav className="flex items-center gap-6 text-sm">
          {user ? (
            <>
              <ReportIssueButton />
              <TestingPlanSwitcher />
              <ResetTestAccountsPanel />
              <WorkspaceSwitcher />
              <Link to="/dashboard" className="hover:text-accent transition-colors">Dashboard</Link>
              <Button variant="ghost" size="sm" onClick={async () => { await signOut(); nav("/"); }}>
                Sign out
              </Button>
            </>
          ) : (
            <>
              <a href="#features" className="hidden sm:block hover:text-accent transition-colors">Features</a>
              <a href="#pricing" className="hidden sm:block hover:text-accent transition-colors">Pricing</a>
              <Link to="/auth"><Button size="sm" variant="default">Start preparing</Button></Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
};
