import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { WorkspaceProvider } from "@/hooks/useWorkspace";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AdminRoute } from "@/components/AdminRoute";
import Landing from "./pages/Landing";
import Auth from "./pages/Auth";
import AuthTeam from "./pages/AuthTeam";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import PrepWizard from "./pages/PrepWizard";
import Results from "./pages/Results";
import Practice from "./pages/Practice";
import Upgrade from "./pages/Upgrade";
import PractiseDelivery from "./pages/PractiseDelivery";
import WorkspacePage from "./pages/Workspace";
import AcceptInvite from "./pages/AcceptInvite";
import AdminOverview from "./pages/admin/AdminOverview";
import AdminUsers from "./pages/admin/AdminUsers";
import AdminSessions from "./pages/admin/AdminSessions";
import AdminSessionDetail from "./pages/admin/AdminSessionDetail";
import AdminGenerationJobs from "./pages/admin/AdminGenerationJobs";
import AdminFeedback from "./pages/admin/AdminFeedback";
import AdminTesting from "./pages/admin/AdminTesting";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <WorkspaceProvider>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/signup/team" element={<AuthTeam />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/workspace" element={<ProtectedRoute><WorkspacePage /></ProtectedRoute>} />
              <Route path="/invite/:token" element={<AcceptInvite />} />
              <Route path="/prep/new" element={<ProtectedRoute><PrepWizard /></ProtectedRoute>} />
              <Route path="/prep/:id/results" element={<ProtectedRoute><Results /></ProtectedRoute>} />
              <Route path="/prep/:id/practice" element={<ProtectedRoute><Practice /></ProtectedRoute>} />
              <Route path="/upgrade" element={<ProtectedRoute><Upgrade /></ProtectedRoute>} />
              <Route path="/practise-delivery" element={<ProtectedRoute><PractiseDelivery /></ProtectedRoute>} />
              <Route path="/admin" element={<AdminRoute><AdminOverview /></AdminRoute>} />
              <Route path="/admin/users" element={<AdminRoute><AdminUsers /></AdminRoute>} />
              <Route path="/admin/sessions" element={<AdminRoute><AdminSessions /></AdminRoute>} />
              <Route path="/admin/sessions/:id" element={<AdminRoute><AdminSessionDetail /></AdminRoute>} />
              <Route path="/admin/generation-jobs" element={<AdminRoute><AdminGenerationJobs /></AdminRoute>} />
              <Route path="/admin/feedback" element={<AdminRoute><AdminFeedback /></AdminRoute>} />
              <Route path="/admin/testing" element={<AdminRoute><AdminTesting /></AdminRoute>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </WorkspaceProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
