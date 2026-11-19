/**
 * AI Audit API Routes
 * 
 * Management review endpoints for AI interaction logs.
 * All routes require ADMIN authentication.
 * 
 * Endpoints:
 *   GET /api/ai-audit/logs          — paginated AI interaction logs
 *   GET /api/ai-audit/logs/:id      — single log entry
 *   GET /api/ai-audit/summary       — counts by action type
 *   GET /api/ai-audit/overrides     — emergency override records
 *   POST /api/ai-audit/log          — insert AI interaction log (internal use)
 * 
 * Spec 015 — AI Interaction Rules & Governance Framework
 */

import { Router, Response } from "express";
import { z } from "zod";
import { authenticateToken, requireAuth, AuthRequest } from "../middleware/auth.js";
import { validateQuery, validateBody } from "../middleware/validation.js";
import { createLogger } from "../lib/logger.js";
import { AiInteractionLogService, type AiActionType } from "../services/AiInteractionLogService.js";

const logger = createLogger("ai-audit-routes");
const router = Router();

// All AI audit routes require authentication
router.use(authenticateToken);
router.use(requireAuth);

// ── Query Schemas ─────────────────────────────────────────────────────────────

const AI_ACTION_TYPES = [
  "scope_check_pass",
  "scope_check_block",
  "scope_check_override",
  "scope_created",
  "todo_import",
  "implementation_start",
  "implementation_complete",
  "rules_sync",
  "protected_file_block",
  "training_session",
] as const;

const listLogsSchema = z.object({
  actiontype: z.enum(AI_ACTION_TYPES).optional(),
  userid: z.string().uuid().optional(),
  scopenumber: z.string().regex(/^\d{3}$/).optional(),
  provider: z.string().max(50).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const listOverridesSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const logInteractionSchema = z.object({
  actiontype: z.enum(AI_ACTION_TYPES),
  scopenumber: z.string().optional(),
  taskid: z.string().optional(),
  provider: z.string().max(50).optional(),
  sessionid: z.string().max(100).optional(),
  filesaffected: z.array(z.string()).optional(),
  forceoverride: z.boolean().optional(),
  overridereason: z.string().max(1000).optional(),
  description: z.string().max(2000),
  metadata: z.record(z.unknown()).optional(),
});

// ── Routes ────────────────────────────────────────────────────────────────────

/**
 * GET /api/ai-audit/logs
 * Get paginated AI interaction logs for the current company.
 * Supports filtering by actiontype, userid, scopenumber, provider.
 */
router.get(
  "/logs",
  validateQuery(listLogsSchema),
  async (req: AuthRequest, res: Response, next) => {
    try {
      const companyid = req.companyid;
      if (!companyid) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const { actiontype, userid, scopenumber, provider, limit, offset } = req.query as unknown as z.infer<typeof listLogsSchema>;

      const { logs, total } = await AiInteractionLogService.getLogs(companyid, {
        actiontype: actiontype as AiActionType | undefined,
        userid,
        scopenumber,
        provider,
        limit: Number(limit),
        offset: Number(offset),
      });

      logger.info(
        { companyid, adminid: req.userid, count: logs.length, total },
        "AI audit logs retrieved"
      );

      res.json({
        success: true,
        data: logs,
        pagination: {
          total,
          limit: Number(limit),
          offset: Number(offset),
          hasMore: Number(offset) + logs.length < total,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/ai-audit/logs/:id
 * Get a single AI interaction log entry by ID.
 */
router.get("/logs/:id", async (req: AuthRequest, res: Response, next) => {
  try {
    const companyid = req.companyid;
    if (!companyid) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const { id } = req.params;

    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
      res.status(400).json({ error: "Invalid log ID format" });
      return;
    }

    const log = await AiInteractionLogService.getLogById(id, companyid);

    if (!log) {
      res.status(404).json({
        success: false,
        error: "Log entry not found",
      });
      return;
    }

    logger.info({ companyid, adminid: req.userid, logid: id }, "AI audit log entry retrieved");

    res.json({
      success: true,
      data: log,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/ai-audit/summary
 * Get AI interaction summary counts for the current company.
 * Returns totals by action type and provider, plus recent activity.
 */
router.get("/summary", async (req: AuthRequest, res: Response, next) => {
  try {
    const companyid = req.companyid;
    if (!companyid) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const summary = await AiInteractionLogService.getSummary(companyid);

    logger.info(
      { companyid, adminid: req.userid, total: summary.totalInteractions },
      "AI audit summary retrieved"
    );

    res.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/ai-audit/overrides
 * Get all emergency override records for the current company.
 * These are scope-first rule bypasses that require management review.
 */
router.get(
  "/overrides",
  validateQuery(listOverridesSchema),
  async (req: AuthRequest, res: Response, next) => {
    try {
      const companyid = req.companyid;
      if (!companyid) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const { limit, offset } = req.query as unknown as z.infer<typeof listOverridesSchema>;

      const { overrides, total } = await AiInteractionLogService.getOverrides(
        companyid,
        Number(limit),
        Number(offset)
      );

      logger.info(
        { companyid, adminid: req.userid, count: overrides.length, total },
        "AI audit overrides retrieved"
      );

      res.json({
        success: true,
        data: overrides,
        pagination: {
          total,
          limit: Number(limit),
          offset: Number(offset),
          hasMore: Number(offset) + overrides.length < total,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/ai-audit/log
 * Insert an AI interaction log entry.
 * Called by CLI commands and AI providers to record interactions.
 * Requires authentication — the logged-in user is the actor.
 */
router.post(
  "/log",
  validateBody(logInteractionSchema),
  async (req: AuthRequest, res: Response, next) => {
    try {
      const companyid = req.companyid;
      const userid = req.userid;

      if (!companyid) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const body = req.body as z.infer<typeof logInteractionSchema>;

      await AiInteractionLogService.logInteraction({
        companyid,
        userid,
        actiontype: body.actiontype as AiActionType,
        scopenumber: body.scopenumber,
        taskid: body.taskid,
        provider: body.provider,
        sessionid: body.sessionid,
        filesaffected: body.filesaffected,
        forceoverride: body.forceoverride,
        overridereason: body.overridereason,
        description: body.description,
        metadata: body.metadata,
      });

      logger.info(
        { companyid, userid, actiontype: body.actiontype },
        "AI interaction log entry created via API"
      );

      res.status(201).json({
        success: true,
        message: "AI interaction logged",
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
