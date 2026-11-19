console.log("[DEBUG] VERY FIRST LINE OF index2.ts");
import express, { Express, Request, Response, NextFunction } from "express";
import cors from "cors";
import path from "node:path";
import { existsSync } from "node:fs";
/*import { logger } from "./lib/logger.js";
import authRoutes from "./routes/auth.js";
import companyRoutes from "./routes/company.js";
import pmSystemsRoutes from "./routes/pmSystems.js";
import projectsRoutes from "./routes/projects.js";
import tasksRoutes from "./routes/tasks.js";
import settingsRoutes from "./routes/settings.js";
import teamRoutes from "./routes/team.js";
import notificationsRoutes from "./routes/notifications.js";
import adminRoutes from "./routes/admin.js";
// adminTokensRoutes removed per spec 028 Phase 11 (2026-05-23).
import eventsRoutes from "./routes/events.js";
import auditRoutes from "./routes/audit.js";
import sysadminRoutes from "./routes/sysadmin.js";
import overviewRoutes from "./routes/overview.js";
import aiAuditRoutes from "./routes/ai-audit.js";
import syncRoutes from "./routes/sync.js";
import paymentRoutes from "./routes/payment.js";
import helpRoutes from "./routes/help.js";
import kitRoutes from "./routes/kitRoutes.js";
import gatewayRoutes from "./routes/gateway.js";
import driftRoutes from "./routes/drift.js";
import updatesRoutes from "./routes/updates.js";
import parityRoutes from "./routes/parity.js";
import consultantHubRoutes from "./routes/consultantHub.js";
import timeTrackingRoutes from "./routes/timeTracking.js";
import { pgNotifyListener } from "./lib/pgNotifyListener.js";
import { shutdownScheduler } from "./services/jobScheduler.js";
import {
  initializeInactivityMonitoring,
  shutdownInactivityMonitoring,
} from "./services/inactivityService.js";*/
import { config } from "./config.js";

const app: Express = express();

// Middleware
app.use(
  cors({
    origin: config.CLIENT_URL,
    credentials: true,
  }),
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve built SPA assets when running in production/App Runner.
const clientDistPath = path.resolve(process.cwd(), "dist", "client");
const clientIndexPath = path.join(clientDistPath, "index.html");
if (process.env.NODE_ENV === "production" && existsSync(clientIndexPath)) {
  app.use(express.static(clientDistPath));
}

// Health check endpoint
app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// API version check
app.get("/api/version", (_req: Request, res: Response) => {
  res.json({
    version: "0.1.0",
    environment: process.env.NODE_ENV || "development",
  });
});

// Routes
/*app.use("/api/auth", authRoutes);
app.use("/api/company", companyRoutes);
app.use("/api/pm-systems", pmSystemsRoutes);
app.use("/api/projects", projectsRoutes);
app.use("/api/projects", kitRoutes);
app.use("/api/tasks", tasksRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/team", teamRoutes);
app.use("/api/notifications", notificationsRoutes);
app.use("/api/admin", adminRoutes);
// [SPEC 028 / Phase 11] hosted-MCP token admin CRUD removed.
app.use("/api/events", eventsRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api/sysadmin", sysadminRoutes);
app.use("/api/overview", overviewRoutes);
app.use("/api/ai-audit", aiAuditRoutes);
app.use("/api/sync", syncRoutes);
app.use("/api/payment", paymentRoutes);
app.use("/api/help", helpRoutes);
app.use("/api/gateway", gatewayRoutes);
app.use("/api/drift", driftRoutes);
app.use("/api/updates", updatesRoutes);
app.use("/api/parity", parityRoutes);
app.use("/api/consultant-hub", consultantHubRoutes);
app.use("/api/time-tracking", timeTrackingRoutes);*/

 if (process.env.NODE_ENV === "production" && existsSync(clientIndexPath)) {
  app.get(/^\/(?!api\b).*/, (_req: Request, res: Response) => {
    res.sendFile(clientIndexPath);
  });
} 


// Error handling middleware
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err }, "Unhandled error");
  res.status(500).json({
    error: "Internal server error",
    message: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Not found" });
});

function startServer() {
  console.log("[DEBUG] Entered startServer()");
  const port = config.PORT;
  let server;
  try {
    console.log("[DEBUG] Before app.listen");
    server = app.listen(port, () => {
      console.log("[DEBUG] app.listen callback - server started on port", port);
      // Simulate async startup logic
      // console.log("[DEBUG] After async startup logic");
    });
    console.log("[DEBUG] After app.listen (sync)");
    server.on("error", (error) => {
      console.log("[DEBUG] server.on('error')", error);
    });
  } catch (err) {
    console.log("[DEBUG] Caught error in startServer", err);
  }
}

startServer();

console.log("[DEBUG] startServer() called");

export default app;

