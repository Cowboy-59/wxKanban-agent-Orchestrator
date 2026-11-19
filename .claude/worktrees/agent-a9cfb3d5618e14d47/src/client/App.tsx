import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from "@tanstack/react-query";
import { captureError } from "./lib/errorCapture"; // [SCOPE 061] auto error capture
import LoginPage from "./pages/auth/Login";
import RegisterPage from "./pages/RegistrationPage";
import ForgotPasswordPage from "./pages/auth/ForgotPassword";
import ResetPasswordPage from "./pages/auth/ResetPassword";
import VerifyEmailChangePage from "./pages/VerifyEmailChangePage"; // [profile self-service]
import OAuthCallbackPage from "./pages/auth/OAuthCallback";
import DashboardPage from "./pages/Dashboard";
import AdminDashboard from "./pages/AdminDashboard";
import SysAdminDashboard from "./pages/SysAdminDashboard";
import SysAdminSignupInvitations from "./pages/SysAdmin/SignupInvitations"; // [SCOPE 023 / I.10]
import SysAdminFeedback from "./pages/SysAdmin/Feedback"; // [SCOPE 043 / T006]
import SysAdminFeedbackMetrics from "./pages/SysAdmin/FeedbackMetrics"; // [SCOPE 043 / T016]
import SysAdminDocs from "./pages/SysAdmin/Docs"; // [SCOPE 044 / T007]
import SysAdminAuditLog from "./pages/SysAdmin/AuditLog"; // [SCOPE 147 / T007]
import SysAdminMarketing from "./pages/SysAdmin/Marketing"; // [SCOPE 046 / T005]
import MarketingCampaigns from "./pages/SysAdmin/marketing/Campaigns"; // [SCOPE 048 / T006]
import MarketingAssets from "./pages/SysAdmin/marketing/Assets"; // [SCOPE 048 / T007]
import MarketingPosts from "./pages/SysAdmin/marketing/Posts"; // [SCOPE 048 / T008]
import MarketingOverview from "./pages/SysAdmin/marketing/Overview"; // [SCOPE 064 / T002]
import MarketingNewsletter from "./pages/SysAdmin/marketing/Newsletter"; // [SCOPE 064 / T008]
import MarketingWelcome from "./pages/SysAdmin/marketing/Welcome"; // [SCOPE 109 / T006]
import MarketingAIStudio from "./pages/SysAdmin/marketing/AIStudio"; // [SCOPE 065 / T005-T007]
import MarketingFaq from "./pages/SysAdmin/marketing/Faq"; // [SCOPE 066 / T004]
import MarketingTrainingSessions from "./pages/SysAdmin/marketing/TrainingSessions"; // [SCOPE 066 / T004]
import BannerStudio from "./pages/SysAdmin/marketing/BannerStudio"; // [SCOPE 070 / T003]
import MarketingFeatureSnippets from "./pages/SysAdmin/marketing/FeatureSnippets"; // [SCOPE 096]
import MarketingBio from "./pages/SysAdmin/marketing/Bio"; // [SCOPE 100 / T009]
import FaqPage from "./pages/FaqPage"; // [SCOPE 066 / T006]
import PlanHelpPage from "./pages/PlanHelpPage"; // [SCOPE 084 / T007]
import HelpFeatureDetailPage from "./pages/HelpFeatureDetailPage"; // [SCOPE 084 / T006]
import DocsIndexPage from "./pages/DocsIndexPage"; // [SCOPE 044 / T007]
import DocsDetailPage from "./pages/DocsDetailPage"; // [SCOPE 044 / T007]
import AboutPage from "./pages/AboutPage";
import BioPage from "./pages/BioPage"; // [SCOPE 100 / T007]
import PrivacyPage from "./pages/PrivacyPage";
import TermsPage from "./pages/TermsPage";
import TeamDashboard from "./pages/TeamDashboard";
import ConsultantWorkHubPage from "./pages/ConsultantWorkHubPage";
import ConsultantDashboardPage from "./pages/ConsultantDashboardPage"; // [SCOPE 017 / T047]
import ConsultantCustomersPage from "./pages/ConsultantCustomersPage"; // [SCOPE 119 / T012]

