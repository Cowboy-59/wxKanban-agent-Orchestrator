import { Router, Response } from "express";
import {
  authenticateToken,
  requireAuth,
  AuthRequest,
} from "../middleware/auth.js";
import { projectInCompany } from "./projectTheme.js";
import {
  ProjectBugReportService,
  REPORT_STATUSES,
  type ReportStatus,
} from "../services/ProjectBugReportService.js";
import { BugSuggestionService } from "../services/BugSuggestionService.js";
import { createLogger } from "../lib/logger.js";

const router = Router();
const logger = createLogger("project-bug-reports-routes");

// [SCOPE 063 / T009] BEGIN — per-project Bug Reports triage API (customer-facing)
// All routes are tenant-guarded (projectInCompany) and visible to any member of
// the project's company. Disposition / accept-to-scope stay SysAdmin-only and
// are NOT exposed here.

const SUGGEST_THROTTLE_MS = 5 * 60_000; // soft throttle; ?force=true overrides

async function guard(req: AuthRequest, res: Response): Promise<string | null> {
  const companyId = req.companyid;
  if (!companyId) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  const projectId = String(req.params.id);
  if (!(await projectInCompany(projectId, companyId))) {
    res.status(404).json({ error: "Project not found" });
    return null;
  }
  return projectId;
}

// GET /api/projects/:id/bug-reports — list this project's reports (default auto/error).
router.get(
  "/api/projects/:id/bug-reports",
  authenticateToken,
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const projectId = await guard(req, res);
    if (!projectId) return;
    try {
      // [SCOPE 063 fix] status absent -> hide resolved; 'all' -> everything;
      // specific -> that status. counts (all statuses) drive the filter chips.
      const source = req.query.source ? String(req.query.source) : "auto";
      const type = req.query.type ? String(req.query.type) : "error";
      const status = req.query.status ? String(req.query.status) : undefined;
      const [items, counts] = await Promise.all([
        ProjectBugReportService.list(projectId, { status, source, type }),
        ProjectBugReportService.counts(projectId, { source, type }),
      ]);
      return res.json({ items, counts });
    } catch (err) {
      logger.error({ err, projectId }, "Failed to list bug reports");
      return res.status(500).json({ error: "Failed to list bug reports" });
    }
  },
);

// GET /api/projects/:id/bug-reports/:reportId — single report (ownership-checked).
router.get(
  "/api/projects/:id/bug-reports/:reportId",
  authenticateToken,
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const projectId = await guard(req, res);
    if (!projectId) return;
    try {
      const row = await ProjectBugReportService.get(projectId, String(req.params.reportId));
      if (!row) return res.status(404).json({ error: "Report not found" });
      return res.json({ report: row });
    } catch (err) {
      logger.error({ err, projectId }, "Failed to get bug report");
      return res.status(500).json({ error: "Failed to get bug report" });
    }
  },
);

// PATCH /api/projects/:id/bug-reports/:reportId/status — transition status (any member).
router.patch(
  "/api/projects/:id/bug-reports/:reportId/status",
  authenticateToken,
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const projectId = await guard(req, res);
    if (!projectId) return;
    const status = String(req.body?.status ?? "") as ReportStatus;
    if (!REPORT_STATUSES.includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }
    try {
      const updated = await ProjectBugReportService.setStatus(projectId, String(req.params.reportId), status, {
        declineReason: req.body?.declineReason ? String(req.body.declineReason) : undefined,
      });
      if (!updated) return res.status(404).json({ error: "Report not found" });
      return res.json({ report: updated });
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes("declineReason")) return res.status(400).json({ error: msg });
      logger.error({ err, projectId }, "Failed to set status");
      return res.status(500).json({ error: "Failed to set status" });
    }
  },
);

// POST /api/projects/:id/bug-reports/:reportId/note — append an internal note.
router.post(
  "/api/projects/:id/bug-reports/:reportId/note",
  authenticateToken,
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const projectId = await guard(req, res);
    if (!projectId) return;
    const note = String(req.body?.note ?? "").trim();
    if (!note) return res.status(400).json({ error: "note is required" });
    try {
      const updated = await ProjectBugReportService.addNote(projectId, String(req.params.reportId), note);
      if (!updated) return res.status(404).json({ error: "Report not found" });
      return res.json({ report: updated });
    } catch (err) {
      logger.error({ err, projectId }, "Failed to add note");
      return res.status(500).json({ error: "Failed to add note" });
    }
  },
);

// POST /api/projects/:id/bug-reports/:reportId/suggest — AI-suggested fix.
// Soft-throttled (returns the cached suggestion within the window) unless
// ?force=true. Fail-open: an LLM failure returns the report unchanged, never 5xx.
router.post(
  "/api/projects/:id/bug-reports/:reportId/suggest",
  authenticateToken,
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const projectId = await guard(req, res);
    if (!projectId) return;
    const reportId = String(req.params.reportId);
    const force = String(req.query.force ?? req.body?.force ?? "") === "true";
    try {
      const report = await ProjectBugReportService.get(projectId, reportId);
      if (!report) return res.status(404).json({ error: "Report not found" });

      // Soft throttle: reuse a recent suggestion unless forced.
      if (!force && report.suggestedat) {
        const age = Date.now() - new Date(report.suggestedat).getTime();
        if (age < SUGGEST_THROTTLE_MS) {
          return res.json({ report, throttled: true });
        }
      }

      const details = report.details as Record<string, unknown> | null;
      const context = report.context as Record<string, unknown> | null;
      const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
      const suggestion = await BugSuggestionService.suggest({
        title: report.title,
        name: str(details?.name),
        message: str(details?.message),
        stack: str(details?.stack),
        kind: str(details?.kind),
        route: str(context?.route),
        appVersion: str(context?.appVersion),
      });

      if (!suggestion) {
        // Fail-open: leave columns untouched, signal soft failure.
        return res.json({ report, suggested: false });
      }
      const updated = await ProjectBugReportService.saveSuggestion(projectId, reportId, suggestion);
      return res.json({ report: updated, suggested: true });
    } catch (err) {
      logger.warn({ err: (err as Error).message, projectId }, "suggest failed (soft)");
      return res.status(200).json({ suggested: false }); // never 5xx
    }
  },
);

// POST /api/projects/:id/bug-reports/:reportId/create-task — turn into a task (US4).
router.post(
  "/api/projects/:id/bug-reports/:reportId/create-task",
  authenticateToken,
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const projectId = await guard(req, res);
    if (!projectId) return;
    const userId = req.userid;
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    try {
      const result = await ProjectBugReportService.createTask(projectId, String(req.params.reportId), userId);
      if (!result) return res.status(404).json({ error: "Report not found" });
      return res.json(result);
    } catch (err) {
      logger.error({ err, projectId }, "Failed to create task from report");
      return res.status(500).json({ error: "Failed to create task" });
    }
  },
);
// [SCOPE 063 / T009] END

export default router;
