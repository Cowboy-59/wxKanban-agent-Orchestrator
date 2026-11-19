import { Router, Response } from "express";
import { z } from "zod";
import { authenticateToken, requireAuth, AuthRequest } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { validateBody, validateQuery } from "../middleware/validation.js";
import { createLogger } from "../lib/logger.js";
import { parseUuidFilter, parseRequiredUuid } from "../lib/queryParams.js";
import {
  guardFor,
  isSysAdminCaller,
  recordAuditLibraryWrite,
  canReadProjectCompliance,
  ownsProject,
  PROJECT_NOT_FOUND,
} from "./auditAccess.js"; // [SCOPE 146 / T002, T009]

import * as AuditConfigService from "../services/AuditConfigService.js";
import * as DocumentService from "../services/DocumentService.js";
import * as AuditTaskService from "../services/AuditTaskService.js";
import * as AuditEngineService from "../services/AuditEngineService.js";
import * as ReportService from "../services/ReportService.js";

const logger = createLogger("audit-routes");
const router = Router();

// All audit routes require authentication (authenticateToken parses JWT, requireAuth checks it)
router.use(authenticateToken);
router.use(requireAuth);

// ============================================================================
// Audit Configuration Routes
// ============================================================================

/**
 * GET /api/audit/config
 *
 * SPEC-112 / FR-001, FR-003 — compliance enablement is per PROJECT. Pass
 * `?projectId=` to read that project's configuration, creating an all-disabled
 * row on first access.
 *
 * Omitting `projectId` falls back to the legacy company-wide row. That path is
 * retained only until the UI cutover (T008) lands and will be removed with
 * `companyprojects.audittype`.
 */
