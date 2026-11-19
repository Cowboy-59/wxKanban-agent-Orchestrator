import express from "express";
import type { Express, Request, Response, NextFunction } from "express";
import cors from "cors";
import path from "node:path";
import { existsSync } from "node:fs";
import { logger } from "./lib/logger.js";
// [SCOPE 111 / Amendment A] Single source of truth for the build number — the
// same constant the pre-push hook bumps and the client renders.
import { APP_VERSION } from "~/client/version.js";

/** Process start time, so /api/version also answers "how long has this been up?" */
const SERVER_STARTED_AT = new Date().toISOString();
import { requireActiveSubscription } from "./middleware/requireActiveSubscription.js"; // [SCOPE 090 / T009]
import authRoutes from "./routes/auth.js";
import companyRoutes from "./routes/company.js";
import pmSystemsRoutes from "./routes/pmSystems.js";
import projectsRoutes from "./routes/projects.js";
import tasksRoutes from "./routes/tasks.js";
import settingsRoutes from "./routes/settings.js";
import agentTokenRoutes from "./routes/agentTokens.js"; // [SCOPE 134 / T026]
import agentGrantRoutes from "./routes/agentGrants.js"; // [SCOPE 134 / T027]
import agentConnectRoutes from "./routes/agentConnect.js"; // [SCOPE 134 / T028]
import agentDeviceRoutes from "./routes/agentDevices.js"; // [SCOPE 152 / T009]
import projectAgentRoutes from "./routes/projectAgent.js"; // [SCOPE 134 / T029]
import companyYappchattRoutes from "./routes/companyYappchatt.js"; // [SCOPE 144 / T006]
import { yappchattSyncObserver } from "./services/CompanyYappchattService.js"; // [SCOPE 144 / T007]
import changeImpactRoutes from "./routes/changeImpact.js"; // [SCOPE 137 / T014]
import impactModeRoutes from "./routes/impactMode.js"; // [SCOPE 137 / T019]
import teachingSkillsRoutes from "./routes/teachingSkills.js"; // [SCOPE 138 / T011]
import teamRoutes from "./routes/team.js";
import notificationsRoutes from "./routes/notifications.js";
import adminRoutes from "./routes/admin.js";
import stackProfilesRoutes from "./routes/stackProfiles.js"; // [SCOPE 057 / T004]
import projectThemeRoutes from "./routes/projectTheme.js"; // [SCOPE 062 / T004]
import companyThemeProfilesRoutes from "./routes/companyThemeProfiles.js"; // [SCOPE 062 / T013]
import themeTemplatesRoutes from "./routes/themeTemplates.js"; // [SCOPE 106 / T009]
import themeBlocksRoutes from "./routes/themeBlocks.js"; // [SCOPE 107 / T005]
import designSystemsRoutes from "./routes/designSystems.js"; // [SCOPE 116 / T001]
import eventsRoutes from "./routes/events.js";
import auditRoutes from "./routes/audit.js";
import sysadminRoutes from "./routes/sysadmin.js";
import sysadminAuditRoutes from "./routes/sysadminAudit.js"; // [SCOPE 147 / T006]
import { sysAdminAudit } from "./middleware/sysAdminAudit.js"; // [SCOPE 147 / T002]
import { SYSADMIN_WRITE_REGISTRY } from "./routes/sysAdminWriteRegistry.js"; // [SCOPE 147 / T004]
import projectLifecycleRoutes from "./routes/projectLifecycle.js";
import helpCatalogRoutes from "./routes/helpCatalog.js"; // [SCOPE 084 / T003,T004]
import databaseErdRoutes from "./routes/databaseErd.js"; // [SCOPE 021 / T013]
import scopeProcessFlowRoutes from "./routes/scopeProcessFlow.js"; // [SCOPE 059 / T005]
import projectScopeFlowRoutes from "./routes/projectScopeFlow.js"; // [SCOPE 073 / T009]
import portfolioAnalyzerRoutes from "./routes/portfolioAnalyzer.js"; // [SCOPE 075 / T4,6]
import scopeAnalysisRoutes from "./routes/scopeAnalysis.js"; // [SCOPE 060 / T011]
import errorCaptureRoutes from "./routes/errorCapture.js"; // [SCOPE 061]
import communityRoutes from "./routes/community.js"; // [SCOPE 079 / FR-008]
import projectErrorIngestRoutes from "./routes/projectErrorIngest.js"; // [SCOPE 063]
import projectBugTrappingRoutes from "./routes/projectBugTrapping.js"; // [SCOPE 063]
import projectBugReportsRoutes from "./routes/projectBugReports.js"; // [SCOPE 063]
import testPlanRoutes from "./routes/testplans.js"; // [SCOPE 111]
import projectLearningsRoutes from "./routes/projectLearnings.js";
import overviewRoutes from "./routes/overview.js";
import aiAuditRoutes from "./routes/ai-audit.js";
import syncRoutes from "./routes/sync.js";
import paymentRoutes from "./routes/payment.js";
import helpRoutes from "./routes/help.js";
import kitRoutes from "./routes/kitRoutes.js";
// adminTokensRoutes removed per spec 028 Phase 11 (2026-05-23):
// tokens are issued by the kit-download flow, not by an admin UI.
import timeTrackingRoutes from "./routes/timeTracking.js";
import timeBillingRoutes from "./routes/timeBilling.js"; // [SCOPE 005 / T012]
import agentRunsRoutes from "./routes/agentRuns.js"; // [SCOPE 143 / T024]
import consultantHubRoutes from "./routes/consultantHub.js";
import consultantDashboardRoutes from "./routes/consultantDashboard.js";
import consultantCustomersRoutes from "./routes/consultantCustomers.js"; // [SCOPE 119 / T004]
import consultantConnectionsRoutes from "./routes/consultantConnections.js"; // [SCOPE 017 / T102]
import proposalRoutes from "./routes/proposals.js";
import pendingTaskRoutes from "./routes/pendingTasks.js";
import webhooksRoutes from "./routes/webhooks.js";
import invitationsRoutes from "./routes/invitations.js";
import teamRoleRoutes from "./routes/team-role.js";
import engagementsRoutes from "./routes/engagements.js";
import marketingRoutes from "./routes/marketing.js"; // [SCOPE 046 / T002]
import marketingAdminRoutes from "./routes/marketingAdmin.js"; // [SCOPE 046 / T004]
import newsletterRoutes from "./routes/newsletter.js"; // [SCOPE 064 / T006]
import welcomeRoutes from "./routes/welcome.js"; // [SCOPE 109 / T004]
import marketingAiRoutes from "./routes/marketingAi.js"; // [SCOPE 065 / T003]
import marketingBannersRoutes from "./routes/marketingBanners.js"; // [SCOPE 070 / T005]
import marketingLinksRoutes from "./routes/marketingLinks.js"; // [SCOPE 070 / T004]
import { publicRouter as featureSnippetsPublic, adminRouter as featureSnippetsAdmin } from "./routes/marketingFeatureSnippets.js"; // [SCOPE 096]
import redirectRoutes from "./routes/redirect.js"; // [SCOPE 070 / T001] /r/:code
import faqRoutes from "./routes/faq.js"; // [SCOPE 066 / T005]
import bioRouter from "./routes/bio.js"; // [SCOPE 100 / T006]
import bioAdminRouter from "./routes/bioAdmin.js"; // [SCOPE 100 / T008]
import { config } from "./config.js";