import IntegrationsPage from "./pages/integrations/Integrations";
import TasksPage from "./pages/tasks/TasksPage";
import LandingPage from "./pages/LandingPage";
import InviteAcceptPage from "./pages/InviteAcceptPage";
import TeamMembersPage from "./pages/admin/TeamMembersPage";
import SettingsPage from "./pages/admin/SettingsPage";
import TimeBillingPage from "./pages/admin/TimeBillingPage"; // [SCOPE 005 / T014]
import UserSettingsPage from "./pages/SettingsPage"; // [profile self-service] personal settings/profile (all users)
import StackProfilesPage from "./pages/admin/StackProfilesPage"; // [SCOPE 057 / T004]
import ThemeProfilesPage from "./pages/admin/ThemeProfilesPage"; // [SCOPE 062 / T014]
import ThemeStudioPage from "./pages/ThemeStudioPage"; // Theme Studio Phase 1
// ProjectTokensPage removed per spec 028 Phase 11 (2026-05-23) — tokens are
// issued by the kit-download flow, not by an admin UI.
import { BillingConfigPage } from "./pages/BillingConfigPage";
import SubscriptionRequiredPage from "./pages/SubscriptionRequiredPage"; // [SCOPE 090 / T008]
import { InvoicesPage } from "./pages/InvoicesPage";
import { ReportsPage } from "./pages/ReportsPage";
import ProjectListPage from "./pages/ProjectListPage";


import ProjectWorkspacePage from "./pages/ProjectWorkspacePage";
import EngagementDetailPage from "./pages/EngagementDetailPage";
import ConsultantProvisionForm from "./pages/ConsultantProvisionForm";
import DistributorSignupPage from "./pages/DistributorSignupPage"; // [SCOPE 088 / T004]
import OverviewPage from "./pages/OverviewPage";
import OverviewEditorPage from "./pages/OverviewEditorPage";
import AuditManagementPage from "./pages/AuditManagement";
import DatabaseErdPage from "./pages/DatabaseErdPage"; // [SCOPE 021 / T017]
import ScopeProcessFlowPage from "./pages/ScopeProcessFlowPage"; // [SCOPE 059 / T007]
import ScopeAnalysisPage from "./pages/ScopeAnalysisPage"; // [SCOPE 060 / T012]
import PendingTasksPage from "./pages/admin/PendingTasksPage";
import ProtectedRoute from "./components/ProtectedRoute";
import { AuthProvider } from "./context/AuthContext";
import { LocaleSync } from "./i18n/LocaleSync"; // [SCOPE 051]
import { ThemeProvider } from "./components/ThemeProvider";
import ErrorBoundary from "./components/ErrorBoundary";

// [SCOPE 061] BEGIN — capture TanStack Query/mutation errors (v5: cache-level onError)
const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (err) =>
      captureError({ kind: "apiFetch", name: "QueryError", message: String(err) }),
  }),
  mutationCache: new MutationCache({
    onError: (err) =>
      captureError({ kind: "apiFetch", name: "QueryError", message: String(err) }),
  }),
});
// [SCOPE 061] END