router.get("/config", async (req: AuthRequest, res: Response, next) => {
  try {
    // [SCOPE 117 / T003] BEGIN — validate projectId at the boundary
    const projectIdParsed = parseUuidFilter(req.query.projectId, "projectId");
    if (!projectIdParsed.ok) {
      res.status(400).json({ error: projectIdParsed.message });
      return;
    }
    const projectId = projectIdParsed.value;
    // [SCOPE 117 / T003] END

    // [SCOPE 146 / T009] MODIFIED-BY — a project's settings are read only by its tenant (owner,
    // engagement grant) or a SYSADMIN; anyone else gets the unknown-project 404 (FR-009)
    if (projectId) {
      if (!(await canReadProjectCompliance(req, projectId))) {
        res.status(404).json(PROJECT_NOT_FOUND);
        return;
      }
      const config = await AuditConfigService.getOrCreateAuditConfigByProject(projectId);
      res.json({ success: true, data: config, scope: "project" });
      return;
    }

    const companyId = req.companyid;
    if (!companyId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    const config = await AuditConfigService.getOrCreateAuditConfig(companyId);

    res.json({
      success: true,
      data: config,
      scope: "company",
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/audit/config
 * Update audit configuration
 */
const updateConfigSchema = z.object({
  soc2enabled: z.boolean().optional(),
  hipaaenabled: z.boolean().optional(),
  hitrustenabled: z.boolean().optional(),
  gdprenabled: z.boolean().optional(),
  nistssdfenabled: z.boolean().optional(),
  iso27001enabled: z.boolean().optional(),
  autoauditondeploy: z.boolean().optional(),
  autoauditschedule: z.enum(["daily", "weekly", "monthly"]).optional(),
  auditseveritythreshold: z.enum(["low", "medium", "high", "critical"]).optional(),
  failoncritical: z.boolean().optional(),
  auditreportretentiondays: z.number().int().min(30).max(2555).optional(),
});

// FR-003 — only ADMIN may change framework enablement. The panel already
// disables the controls client-side for non-admins; this enforces it server-side.
router.put("/config", requireAdmin, validateBody(updateConfigSchema), async (req: AuthRequest, res: Response, next) => {
  try {
    // [SCOPE 117 / T003] BEGIN — validate projectId at the boundary
    const projectIdParsed = parseUuidFilter(req.query.projectId, "projectId");
    if (!projectIdParsed.ok) {
      res.status(400).json({ error: projectIdParsed.message });
      return;
    }
    const projectId = projectIdParsed.value;
    // [SCOPE 117 / T003] END

    // [SCOPE 146 / T009] MODIFIED-BY — only an ADMIN of the project's owner company may change its
    // frameworks; any other company (consulting included) gets the unknown-project 404 (FR-009)
    if (projectId) {
      if (!(await ownsProject(req, projectId))) {
        res.status(404).json(PROJECT_NOT_FOUND);
        return;
      }
      await AuditConfigService.getOrCreateAuditConfigByProject(projectId);
      const config = await AuditConfigService.updateAuditConfigByProject(projectId, req.body);
      res.json({ success: true, data: config, scope: "project" });
      return;
    }

    const companyId = req.companyid;
    if (!companyId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    const config = await AuditConfigService.updateAuditConfig(companyId, req.body);

    res.json({
      success: true,
      data: config,
      scope: "company",
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Document Management Routes
// ============================================================================

/**
 * GET /api/audit/documents
 * List compliance documents
 */
const listDocumentsSchema = z.object({
  documenttype: z.string().optional(),
  framework: z.string().optional(),
  status: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

router.get("/documents", validateQuery(listDocumentsSchema), async (req: AuthRequest, res: Response, next) => {
  try {
    // [SCOPE 146 / T003] MODIFIED-BY — a non-SYSADMIN lists framework rule documents only
    const documents = await DocumentService.listDocuments({
      documenttype: req.query.documenttype as string,
      framework: req.query.framework as string,
      status: req.query.status as string,
      limit: Number(req.query.limit),
      offset: Number(req.query.offset),
      frameworkOnly: !isSysAdminCaller(req),
    });

    res.json({
      success: true,
      data: documents,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/audit/documents
 * Upload a new compliance document
 */
const uploadDocumentSchema = z.object({
  documenttype: z.string(),
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  filename: z.string().optional(),
  filecontent: z.string(),
  framework: z.string().optional(),
  version: z.string().optional(),
  effectivedate: z.string().datetime().optional(),
});

router.post("/documents", ...guardFor("POST /documents"), validateBody(uploadDocumentSchema), async (req: AuthRequest, res: Response, next) => {
  // [SCOPE 146 / T002] MODIFIED-BY — SYSADMIN only (FR-001); the upload is recorded (FR-005)
  try {
    const userId = req.userid;
    if (!userId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    const document = await DocumentService.uploadDocument(
      {
        ...req.body,
        effectivedate: req.body.effectivedate ? new Date(req.body.effectivedate) : undefined,
      },
      userId,
    );
    await recordAuditLibraryWrite(req, "audit_document_uploaded", `Compliance document uploaded: ${document.title}`, {
      newvalue: { documentId: document.id, documenttype: document.documenttype, framework: document.framework, title: document.title },
    });

    res.status(201).json({
      success: true,
      data: document,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/audit/documents/:id/extract
 * Replace a document's compliance tasks with a fresh extraction
 */
router.post("/documents/:id/extract", ...guardFor("POST /documents/:id/extract"), async (req: AuthRequest, res: Response, next) => {
  // [SCOPE 146 / T004] MODIFIED-BY — SYSADMIN only; replaces instead of appending; 404 missing, 422 empty parse; recorded
  try {
    const documentId = req.params.id;
    const document = await DocumentService.getDocument(documentId);
    if (!document) {
      res.status(404).json({ success: false, error: "Document not found" });
      return;
    }

    let extraction: AuditTaskService.ExtractionResult;
    try {
      extraction = await AuditTaskService.extractTasksFromDocument(documentId);
    } catch (error) {
      if (error instanceof AuditTaskService.NoTasksExtractedError) {
        res.status(422).json({ success: false, error: error.message });
        return;
      }
      throw error;
    }
    await recordAuditLibraryWrite(
      req,
      "audit_document_tasks_replaced",
      `Compliance tasks replaced for ${document.title}: ${extraction.tasksRemoved} removed, ${extraction.tasksExtracted} extracted`,
      { newvalue: { documentId, ...extraction } },
    );

    res.json({
      success: true,
      data: {
        documentId,
        tasksRemoved: extraction.tasksRemoved,
        tasksExtracted: extraction.tasksExtracted,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/audit/documents/search
 * Search documents using full-text search.
 * Registered before /documents/:id — after it, "search" was captured as an id and this route never ran.
 */
router.get("/documents/search", async (req: AuthRequest, res: Response, next) => {
  // [SCOPE 146 / T003] MODIFIED-BY — moved above /documents/:id; a non-SYSADMIN searches framework documents only
  try {
    const query = req.query.q as string;

    if (!query || query.length < 2) {
      res.status(400).json({
        success: false,
        error: "Search query must be at least 2 characters",
      });
      return;
    }

    const documents = await DocumentService.searchDocuments(query, { frameworkOnly: !isSysAdminCaller(req) });

    res.json({
      success: true,
      data: documents,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/audit/documents/:id
 * Get a single document
 */
router.get("/documents/:id", async (req: AuthRequest, res: Response, next) => {
  // [SCOPE 146 / T003] MODIFIED-BY — an internal document answers 404 to a non-SYSADMIN, same body as a missing one
  try {
    const document = await DocumentService.getDocument(req.params.id, { frameworkOnly: !isSysAdminCaller(req) });

    if (!document) {
      res.status(404).json({
        success: false,
        error: "Document not found",
      });
      return;
    }

    res.json({
      success: true,
      data: document,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/audit/documents/:id
 * Delete a document (its compliance tasks cascade with it)
 */
router.delete("/documents/:id", ...guardFor("DELETE /documents/:id"), async (req: AuthRequest, res: Response, next) => {
  // [SCOPE 146 / T002] MODIFIED-BY — SYSADMIN only (FR-001); 404 when missing; the deletion is recorded with what it held (FR-005)
  try {
    const document = await DocumentService.getDocument(req.params.id);
    if (!document) {
      res.status(404).json({ success: false, error: "Document not found" });
      return;
    }
    const tasksRemoved = await AuditTaskService.countTasksForDocument(document.id);
    await DocumentService.deleteDocument(req.params.id);
    await recordAuditLibraryWrite(req, "audit_document_deleted", `Compliance document deleted: ${document.title}`, {
      previousvalue: {
        documentId: document.id,
        documenttype: document.documenttype,
        framework: document.framework,
        title: document.title,
        tasksRemoved,
      },
    });

    res.json({
      success: true,
      message: "Document deleted",
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Audit Task Routes
// ============================================================================

/**
 * GET /api/audit/tasks
 * List compliance tasks
 */
const listTasksSchema = z.object({
  framework: z.string().optional(),
  category: z.string().optional(),
  priority: z.string().optional(),
  tasktype: z.string().optional(),
  isautomated: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

router.get("/tasks", validateQuery(listTasksSchema), async (req: AuthRequest, res: Response, next) => {
  try {
    const companyId = req.companyid;
    if (!companyId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    const config = await AuditConfigService.getAuditConfig(companyId);
    const enabledFrameworks = config
      ? [
          config.soc2enabled && "SOC2",
          config.hipaaenabled && "HIPAA",
          config.hitrustenabled && "HITRUST",
          config.gdprenabled && "GDPR",
        ].filter(Boolean) as string[]
      : [];

    const tasks = await AuditTaskService.listTasks({
      framework: req.query.framework as string,
      category: req.query.category as string,
      priority: req.query.priority as string,
      tasktype: req.query.tasktype as string,
      isautomated: req.query.isautomated === "true",
      enabledFrameworks,
      limit: Number(req.query.limit),
      offset: Number(req.query.offset),
    });

    res.json({
      success: true,
      data: tasks,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/audit/tasks/relevant
 * Get tasks relevant to a feature
 */
router.get("/tasks/relevant", async (req: AuthRequest, res: Response, next) => {
  try {
    // [SCOPE 112 / T009] MODIFIED-BY — re-scoped from req.companyid to a project
    // parameter. Framework enablement is per-project as of FR-001, so resolving the
    // caller's company returned the same framework set for every project it owned.
    if (!req.companyid) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    // [SCOPE 117 / T003] BEGIN — validate required projectId at the boundary
    const projectIdParsed = parseRequiredUuid(req.query.projectId, "projectId");
    if (!projectIdParsed.ok) {
      res.status(400).json({ error: projectIdParsed.message });
      return;
    }
    const projectId = projectIdParsed.value as string;
    // [SCOPE 117 / T003] END
    // [SCOPE 146 / T009] MODIFIED-BY — the project's enabled frameworks are read only by its tenant or a SYSADMIN (FR-009)
    if (!(await canReadProjectCompliance(req, projectId))) {
      res.status(404).json(PROJECT_NOT_FOUND);
      return;
    }
    const keywords = (req.query.keywords as string)?.split(",").filter(Boolean) ?? [];
    const enabledFrameworks = await AuditConfigService.getEnabledFrameworksByProject(projectId);

    if (enabledFrameworks.length === 0) {
      res.json({
        success: true,
        data: [],
        message: "No compliance frameworks enabled",
      });
      return;
    }

    const tasks = await AuditTaskService.getRelevantTasks(keywords, enabledFrameworks);

    res.json({
      success: true,
      data: tasks,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/audit/tasks/:id
 * Get a single task
 */
router.get("/tasks/:id", async (req: AuthRequest, res: Response, next) => {
  try {
    const task = await AuditTaskService.getTask(req.params.id);

    if (!task) {
      res.status(404).json({
        success: false,
        error: "Task not found",
      });
      return;
    }

    res.json({
      success: true,
      data: task,
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Audit Execution Routes
// ============================================================================

/**
 * POST /api/audit/execute
 * Trigger a new audit execution
 */
const executeAuditSchema = z.object({
  featurescope: z.string().optional(),
  specid: z.string().uuid().optional(),
});

router.post("/execute", ...guardFor("POST /execute"), validateBody(executeAuditSchema), async (req: AuthRequest, res: Response, next) => {
  // [SCOPE 146 / T002] MODIFIED-BY — SYSADMIN only: a run audits wxKanban's own code (Platform Self-Audit); recorded (FR-005)
  try {
    const companyId = req.companyid;
    const userId = req.userid;
    if (!companyId || !userId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    // Get enabled frameworks
    const enabledFrameworks = await AuditConfigService.getEnabledFrameworks(companyId);

    if (enabledFrameworks.length === 0) {
      res.status(400).json({
        success: false,
        error: "No compliance frameworks enabled. Enable frameworks in audit configuration.",
      });
      return;
    }

    // Create execution record
    const execution = await AuditEngineService.createAuditExecution({
      executiontype: "manual",
      triggeredby: userId,
      specid: req.body.specid,
      featurescope: req.body.featurescope,
      enabledframeworks: enabledFrameworks,
    });
    await recordAuditLibraryWrite(req, "audit_selfaudit_started", "Platform Self-Audit started", {
      newvalue: { executionId: execution.id, enabledFrameworks, featurescope: req.body.featurescope ?? "full" },
    });

    // Start audit in background (don't await)
    AuditEngineService.executeAudit(execution.id, enabledFrameworks, req.body.featurescope || "full").catch(
      (err) => {
        logger.error({ error: err, executionId: execution.id }, "Background audit failed");
      },
    );

    res.status(202).json({
      success: true,
      data: execution,
      message: "Audit execution started",
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/audit/executions
 * List audit executions
 */
const listExecutionsSchema = z.object({
  status: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

router.get("/executions", ...guardFor("GET /executions"), validateQuery(listExecutionsSchema), async (req: AuthRequest, res: Response, next) => {
  // [SCOPE 146 / T002] MODIFIED-BY — SYSADMIN only: Platform Self-Audit executions are wxKanban-internal (FR-002)
  try {
    // This would need a service function - adding basic implementation
    const { db } = await import("~/db/client.js");
    const { auditexecutions } = await import("~/db/schema/auditexecutions.js");
    const { desc, eq } = await import("drizzle-orm");

    let query = db.select().from(auditexecutions);

    if (req.query.status) {
      query = query.where(eq(auditexecutions.status, req.query.status as string)) as typeof query;
    }

    const executions = await query
      .orderBy(desc(auditexecutions.createdat))
      .limit(Number(req.query.limit))
      .offset(Number(req.query.offset));

    res.json({
      success: true,
      data: executions,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/audit/executions/:id
 * Get execution status and details
 */
router.get("/executions/:id", ...guardFor("GET /executions/:id"), async (req: AuthRequest, res: Response, next) => {
  // [SCOPE 146 / T002] MODIFIED-BY — SYSADMIN only (FR-002)
  try {
    const { db } = await import("~/db/client.js");
    const { auditexecutions } = await import("~/db/schema/auditexecutions.js");
    const { eq } = await import("drizzle-orm");

    const execution = await db
      .select()
      .from(auditexecutions)
      .where(eq(auditexecutions.id, req.params.id))
      .limit(1);

    if (execution.length === 0) {
      res.status(404).json({
        success: false,
        error: "Execution not found",
      });
      return;
    }

    res.json({
      success: true,
      data: execution[0],
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/audit/executions/:id/results
 * Get detailed results for an execution
 */
router.get("/executions/:id/results", ...guardFor("GET /executions/:id/results"), async (req: AuthRequest, res: Response, next) => {
  // [SCOPE 146 / T002] MODIFIED-BY — SYSADMIN only: results carry wxKanban source snippets (FR-002)
  try {
    const { db } = await import("~/db/client.js");
    const { auditresults } = await import("~/db/schema/auditresults.js");
    const { eq } = await import("drizzle-orm");

    const results = await db
      .select()
      .from(auditresults)
      .where(eq(auditresults.executionid, req.params.id));

    res.json({
      success: true,
      data: results,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/audit/executions/:id/cancel
 * Cancel a running audit execution
 */
router.post("/executions/:id/cancel", ...guardFor("POST /executions/:id/cancel"), async (req: AuthRequest, res: Response, next) => {
  // [SCOPE 146 / T002] MODIFIED-BY — SYSADMIN only (FR-002); the cancel is recorded (FR-005)
  try {
    await AuditEngineService.cancelAuditExecution(req.params.id);
    await recordAuditLibraryWrite(req, "audit_selfaudit_cancelled", "Platform Self-Audit cancelled", {
      newvalue: { executionId: req.params.id },
    });

    res.json({
      success: true,
      message: "Audit execution cancelled",
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Report Routes
// ============================================================================

/**
 * POST /api/audit/reports
 * Generate a new audit report
 */
const generateReportSchema = z.object({
  executionId: z.string().uuid(),
  title: z.string().min(1).max(255),
  description: z.string().optional(),
});

router.post("/reports", ...guardFor("POST /reports"), validateBody(generateReportSchema), async (req: AuthRequest, res: Response, next) => {
  // [SCOPE 146 / T002] MODIFIED-BY — SYSADMIN only (FR-002); the report is recorded (FR-005)
  try {
    const userId = req.userid;
    if (!userId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    const report = await ReportService.generateReport(req.body, userId);
    await recordAuditLibraryWrite(req, "audit_report_generated", `Platform Self-Audit report generated: ${req.body.title}`, {
      newvalue: { executionId: req.body.executionId, title: req.body.title },
    });

    res.status(201).json({
      success: true,
      data: report,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/audit/reports
 * List audit reports
 */
const listReportsSchema = z.object({
  approved: z.coerce.boolean().optional(),
  remediationstatus: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

router.get("/reports", ...guardFor("GET /reports"), validateQuery(listReportsSchema), async (req: AuthRequest, res: Response, next) => {
  // [SCOPE 146 / T002] MODIFIED-BY — SYSADMIN only (FR-002)
  try {
    const reports = await ReportService.listReports({
      approved: req.query.approved === "true" ? true : req.query.approved === "false" ? false : undefined,
      remediationStatus: req.query.remediationstatus as string,
      limit: Number(req.query.limit),
      offset: Number(req.query.offset),
    });

    res.json({
      success: true,
      data: reports,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/audit/reports/:id
 * Get a single report
 */
router.get("/reports/:id", ...guardFor("GET /reports/:id"), async (req: AuthRequest, res: Response, next) => {
  // [SCOPE 146 / T002] MODIFIED-BY — SYSADMIN only (FR-002)
  try {
    const report = await ReportService.getReport(req.params.id);

    if (!report) {
      res.status(404).json({
        success: false,
        error: "Report not found",
      });
      return;
    }

    res.json({
      success: true,
      data: report,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/audit/reports/:id/download
 * Download an audit report as a markdown file
 */
router.get("/reports/:id/download", ...guardFor("GET /reports/:id/download"), async (req: AuthRequest, res: Response, next) => {
  // [SCOPE 146 / T002] MODIFIED-BY — SYSADMIN only (FR-002)
  try {
    const report = await ReportService.getReport(req.params.id);

    if (!report) {
      res.status(404).json({
        success: false,
        error: "Report not found",
      });
      return;
    }

    const content = report.document.filecontent ?? "";
    const safeTitle = report.document.title.replace(/[^a-zA-Z0-9_-]+/g, "_");

    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${safeTitle}.md"`);
    res.send(content);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/audit/reports/:id/approve
 * Approve an audit report
 */
router.post("/reports/:id/approve", ...guardFor("POST /reports/:id/approve"), async (req: AuthRequest, res: Response, next) => {
  // [SCOPE 146 / T002] MODIFIED-BY — SYSADMIN only (FR-002); the approval is recorded (FR-005)
  try {
    const userId = req.userid;
    if (!userId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    const report = await ReportService.approveReport(req.params.id, userId);
    await recordAuditLibraryWrite(req, "audit_report_approved", "Platform Self-Audit report approved", {
      newvalue: { reportId: req.params.id },
    });

    res.json({
      success: true,
      data: report,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/audit/trends
 * Get compliance trend data
 */
router.get("/trends", ...guardFor("GET /trends"), async (req: AuthRequest, res: Response, next) => {
  // [SCOPE 146 / T002] MODIFIED-BY — SYSADMIN only (FR-002)
  try {
    const days = Number(req.query.days) || 30;
    const trends = await ReportService.getComplianceTrends(days);

    res.json({
      success: true,
      data: trends,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