export function createApp(): Express {
  const app: Express = express();

  app.use(
    cors({
      origin: config.CLIENT_URL,
      credentials: true,
    }),
  );

  // IMPORTANT: webhooks must mount BEFORE express.json() so the raw body is
  // preserved for Stripe signature verification (spec 023 FR-006 / Chunk C).
  app.use("/api/webhooks", webhooksRoutes);

  // 2mb limit accommodates base64 file payloads for the Project Overview import
  // flow (spec 025 FR-014). The /import route enforces the real 500k-char
  // ceiling after decode (C18) — this is just the HTTP envelope cap.
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true, limit: "2mb" }));

  const clientDistPath = path.resolve(process.cwd(), "dist", "client");
  const clientIndexPath = path.join(clientDistPath, "index.html");

  // [SCOPE 141 / T017] BEGIN — Old help URLs redirect to the Manual
  // Registered before the static middleware below, which would otherwise serve the old files
  // that are still in public/.
  app.get("/gettingStartedInstructions.html", (_req: Request, res: Response) => {
    res.redirect(301, "/manual/getting-started");
  });
  app.get(/^\/help(\.[a-z]{2})?\.pdf$/, (_req: Request, res: Response) => {
    res.redirect(301, "/manual/wxKanban-Manual.pdf");
  });
  // [SCOPE 141 / T017] END

  // [SCOPE 141 / T015] BEGIN — The Manual's Customer edition at /manual
  // Public, and mounted ahead of the subscription gate and the SPA fallback so index.html never
  // swallows it. `extensions` lets /manual/projects resolve to projects.html.
  const manualPath = path.join(clientDistPath, "manual");
  if (existsSync(manualPath)) {
    app.use("/manual", express.static(manualPath, { extensions: ["html"] }));
  }
  // [SCOPE 141 / T015] END

  if (process.env.NODE_ENV === "production" && existsSync(clientIndexPath)) {
    app.use(express.static(clientDistPath));
  }

  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // [SCOPE 111 / Amendment A] Report the REAL build, not a placeholder.
  //
  // This returned a hardcoded "0.1.0" — three years of releases and every one of
  // them claimed to be 0.1.0 — so the ordinary way to answer "what is actually
  // deployed right now?" did not work, and verifying a deploy meant grepping the
  // served client bundle for a version string. APP_VERSION is bumped by the
  // pre-push hook on every push to main, so it is the honest answer.
  app.get("/api/version", (_req: Request, res: Response) => {
    res.json({
      version: APP_VERSION,
      environment: process.env.NODE_ENV || "development",
      // Set by the deploy pipeline where available; null locally.
      commit: process.env.GIT_COMMIT ?? process.env.APPRUNNER_COMMIT ?? null,
      startedat: SERVER_STARTED_AT,
    });
  });

  // [SCOPE 090 / T009] Subscription gate (Amendment A, FR-009). Mounted ahead of
  // every feature router so no route can forget it; auth and payment are exempt
  // inside the middleware so a blocked customer can still sign in and pay.
  // Inert unless SUBSCRIPTION_GATE_ENFORCE is set to `log` or `on`.
  app.use(requireActiveSubscription);

  // [SCOPE 144 / T007] Membership sync after user and engagement changes. Watches the
  // response finish, so it never blocks or fails the routes it follows.
  app.use(yappchattSyncObserver);
  app.use("/api/auth", authRoutes);
  // [SCOPE 134 / T026] Agent admission tickets. requireAdmin on every mutating route.
  // MUST precede companyRoutes: its GET /:id stub answers GET /agent-tokens with a
  // 200 and no `tokens`, which crashed the Company tab of Settings.
  app.use("/api/company/agent-tokens", agentTokenRoutes);
  // [SCOPE 152 / T009] K.A.I.N. device lists and revoke (web session). Precedes companyRoutes for
  // the same reason: /api/company/agent-devices must not fall into its GET /:id stub.
  app.use("/api", agentDeviceRoutes);
  // [SCOPE 144 / T006] Company YappChatt account. Same reason to precede companyRoutes.
  app.use("/api/company/yappchatt", companyYappchattRoutes);
  app.use("/api/company", companyRoutes);
  app.use("/api/pm-systems", pmSystemsRoutes);
  app.use("/api/projects", projectsRoutes);
  app.use("/api/projects", kitRoutes);
  app.use("/api/tasks", tasksRoutes);
  app.use("/api/settings", settingsRoutes);
  // [SCOPE 134 / T027] Per-project agent grants. Own path, NOT PATCH /api/projects/:id,
  // which any authenticated company user may call.
  app.use("/api/projects", agentGrantRoutes);
  // [SCOPE 137 / T014] Read-only Change Impact agreement log; applies its own tenant gate.
  app.use("/api/projects", changeImpactRoutes);
  // [SCOPE 137 / T019] The owner-set Change Impact mode; own tenant gate, owner-or-admin to change.
  app.use("/api/projects", impactModeRoutes);
  // [SCOPE 134 / T028] Agent-facing: authenticated by a Company Access Token, not a session.
  app.use("/api/agent", agentConnectRoutes);
  // [SCOPE 134 / T029] The kit project agent binds its supervised room with its project token.
  app.use("/api/project-agent", projectAgentRoutes);
  app.use("/api/team", teamRoutes);
  app.use("/api/notifications", notificationsRoutes);
  app.use("/api/admin", adminRoutes);
  // [SPEC 028 / Phase 11] /api/admin/projects/:projectid/tokens removed —
  // tokens are issued automatically by the kit-download flow.
  app.use("/api/events", eventsRoutes);
  app.use("/api/audit", auditRoutes);
  // [SCOPE 147 / T002] every SysAdmin write is recorded: the audit runs ahead of all /api/sysadmin routers
  app.use("/api/sysadmin", sysAdminAudit(SYSADMIN_WRITE_REGISTRY));
  app.use("/api/sysadmin/audit", sysadminAuditRoutes); // [SCOPE 147 / T006]
  app.use("/api/sysadmin", sysadminRoutes);
  app.use("/api/sysadmin/marketing/newsletter", newsletterRoutes); // [SCOPE 064 / T006]
  app.use("/api/sysadmin/marketing/welcome", welcomeRoutes); // [SCOPE 109 / T004]
  app.use("/api/sysadmin/marketing/ai", marketingAiRoutes); // [SCOPE 065 / T003]
  app.use("/api/sysadmin/marketing/banners", marketingBannersRoutes); // [SCOPE 070 / T005]
  app.use("/api/sysadmin/marketing/links", marketingLinksRoutes); // [SCOPE 070 / T004]
  app.use("/api/sysadmin/marketing/feature-snippets", featureSnippetsAdmin); // [SCOPE 096] before the broad marketing admin router
  app.use("/api/sysadmin/marketing/bio", bioAdminRouter); // [SCOPE 100 / T008] before the broad marketing admin router
  app.use("/api/sysadmin/marketing", marketingAdminRoutes); // [SCOPE 046 / T004]
  app.use("/api/marketing/feature-snippets", featureSnippetsPublic); // [SCOPE 096] public carousel read, before the broad marketing router
  app.use("/api/marketing", marketingRoutes); // [SCOPE 046 / T002] public lead capture + newsletter unsubscribe
  app.use("/api/faq", faqRoutes); // [SCOPE 066 / T005] authenticated FAQ read + ask
  app.use("/api/bio", bioRouter); // [SCOPE 100 / T006] public founder bio, resolved by locale
  app.use("/", redirectRoutes); // [SCOPE 070 / T001] /r/:code public tracked redirect (before SPA catch-all)
  app.use("/", projectLifecycleRoutes);
  app.use("/", helpCatalogRoutes); // [SCOPE 084 / T003,T004] before /api/help articles router
  app.use("/", databaseErdRoutes); // [SCOPE 021 / T013]
  app.use("/", scopeProcessFlowRoutes); // [SCOPE 059 / T005]
  app.use("/", projectScopeFlowRoutes); // [SCOPE 073 / T009]
  app.use("/", portfolioAnalyzerRoutes); // [SCOPE 075 / T4,6]
  app.use("/", scopeAnalysisRoutes); // [SCOPE 060 / T011]
  app.use("/", errorCaptureRoutes); // [SCOPE 061]
  app.use("/", communityRoutes); // [SCOPE 079 / FR-008] community-chat session broker
  app.use("/", projectErrorIngestRoutes); // [SCOPE 063] per-project token-auth ingest
  app.use("/", projectBugTrappingRoutes); // [SCOPE 063] install bug-trapping scope
  app.use("/", projectBugReportsRoutes); // [SCOPE 063] per-project triage API
  app.use("/", testPlanRoutes); // [SCOPE 111] test suite lifecycle: suite, runs, cycles, gate
  app.use("/", projectLearningsRoutes);
  app.use("/api/overview", overviewRoutes);
  app.use("/api/ai-audit", aiAuditRoutes);
  app.use("/api/sync", syncRoutes);
  app.use("/api/payment", paymentRoutes);
  // [SCOPE 138 / T011] "Learn wxKanban with your AI" — read-only; ahead of the help router.
  app.use("/api/help/teaching-skills", teachingSkillsRoutes);
  app.use("/api/help", helpRoutes);
  app.use("/api/time-tracking", timeTrackingRoutes);
  // [SCOPE 005 / T012] Time & Billing: ADMIN on SMALL_BUSINESS+ only, guarded inside the router.
  app.use("/api/time-billing", timeBillingRoutes);
  // [SCOPE 143 / T024] Agent runs, ahead of the consultant-hub router: POST also takes a project
  // API token (the kit's forwarder), which the hub router's JWT-only middleware would refuse.
  app.use("/api/consultant-hub/agent-runs", agentRunsRoutes);
  app.use("/api/consultant-hub", consultantHubRoutes);
  app.use("/api/consultant", consultantDashboardRoutes); // [SCOPE 017 / T047]
  app.use("/api/consultant", consultantCustomersRoutes); // [SCOPE 119 / T004]
  app.use("/api/consultant", consultantConnectionsRoutes); // [SCOPE 017 / T102]
  app.use("/api/admin/proposals", proposalRoutes);
  app.use("/api/admin/pending-tasks", pendingTaskRoutes);
  app.use("/api/admin/stack-profiles", stackProfilesRoutes); // [SCOPE 057 / T004]
  app.use("/", projectThemeRoutes); // [SCOPE 062 / T004] theme GET/PUT/presets/execute
  app.use("/api/admin/theme-profiles", companyThemeProfilesRoutes); // [SCOPE 062 / T013]
  app.use("/", themeTemplatesRoutes); // [SCOPE 106 / T009] theme templates gallery + apply
  app.use("/", themeBlocksRoutes); // [SCOPE 107 / T005] block library
  // [SCOPE 116 / T001] Curated design-system catalog (GLOBAL — no tenant filter by design).
  app.use("/", designSystemsRoutes);
  app.use("/api/invitations", invitationsRoutes);
  app.use("/api", teamRoleRoutes);
  app.use("/api/engagements", engagementsRoutes);

  if (process.env.NODE_ENV === "production" && existsSync(clientIndexPath)) {
    app.get(/^\/(?!api\b).*/, (_req: Request, res: Response) => {
      res.sendFile(clientIndexPath);
    });
  }

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error({ err }, "Unhandled error");
    res.status(500).json({
      error: "Internal server error",
      message: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  });

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: "Not found" });
  });

  return app;
}
