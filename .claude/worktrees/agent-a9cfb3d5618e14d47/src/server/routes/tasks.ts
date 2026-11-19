/**
 * Task aggregation routes for Phase 4 (User Story 2).
 *
 * Provides a cross-project "my assigned tasks" view drawn from the
 * projecttasks table. Tasks are still project-scoped in the schema, but
 * this route flattens them for the logged-in user so the dashboard can
 * show one unified list regardless of which wxKanban project the task
 * belongs to.
 *
 * Project-scoped CRUD continues to live under /api/projects/:id/tasks.
 */
import { Router, Response } from "express";
import { z } from "zod";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "~/db/client.js";
import { projecttasks } from "~/db/schema/projecttask.js";
import { companyprojects } from "~/db/schema/companyproject.js";
import { userprofiles } from "~/db/schema/userprofiles.js";
import { isUserAConsultingMember } from "~/server/services/EngagementVisibility.js";
import {
  authenticateToken,
  requireAuth,
  AuthRequest,
} from "../middleware/auth.js";
import { validateQuery } from "../middleware/validation.js";
import { createLogger } from "../lib/logger.js";
import { syncAllPMTasks, getSyncStatus } from "../services/pmSyncService.js";

const router = Router();
const logger = createLogger("tasks-routes");

const listSchema = z.object({
  source: z.enum(["jira", "monday", "asana", "trello", "internal"]).optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).optional(),
  status: z.enum(["open", "in_progress", "completed", "orphaned"]).optional(),
  sort: z.enum(["duedate", "priority", "name", "updatedat"]).default("updatedat"),
  order: z.enum(["asc", "desc"]).default("desc"),
});

const PRIORITY_RANK: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/**
 * GET /api/tasks
 * List the authenticated user's assigned tasks across every project they
 * belong to, with optional filtering and sorting.
 */
router.get(
  "/",
  authenticateToken,
  requireAuth,
  validateQuery(listSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.userid) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const { source, priority, status, sort, order } = res.locals
        .query as z.infer<typeof listSchema>;

      // [SCOPE 037 / T036] BEGIN — consultant-aware visibility (FR-011)
      // If the caller is a Consulting Member, replace the assignedtoid filter
      // with the set of task IDs visible via their active sub-assignments
      // through their Company's active engagements. Covers both task-level
      // and scope-level grants. Non-consultants fall through to existing
      // assignedtoid behavior unchanged.
      const filters = [];
      const isConsultant = await isUserAConsultingMember(req.userid);
      if (isConsultant) {
        const visible = await db.execute(sql`
          SELECT DISTINCT ea.taskid AS id
          FROM engagementassignments ea
          INNER JOIN subassignments sa ON sa.engagementassignmentid = ea.id
          INNER JOIN engagements e ON e.id = ea.engagementid
          WHERE sa.consultingmemberid = ${req.userid}
            AND sa.removedat IS NULL
            AND ea.removedat IS NULL
            AND ea.taskid IS NOT NULL
            AND e.state IN ('active', 'paused', 'disabled')
          UNION
          SELECT DISTINCT t.id
          FROM projecttasks t
          INNER JOIN projectspecifications s ON s.id = t.specid
          INNER JOIN engagementassignments ea ON ea.scopeid = s.specnumber
          INNER JOIN subassignments sa ON sa.engagementassignmentid = ea.id
          INNER JOIN engagements e ON e.id = ea.engagementid
          WHERE sa.consultingmemberid = ${req.userid}
            AND sa.removedat IS NULL
            AND ea.removedat IS NULL
            AND e.state IN ('active', 'paused', 'disabled')
        `);
        const rowsAny = visible as unknown as { rows?: Array<{ id: string }> };
        const idList = (rowsAny.rows ??
          (visible as unknown as Array<{ id: string }>))
          .map((r) => r.id)
          .filter(Boolean);
        if (idList.length === 0) {
          // No engagement-covered tasks — return empty set.
          res.status(200).json({ success: true, data: [], count: 0 });
          return;
        }
        filters.push(inArray(projecttasks.id, idList));
      } else {
        filters.push(eq(projecttasks.assignedtoid, req.userid));
      }
      // [SCOPE 037 / T036] END

      if (source) {
        // `internal` means the task did not originate in a PM system; stored
        // as NULL in sourcepmssystem with sourceoforigin !== 'external'.
        if (source === "internal") {
          filters.push(eq(projecttasks.sourceoforigin, "internal"));
        } else {
          filters.push(eq(projecttasks.sourcepmssystem, source));
        }
      }
      if (priority) filters.push(eq(projecttasks.priority, priority));
      if (status) filters.push(eq(projecttasks.status, status));

      const orderCol =
        sort === "duedate"
          ? projecttasks.duedate
          : sort === "name"
            ? projecttasks.name
            : sort === "priority"
              ? projecttasks.priority
              : projecttasks.updatedat;
      const orderFn = order === "asc" ? asc : desc;

      const rows = await db
        .select({
          id: projecttasks.id,
          projectid: projecttasks.projectid,
          projectname: companyprojects.name,
          name: projecttasks.name,
          description: projecttasks.description,
          status: projecttasks.status,
          priority: projecttasks.priority,
          duedate: projecttasks.duedate,
          sourcepmssystem: projecttasks.sourcepmssystem,
          externalid: projecttasks.externalid,
          sourceoforigin: projecttasks.sourceoforigin,
          assignedtoid: projecttasks.assignedtoid,
          assignedtoname: userprofiles.fullname,
          createdat: projecttasks.createdat,
          updatedat: projecttasks.updatedat,
        })
        .from(projecttasks)
        .leftJoin(
          companyprojects,
          eq(projecttasks.projectid, companyprojects.id),
        )
        .leftJoin(
          userprofiles,
          eq(projecttasks.assignedtoid, userprofiles.id),
        )
        .where(and(...filters))
        .orderBy(orderFn(orderCol));

      // Priority enums don't sort lexically the way humans expect ("critical"
      // < "high" < "low" < "medium"), so re-sort in JS when sort=priority.
      const tasks =
        sort === "priority"
          ? [...rows].sort((a, b) => {
              const diff =
                (PRIORITY_RANK[a.priority] ?? 99) -
                (PRIORITY_RANK[b.priority] ?? 99);
              return order === "asc" ? diff : -diff;
            })
          : rows;

      res.status(200).json({
        success: true,
        data: tasks,
        count: tasks.length,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error({ error: message }, "Failed to list tasks");
      res.status(500).json({ error: "Failed to list tasks", message });
    }
  },
);

/**
 * POST /api/tasks/sync
 * Trigger a manual sync of the authenticated user's PM connections.
 * Aliases the underlying pmSyncService.syncAllPMTasks so the dashboard
 * doesn't need to know about per-system endpoints.
 */
router.post(
  "/sync",
  authenticateToken,
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.userid) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }
      const results = await syncAllPMTasks(req.userid);
      res.status(200).json({ success: true, data: results });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error({ error: message }, "Manual task sync failed");
      res.status(500).json({ error: "Task sync failed", message });
    }
  },
);

/**
 * GET /api/tasks/sync-status
 * Return per-connection lastsyncsat + syncstatus so the dashboard can
 * show "Last synced: ..." next to the manual sync button.
 */
router.get(
  "/sync-status",
  authenticateToken,
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.userid) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }
      const status = await getSyncStatus(req.userid);
      res.status(200).json({ success: true, data: status });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error({ error: message }, "Failed to get sync status");
      res.status(500).json({ error: "Failed to get sync status", message });
    }
  },
);

export default router;