function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <Router>
          <ErrorBoundary>
            <AuthProvider>
              <LocaleSync />
              <Routes>
                {/* Public routes */}
                <Route path="/" element={<LandingPage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/registration" element={<RegisterPage />} />
                <Route path="/register" element={<RegisterPage />} />
                <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                <Route path="/reset-password" element={<ResetPasswordPage />} />
                <Route path="/accept-invitation/:token" element={<InviteAcceptPage />} />
                {/* [profile self-service] Confirm a login-email change from the emailed link */}
                <Route path="/verify-email-change" element={<VerifyEmailChangePage />} />
                {/* [SCOPE 088 / T004] Unlisted distributor self-onboarding (public, no nav) */}
                <Route path="/distributor-signup" element={<DistributorSignupPage />} />
                {/* [SCOPE 044 / T007] Public landing-page Docs */}
                <Route path="/docs" element={<DocsIndexPage />} />
                <Route path="/docs/:slug" element={<DocsDetailPage />} />
                {/* Public About / Privacy / Terms (footer links) */}
                <Route path="/about" element={<AboutPage />} />
                {/* [SCOPE 100 / T007] Public founder bio — redirects to /about when unpublished */}
                <Route path="/bio" element={<BioPage />} />
                <Route path="/privacy" element={<PrivacyPage />} />
                <Route path="/terms" element={<TermsPage />} />
                {/* Spec 037 — Consultants Management */}
                <Route
                  path="/engagements/invite/:token/setup"
                  element={<ConsultantProvisionForm />}
                />
                <Route
                  path="/engagements/:id"
                  element={
                    <ProtectedRoute>
                      <EngagementDetailPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/oauth/callback/:system"
                  element={<OAuthCallbackPage />}
                />

                {/* Protected routes — /dashboard routes by usertype */}
                {/* [SCOPE 090 / T008] Subscription wall (Amendment A, FR-007/FR-008).
                    Inside ProtectedRoute because it still requires a session; the
                    guard exempts this exact path so it cannot redirect into itself. */}
                <Route
                  path="/subscription-required"
                  element={
                    <ProtectedRoute>
                      <SubscriptionRequiredPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/dashboard"
                  element={
                    <ProtectedRoute>
                      <DashboardPage />
                    </ProtectedRoute>
                  }
                />
                {/* [SCOPE 066 / T006] FAQ — menu-bar destination for read + ask */}
                <Route
                  path="/faq"
                  element={
                    <ProtectedRoute>
                      <FaqPage />
                    </ProtectedRoute>
                  }
                />
                {/* [SCOPE 084 / T007] Subscription-aware Help */}
                <Route
                  path="/help"
                  element={
                    <ProtectedRoute>
                      <PlanHelpPage />
                    </ProtectedRoute>
                  }
                />
                {/* [SCOPE 084 / T006] Per-feature "how to use it" detail page */}
                <Route
                  path="/help/:id"
                  element={
                    <ProtectedRoute>
                      <HelpFeatureDetailPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin/dashboard"
                  element={
                    <ProtectedRoute>
                      <AdminDashboard />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/sysadmin/dashboard"
                  element={
                    <ProtectedRoute>
                      <SysAdminDashboard />
                    </ProtectedRoute>
                  }
                />
                {/* [SCOPE 023 / I.10] Invite-bound promotional signups (FR-002a) */}
                <Route
                  path="/sysadmin/signup-invitations"
                  element={
                    <ProtectedRoute>
                      <SysAdminSignupInvitations />
                    </ProtectedRoute>
                  }
                />
                {/* [SCOPE 043 / T006] User Feedback triage surface */}
                <Route
                  path="/sysadmin/feedback"
                  element={
                    <ProtectedRoute>
                      <SysAdminFeedback />
                    </ProtectedRoute>
                  }
                />
                {/* [SCOPE 043 / T016] Feedback analytics dashboard */}
                <Route
                  path="/sysadmin/feedback/metrics"
                  element={
                    <ProtectedRoute>
                      <SysAdminFeedbackMetrics />
                    </ProtectedRoute>
                  }
                />
                {/* [SCOPE 147 / T007] SysAdmin action audit trail — the Dashboard's Audit link lands here */}
                <Route
                  path="/sysadmin/audit"
                  element={
                    <ProtectedRoute>
                      <SysAdminAuditLog />
                    </ProtectedRoute>
                  }
                />
                {/* [SCOPE 046 / T005] Marketing lead funnel */}
                <Route
                  path="/sysadmin/marketing"
                  element={
                    <ProtectedRoute>
                      <SysAdminMarketing />
                    </ProtectedRoute>
                  }
                />
                {/* [SCOPE 064 / T002] Marketing overview rollup */}
                <Route
                  path="/sysadmin/marketing/overview"
                  element={
                    <ProtectedRoute>
                      <MarketingOverview />
                    </ProtectedRoute>
                  }
                />
                {/* [SCOPE 064 / T008] Newsletter compose + send */}
                <Route
                  path="/sysadmin/marketing/newsletter"
                  element={
                    <ProtectedRoute>
                      <MarketingNewsletter />
                    </ProtectedRoute>
                  }
                />
                {/* [SCOPE 109 / T006] Customer welcome message */}
                <Route
                  path="/sysadmin/marketing/welcome"
                  element={
                    <ProtectedRoute>
                      <MarketingWelcome />
                    </ProtectedRoute>
                  }
                />
                {/* [SCOPE 065 / T005-T007] Marketing AI Studio */}
                <Route
                  path="/sysadmin/marketing/ai-studio"
                  element={
                    <ProtectedRoute>
                      <MarketingAIStudio />
                    </ProtectedRoute>
                  }
                />
                {/* [SCOPE 048 / T006-T008] Marketing module: campaigns / assets / posts */}
                <Route
                  path="/sysadmin/marketing/campaigns"
                  element={
                    <ProtectedRoute>
                      <MarketingCampaigns />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/sysadmin/marketing/assets"
                  element={
                    <ProtectedRoute>
                      <MarketingAssets />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/sysadmin/marketing/posts"
                  element={
                    <ProtectedRoute>
                      <MarketingPosts />
                    </ProtectedRoute>
                  }
                />
                {/* [SCOPE 070 / T003] Banner Studio */}
                <Route
                  path="/sysadmin/marketing/banners"
                  element={
                    <ProtectedRoute>
                      <BannerStudio />
                    </ProtectedRoute>
                  }
                />
                {/* [SCOPE 096] Marketing Feature Snippets manager */}
                <Route
                  path="/sysadmin/marketing/feature-snippets"
                  element={
                    <ProtectedRoute>
                      <MarketingFeatureSnippets />
                    </ProtectedRoute>
                  }
                />
                {/* [SCOPE 066 / T004] SysAdmin FAQ management */}
                <Route
                  path="/sysadmin/marketing/faq"
                  element={
                    <ProtectedRoute>
                      <MarketingFaq />
                    </ProtectedRoute>
                  }
                />
                {/* [SCOPE 066 / T004] SysAdmin Training Sessions management */}
                <Route
                  path="/sysadmin/marketing/training-sessions"
                  element={
                    <ProtectedRoute>
                      <MarketingTrainingSessions />
                    </ProtectedRoute>
                  }
                />
                {/* [SCOPE 100 / T009] SysAdmin Founder Bio editor */}
                <Route
                  path="/sysadmin/marketing/bio"
                  element={
                    <ProtectedRoute>
                      <MarketingBio />
                    </ProtectedRoute>
                  }
                />
                {/* [SCOPE 044 / T007] Landing-page Docs management */}
                <Route
                  path="/sysadmin/docs"
                  element={
                    <ProtectedRoute>
                      <SysAdminDocs />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/dashboard/team"
                  element={
                    <ProtectedRoute>
                      <TeamDashboard />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/dashboard/work-hub"
                  element={
                    <ProtectedRoute>
                      <ConsultantWorkHubPage />
                    </ProtectedRoute>
                  }
                />
                {/* [SCOPE 017 / T047] Consultant Dashboard — orients; the Work Hub executes */}
                <Route
                  path="/dashboard/consultant"
                  element={
                    <ProtectedRoute>
                      <ConsultantDashboardPage />
                    </ProtectedRoute>
                  }
                />
                {/* [SCOPE 119 / T012] Customer records — a record, never a relationship */}
                <Route
                  path="/dashboard/consultant/customers"
                  element={
                    <ProtectedRoute>
                      <ConsultantCustomersPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin/team"
                  element={
                    <ProtectedRoute>
                      <TeamMembersPage />
                    </ProtectedRoute>
                  }
                />
                {/* /admin/projects/:projectid/tokens removed (spec 028 Phase 11) */}
                <Route
                  path="/admin/settings"
                  element={
                    <ProtectedRoute>
                      <SettingsPage />
                    </ProtectedRoute>
                  }
                />
                {/* [profile self-service] Personal settings + full profile (all authenticated users) */}
                <Route
                  path="/settings"
                  element={
                    <ProtectedRoute>
                      <UserSettingsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin/stack-profiles"
                  element={
                    <ProtectedRoute>
                      <StackProfilesPage />
                    </ProtectedRoute>
                  }
                />{/* [SCOPE 057 / T004] */}
                <Route
                  path="/admin/theme-profiles"
                  element={
                    <ProtectedRoute>
                      <ThemeProfilesPage />
                    </ProtectedRoute>
                  }
                />{/* [SCOPE 062 / T014] */}
                <Route
                  path="/themes"
                  element={
                    <ProtectedRoute>
                      <ThemeStudioPage />
                    </ProtectedRoute>
                  }
                />{/* Theme Studio Phase 1 */}
                <Route
                  path="/admin/billing"
                  element={
                    <ProtectedRoute>
                      <BillingConfigPage />
                    </ProtectedRoute>
                  }
                />
                {/* [SCOPE 005 / T014] Time & Billing; the page carries its own plan and ADMIN locks */}
                <Route
                  path="/admin/time-billing"
                  element={
                    <ProtectedRoute>
                      <TimeBillingPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin/invoices"
                  element={
                    <ProtectedRoute>
                      <InvoicesPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin/reports"
                  element={
                    <ProtectedRoute>
                      <ReportsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/integrations"
                  element={
                    <ProtectedRoute>
                      <IntegrationsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/tasks"
                  element={
                    <ProtectedRoute>
                      <TasksPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/projects"
                  element={
                    <ProtectedRoute>
                      <ProjectListPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin/projects"
                  element={
                    <ProtectedRoute>
                      <ProjectListPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/projects/:id"
                  element={
                    <ProtectedRoute>
                      <ProjectWorkspacePage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/projects/:id/phase/:phaseSlug"
                  element={
                    <ProtectedRoute>
                      <ProjectWorkspacePage />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/admin/overview"
                  element={
                    <ProtectedRoute>
                      <OverviewPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin/audit"
                  element={
                    <ProtectedRoute>
                      <AuditManagementPage />
                    </ProtectedRoute>
                  }
                />
                {/* [SCOPE 021 / T017] Database ER Diagram viewer */}
                <Route
                  path="/admin/database/erdiagram"
                  element={
                    <ProtectedRoute>
                      <DatabaseErdPage />
                    </ProtectedRoute>
                  }
                />
                {/* [SCOPE 059 / T007] Per-scope Process Flow viewer */}
                <Route
                  path="/projects/:projectId/specs/:specId/process-flow"
                  element={
                    <ProtectedRoute>
                      <ScopeProcessFlowPage />
                    </ProtectedRoute>
                  }
                />
                {/* [SCOPE 060 / T012] Scope Analysis viewer — per-scope + project-wide */}
                <Route
                  path="/projects/:projectId/specs/:specId/scope-analysis"
                  element={
                    <ProtectedRoute>
                      <ScopeAnalysisPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/projects/:projectId/scope-analysis"
                  element={
                    <ProtectedRoute>
                      <ScopeAnalysisPage />
                    </ProtectedRoute>
                  }
                />

                {/* Spec 024: Pending Tasks by Scope (new tab) */}
                <Route
                  path="/admin/projects/:id/pending-tasks"
                  element={
                    <ProtectedRoute>
                      <PendingTasksPage />
                    </ProtectedRoute>
                  }
                />

                {/* Spec 025: Project Overview Builder — full-screen editor (FR-001, N1) */}
                <Route
                  path="/overview/:draftId"
                  element={
                    <ProtectedRoute>
                      <OverviewEditorPage />
                    </ProtectedRoute>
                  }
                />

                {/* 404 redirect */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </AuthProvider>
          </ErrorBoundary>
        </Router>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
