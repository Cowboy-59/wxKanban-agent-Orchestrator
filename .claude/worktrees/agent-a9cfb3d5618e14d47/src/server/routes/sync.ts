/**
 * Task Sync Routes
 * API endpoints for synchronizing tasks from external PM systems
 */

import { Router, Response } from "express";
import { z } from "zod";
import {
  syncTasksFromPM,
  syncAllPMTasks,
  getSyncStatus,
} from "../services/pmSyncService.js";
import {
  getUserPMConnections,
  type PMSystem,
} from "../services/pmSystemService.js";
import { validateParams } from "../middleware/validation.js";
import {
  authenticateToken,
  requireAuth,
  AuthRequest,
} from "../middleware/auth.js";
import { createLogger } from "../lib/logger.js";

const router = Router();
const logger = createLogger("sync-routes");

// Validation schemas
const syncParamsSchema = z.object({
  pmsystem: z.enum(["jira", "monday", "asana", "trello"]),
});

/**
 * POST /api/sync/:pmsystem
 * Sync tasks from a specific PM system
 */
router.post(
  "/:pmsystem",
  authenticateToken,
  requireAuth,
  validateParams(syncParamsSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.userid) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const pmsystem = req.params.pmsystem as PMSystem;

      logger.info({ userid: req.userid, pmsystem }, "Starting manual task sync");

      // Check if user has connection for this PM system
      const connections = await getUserPMConnections(req.userid);
      const hasConnection = connections.some(
        (conn) => conn.pmsystem === pmsystem && conn.syncstatus === "active"
      );

      if (!hasConnection) {
        res.status(400).json({
          error: `No active ${pmsystem} connection found`,
          message: `Please connect your ${pmsystem} account first`,
        });
        return;
      }

      // Perform sync
      const result = await syncTasksFromPM(req.userid, pmsystem);

      // Return appropriate status based on result
      if (result.errors.length > 0 && result.added === 0 && result.updated === 0) {
        res.status(500).json({
          success: false,
          error: "Sync failed",
          details: result.errors,
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: result,
        message: `Successfully synced ${result.added} new, ${result.updated} updated, ${result.unchanged} unchanged tasks`,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : "Unknown error",
          userid: req.userid,
          pmsystem: req.params.pmsystem,
        },
        "Manual sync failed"
      );
      res.status(500).json({ error: "Failed to sync tasks" });
    }
  }
);

/**
 * POST /api/sync/all
 * Sync tasks from all connected PM systems
 */
router.post(
  "/all",
  authenticateToken,
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.userid) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      logger.info({ userid: req.userid }, "Starting sync for all PM systems");

      // Get user's connections
      const connections = await getUserPMConnections(req.userid);
      const activeConnections = connections.filter(
        (conn) => conn.syncstatus === "active"
      );

      if (activeConnections.length === 0) {
        res.status(400).json({
          error: "No active PM connections found",
          message: "Please connect at least one PM system first",
        });
        return;
      }

      // Perform sync for all systems
      const results = await syncAllPMTasks(req.userid);

      // Calculate totals
      const totals = results.reduce(
        (acc, result) => ({
          added: acc.added + result.added,
          updated: acc.updated + result.updated,
          unchanged: acc.unchanged + result.unchanged,
          errors: acc.errors.concat(result.errors),
        }),
        { added: 0, updated: 0, unchanged: 0, errors: [] as string[] }
      );

      // Check if any syncs failed completely
      const hasFailures = results.some(
        (r) => r.errors.length > 0 && r.added === 0 && r.updated === 0
      );

      if (hasFailures && totals.added === 0 && totals.updated === 0) {
        res.status(500).json({
          success: false,
          error: "All syncs failed",
          details: totals.errors,
          data: results,
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: {
          results,
          totals,
        },
        message: `Synced ${activeConnections.length} PM systems: ${totals.added} new, ${totals.updated} updated, ${totals.unchanged} unchanged`,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : "Unknown error",
          userid: req.userid,
        },
        "Sync all failed"
      );
      res.status(500).json({ error: "Failed to sync all PM systems" });
    }
  }
);

/**
 * GET /api/sync/status
 * Get sync status for all connected PM systems
 */
router.get(
  "/status",
  authenticateToken,
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.userid) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const status = await getSyncStatus(req.userid);

      res.status(200).json({
        success: true,
        data: status,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : "Unknown error",
          userid: req.userid,
        },
        "Failed to get sync status"
      );
      res.status(500).json({ error: "Failed to get sync status" });
    }
  }
);

/**
 * GET /api/sync/:pmsystem/status
 * Get sync status for a specific PM system
 */
router.get(
  "/:pmsystem/status",
  authenticateToken,
  requireAuth,
  validateParams(syncParamsSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.userid) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const pmsystem = req.params.pmsystem as PMSystem;
      const status = await getSyncStatus(req.userid);

      const systemStatus = status.find((s) => s.pmsystem === pmsystem);

      if (!systemStatus) {
        res.status(404).json({
          error: `${pmsystem} connection not found`,
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: systemStatus,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : "Unknown error",
          userid: req.userid,
          pmsystem: req.params.pmsystem,
        },
        "Failed to get PM system sync status"
      );
      res.status(500).json({ error: "Failed to get sync status" });
    }
  }
);

export default router;
