import { Router, Response } from "express";
import { and, asc, desc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  aispecsessions,
  companyprojects,
  complianceflags,
  pmsystemconnections,
  projecttasks,
  projecttimeentries,
  taskstateoverrides,
  tasksyncrecords,
} from "../../db/schema/index.js";
import {
  authenticateToken,
  requireAuth,
  AuthRequest,
} from "../middleware/auth.js";
import { createLogger } from "../lib/logger.js";
import { parseUuidFilter } from "../lib/queryParams.js";
import { serializeDbError } from "../lib/dbError.js";
import { TaskService } from "../services/taskService.js";
import { AISpecSessionService } from "../services/AISpecSessionService.js";
import {
  canConsultantAccessTask,
  isUserAConsultingMember,
} from "../services/EngagementVisibility.js";

const router = Router();
const logger = createLogger("consultant-hub-routes");

interface HubTask {
  id: string;
  projectid: string;
  projectname: string;
  name: string;
  description: string | null;
  status: string;
  priority: string;
  duedate: string | null;
  createdat: string;
  /** All distinct sources for this de-duped card: 'internal' plus any pm system names */
  sources: string[];
  externalid: string | null;
  complianceattention: boolean;
  complianceflagcount: number;
}

router.use(authenticateToken, requireAuth);

/**
 * GET /api/consultant-hub/tasks
 * Unified task queue: assigned tasks across internal + external PM,
 * de-duplicated by (sourcepmssystem, externalid).
 */
router.get("/tasks", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userid = req.userid;
    const companyid = req.companyid;
    if (!userid || !companyid) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    // [SCOPE 117 / T002] BEGIN — validate projectid at the boundary
    // "all" means no filter. Anything else must be a well-formed UUID: an
    // arbitrary string reaches a uuid column below and raises 22P02 as a 500.
    const projectidParsed = parseUuidFilter(req.query.projectid, "projectid");
    if (!projectidParsed.ok) {
      res.status(400).json({ error: projectidParsed.message });
      return;
    }
    const projectidFilter = projectidParsed.value ?? "all";
    // [SCOPE 117 / T002] END

    // [SCOPE 037 / T058] BEGIN — include engagement-covered tasks for Consulting Members
    // A Consulting Member's daily work surface needs to include tasks they
    // have access to via active sub-assignments through their Company's
    // active/paused/disabled engagements — even though those tasks live in
    // the Client Company's tenant (project.companyid !== caller's companyid).
    //
    // Build the set of task IDs visible via engagement, then OR it with the
    // existing assignedtoid+company filter so this user's own-company assigned
    // tasks still show up alongside engagement work.
    let engagementTaskIds: string[] = [];
    const isConsultant = await isUserAConsultingMember(userid);
    if (isConsultant) {
      const visible = await db.execute(sql`
        SELECT DISTINCT ea.taskid AS id
        FROM engagementassignments ea
        INNER JOIN subassignments sa ON sa.engagementassignmentid = ea.id
        INNER JOIN engagements e ON e.id = ea.engagementid
        WHERE sa.consultingmemberid = ${userid}
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
        WHERE sa.consultingmemberid = ${userid}
          AND sa.removedat IS NULL
          AND ea.removedat IS NULL
          AND e.state IN ('active', 'paused', 'disabled')
      `);
      const rowsAny = visible as unknown as { rows?: Array<{ id: string }> };
      engagementTaskIds = (rowsAny.rows ??
        (visible as unknown as Array<{ id: string }>))
        .map((r) => r.id)
        .filter(Boolean);
    }

    // Build the WHERE: either the caller is an assignee on their own company's task,
    // OR the task is in their engagement-visible set (no companyid filter on that branch).
    const accessFilter =
      engagementTaskIds.length > 0
        ? or(
            and(
              eq(projecttasks.assignedtoid, userid),
              eq(companyprojects.companyid, companyid),
            ),
            inArray(projecttasks.id, engagementTaskIds),
          )
        : and(
            eq(projecttasks.assignedtoid, userid),
            eq(companyprojects.companyid, companyid),
          );

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
        createdat: projecttasks.createdat,
        sourcepmssystem: projecttasks.sourcepmssystem,
        externalid: projecttasks.externalid,
      })
      .from(projecttasks)
      .innerJoin(companyprojects, eq(projecttasks.projectid, companyprojects.id))
      .where(
        and(
          accessFilter,
          projectidFilter !== "all" ? eq(projecttasks.projectid, projectidFilter) : undefined,
        ),
      )
      .orderBy(asc(projecttasks.duedate), asc(projecttasks.createdat));
    // [SCOPE 037 / T058] END

    // De-duplicate by (sourcepmssystem, externalid) when both are NOT NULL.
    // Internal-only tasks (externalid IS NULL) are never collapsed.
    const dedupMap = new Map<string, { row: typeof rows[number]; sources: Set<string> }>();
    for (const row of rows) {
      let key: string;
      const sourceLabel = row.sourcepmssystem ?? "internal";
      if (row.sourcepmssystem && row.externalid) {
        key = `pm:${row.sourcepmssystem}:${row.externalid}`;
      } else {
        key = `id:${row.id}`;
      }
      const existing = dedupMap.get(key);
      if (existing) {
        existing.sources.add(sourceLabel);
      } else {
        dedupMap.set(key, { row, sources: new Set([sourceLabel]) });
      }
    }

    const dedupedTasks = Array.from(dedupMap.values()).map(({ row, sources }) => ({
      ...row,
      sources: Array.from(sources),
    }));

    const taskIds = dedupedTasks.map((t) => t.id);
    const openFlags = taskIds.length
      ? await db
          .select({
            id: complianceflags.id,
            taskid: complianceflags.taskid,
          })
          .from(complianceflags)
          .where(and(inArray(complianceflags.taskid, taskIds), isNull(complianceflags.resolvedat)))
      : [];

    const flagCountMap = new Map<string, number>();
    openFlags.forEach((flag) => {
      flagCountMap.set(flag.taskid, (flagCountMap.get(flag.taskid) ?? 0) + 1);
    });

    const tasks: HubTask[] = dedupedTasks.map((row) => ({
      id: row.id,
      projectid: row.projectid,
      projectname: row.projectname,
      name: row.name,
      description: row.description,
      status: row.status,
      priority: row.priority,
      duedate: row.duedate ?? null,
      createdat: row.createdat.toISOString(),
      sources: row.sources,
      externalid: row.externalid ?? null,
      complianceattention: (flagCountMap.get(row.id) ?? 0) > 0,
      complianceflagcount: flagCountMap.get(row.id) ?? 0,
    }));

    const now = new Date();
    const agingCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const isOpen = (status: string): boolean => status !== "completed";

    const counters = {
      total: tasks.length,
      pastDue: tasks.filter((task) => {
        if (!task.duedate || !isOpen(task.status)) {
          return false;
        }
        return new Date(task.duedate) < now;
      }).length,
      aging30Plus: tasks.filter((task) => {
        if (!isOpen(task.status)) {
          return false;
        }
        return new Date(task.createdat) <= agingCutoff;
      }).length,
      complianceAttention: tasks.filter((task) => task.complianceflagcount > 0).length,
    };

    const projectMap = new Map<string, { id: string; name: string }>();
    tasks.forEach((task) => {
      if (!projectMap.has(task.projectid)) {
        projectMap.set(task.projectid, {
          id: task.projectid,
          name: task.projectname,
        });
      }
    });

    res.status(200).json({
      success: true,
      filters: {
        projectid: projectidFilter,
      },
      counters,
      projects: Array.from(projectMap.values()),
      tasks,
    });
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : "Unknown error" },
      "Failed to fetch consultant hub tasks",
    );
    res.status(500).json({ error: "Failed to fetch consultant work hub data" });
  }
});

/**
 * GET /api/consultant-hub/tasks/:taskid
 * Single task detail with sync state, override history, and time entries.
 */
router.get("/tasks/:taskid", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userid = req.userid;
    const companyid = req.companyid;
    const taskid = req.params.taskid;
    if (!userid || !companyid) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    if (!taskid) {
      res.status(400).json({ error: "Task ID is required" });
      return;
    }

    const [task] = await db
      .select({
        id: projecttasks.id,
        projectid: projecttasks.projectid,
        projectname: companyprojects.name,
        name: projecttasks.name,
        description: projecttasks.description,
        status: projecttasks.status,
        priority: projecttasks.priority,
        duedate: projecttasks.duedate,
        createdat: projecttasks.createdat,
        assignedtoid: projecttasks.assignedtoid,
        sourcepmssystem: projecttasks.sourcepmssystem,
        externalid: projecttasks.externalid,
      })
      .from(projecttasks)
      .innerJoin(companyprojects, eq(projecttasks.projectid, companyprojects.id))
      .where(and(eq(projecttasks.id, taskid), eq(companyprojects.companyid, companyid)))
      .limit(1);

    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    if (task.assignedtoid !== userid) {
      res.status(403).json({ error: "You can only view tasks assigned to you" });
      return;
    }

    const overrideHistory = await db
      .select({
        id: taskstateoverrides.id,
        status: taskstateoverrides.status,
        reason: taskstateoverrides.reason,
        userid: taskstateoverrides.userid,
        resolvedat: taskstateoverrides.resolvedat,
        createdat: taskstateoverrides.createdat,
      })
      .from(taskstateoverrides)
      .where(eq(taskstateoverrides.taskid, taskid))
      .orderBy(desc(taskstateoverrides.createdat));

    const timelogs = await db
      .select({
        id: projecttimeentries.id,
        starttime: projecttimeentries.starttime,
        endtime: projecttimeentries.endtime,
        duration: projecttimeentries.duration,
        billable: projecttimeentries.billable,
        notes: projecttimeentries.notes,
        completionnotesummary: projecttimeentries.completionnotesummary,
        source: projecttimeentries.source,
        aispecsessionid: projecttimeentries.aispecsessionid,
        invoiced: projecttimeentries.invoiced,
      })
      .from(projecttimeentries)
      .where(eq(projecttimeentries.taskid, taskid))
      .orderBy(desc(projecttimeentries.starttime));

    const syncState = await db
      .select()
      .from(tasksyncrecords)
      .where(eq(tasksyncrecords.taskid, taskid))
      .orderBy(desc(tasksyncrecords.updatedat))
      .limit(1);

    res.status(200).json({
      success: true,
      task: {
        ...task,
        duedate: task.duedate ?? null,
        createdat: task.createdat.toISOString(),
      },
      overrideHistory: overrideHistory.map((row) => ({
        ...row,
        resolvedat: row.resolvedat?.toISOString() ?? null,
        createdat: row.createdat.toISOString(),
      })),
      timelogs: timelogs.map((row) => ({
        ...row,
        starttime: row.starttime.toISOString(),
        endtime: row.endtime?.toISOString() ?? null,
      })),
      syncState: syncState[0]
        ? {
            ...syncState[0],
            lastsyncedat: syncState[0].lastsyncedat?.toISOString() ?? null,
            createdat: syncState[0].createdat.toISOString(),
            updatedat: syncState[0].updatedat.toISOString(),
          }
        : null,
    });
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : "Unknown error" },
      "Failed to fetch task detail",
    );
    res.status(500).json({ error: "Failed to fetch task detail" });
  }
});

/**
 * GET /api/consultant-hub/compliance-flags
 */
router.get("/compliance-flags", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userid = req.userid;
    const companyid = req.companyid;
    if (!userid || !companyid) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const rows = await db
      .select({
        flagid: complianceflags.id,
        taskid: complianceflags.taskid,
        ruletype: complianceflags.ruletype,
        flaggedat: complianceflags.flaggedat,
        taskname: projecttasks.name,
        projectid: projecttasks.projectid,
        projectname: companyprojects.name,
      })
      .from(complianceflags)
      .innerJoin(projecttasks, eq(complianceflags.taskid, projecttasks.id))
      .innerJoin(companyprojects, eq(projecttasks.projectid, companyprojects.id))
      .where(
        and(
          eq(projecttasks.assignedtoid, userid),
          eq(companyprojects.companyid, companyid),
          isNull(complianceflags.resolvedat),
        ),
      )
      .orderBy(asc(complianceflags.flaggedat));

    res.status(200).json({
      success: true,
      count: rows.length,
      flags: rows.map((row) => ({
        id: row.flagid,
        taskid: row.taskid,
        taskname: row.taskname,
        projectid: row.projectid,
        projectname: row.projectname,
        ruletype: row.ruletype,
        flaggedat: row.flaggedat.toISOString(),
      })),
    });
  } catch (error) {
    logger.error(
      // [SCOPE 117 / T004] preserve Postgres cause (42P01 etc.)
      { error: serializeDbError(error) },
      "Failed to load consultant compliance flags",
    );
    res.status(500).json({ error: "Failed to load compliance flags" });
  }
});

/**
 * PATCH /api/consultant-hub/tasks/:taskid/state
 * Update task state (active/blocked/suspended). Writes audit row to
 * taskstateoverrides; for tasks with sourcepmssystem, enqueues an
 * outbound tasksyncrecords row.
 */
router.patch("/tasks/:taskid/state", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userid = req.userid;
    const companyid = req.companyid;
    const taskid = req.params.taskid;
    const status = String(req.body?.status ?? "").toLowerCase();
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";

    if (!userid || !companyid) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    if (!taskid) {
      res.status(400).json({ error: "Task ID is required" });
      return;
    }

    if (!["active", "blocked", "suspended"].includes(status)) {
      res.status(400).json({ error: "Status must be one of: active, blocked, suspended" });
      return;
    }

    if ((status === "blocked" || status === "suspended") && reason.length === 0) {
      res.status(400).json({ error: "Reason is required when setting blocked or suspended state" });
      return;
    }

    // [SCOPE 037 / T036] BEGIN — engagement-aware task-state access
    // Two acceptable paths:
    //   (a) Task belongs to the caller's primary company AND is assigned to
    //       them — original team-member behavior.
    //   (b) Caller is a Consulting Member with an active sub-assignment that
    //       covers this task through an engagement (FR-011/FR-012).
    // First try (a) with the original query; fall back to (b) if not matched.
    let [task] = await db
      .select({
        id: projecttasks.id,
        projectid: projecttasks.projectid,
        assignedtoid: projecttasks.assignedtoid,
        sourcepmssystem: projecttasks.sourcepmssystem,
      })
      .from(projecttasks)
      .innerJoin(companyprojects, eq(projecttasks.projectid, companyprojects.id))
      .where(and(eq(projecttasks.id, taskid), eq(companyprojects.companyid, companyid)))
      .limit(1);

    let accessViaEngagement = false;
    if (!task) {
      // Fall through to engagement-based visibility check.
      const allowed = await canConsultantAccessTask(userid, String(taskid), {
        forRead: false,
      });
      if (allowed) {
        // Fetch the task without the companyid filter — engagement grant
        // overrides tenant-isolation here per FR-012.
        [task] = await db
          .select({
            id: projecttasks.id,
            projectid: projecttasks.projectid,
            assignedtoid: projecttasks.assignedtoid,
            sourcepmssystem: projecttasks.sourcepmssystem,
          })
          .from(projecttasks)
          .where(eq(projecttasks.id, String(taskid)))
          .limit(1);
        if (task) accessViaEngagement = true;
      }
    }

    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    // Skip the assignedtoid check for engagement-based access (scope-level
    // grants don't update assignedtoid; the sub-assignment itself is the grant).
    if (!accessViaEngagement && task.assignedtoid !== userid) {
      res.status(403).json({ error: "You can only update tasks assigned to you" });
      return;
    }
    // [SCOPE 037 / T036] END

    const mappedStatus = status === "active" ? "in_progress" : status;
    const now = new Date();

    // 1. Persist the local task status (no longer mangling description)
    const updatedTask = await TaskService.updateTask(
      task.projectid,
      task.id,
      { status: mappedStatus },
      userid,
      companyid,
    );

    // 2. Write an audit row to taskstateoverrides
    await db.insert(taskstateoverrides).values({
      taskid: task.id,
      userid,
      status,
      reason: status === "active" ? reason || null : reason,
    });

    // 3. Resolve any open blocked/suspended override when returning to active
    if (status === "active") {
      await db
        .update(taskstateoverrides)
        .set({ resolvedat: now })
        .where(
          and(
            eq(taskstateoverrides.taskid, task.id),
            inArray(taskstateoverrides.status, ["blocked", "suspended"]),
            isNull(taskstateoverrides.resolvedat),
          ),
        );
    }

    // 4. If this task originates from a PM system, queue an outbound sync
    if (task.sourcepmssystem) {
      const [connection] = await db
        .select({ id: pmsystemconnections.id })
        .from(pmsystemconnections)
        .where(
          and(
            eq(pmsystemconnections.userid, userid),
            eq(pmsystemconnections.pmsystem, task.sourcepmssystem),
          ),
        )
        .limit(1);

      if (connection) {
        await db.insert(tasksyncrecords).values({
          taskid: task.id,
          pmconnectionid: connection.id,
          pendingstatus: status,
          lastsyncstatus: "pending",
        });
      } else {
        logger.warn(
          { taskid: task.id, pmsystem: task.sourcepmssystem, userid },
          "No PM connection found for outbound sync; skipping enqueue",
        );
      }
    }

    res.status(200).json({
      success: true,
      task: {
        id: updatedTask.id,
        status: updatedTask.status,
      },
    });
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : "Unknown error" },
      "Failed to update consultant task state",
    );
    res.status(500).json({ error: "Failed to update task state" });
  }
});

/**
 * GET /api/consultant-hub/invoice-preview
 */
router.get("/invoice-preview", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userid = req.userid;
    const companyid = req.companyid;
    if (!userid || !companyid) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    // [SCOPE 117 / T002] BEGIN — validate projectid at the boundary
    // Previously any non-empty string was passed straight through, so the "All
    // projects" sentinel reached projecttimeentries.projectid (uuid) and raised
    // 22P02 — a guaranteed 500 for every consultant with "All projects" set.
    const projectidParsed = parseUuidFilter(req.query.projectid, "projectid");
    if (!projectidParsed.ok) {
      res.status(400).json({ error: projectidParsed.message });
      return;
    }
    const projectid = projectidParsed.value;
    // [SCOPE 117 / T002] END
    const startDate = typeof req.query.startDate === "string" ? new Date(req.query.startDate) : undefined;
    const endDate = typeof req.query.endDate === "string" ? new Date(req.query.endDate) : undefined;

    if (!startDate || Number.isNaN(startDate.getTime()) || !endDate || Number.isNaN(endDate.getTime())) {
      res.status(400).json({ error: "Valid startDate and endDate query parameters are required" });
      return;
    }

    const entries = await db
      .select({
        id: projecttimeentries.id,
        taskid: projecttimeentries.taskid,
        projectid: projecttimeentries.projectid,
        starttime: projecttimeentries.starttime,
        duration: projecttimeentries.duration,
        billable: projecttimeentries.billable,
        notes: projecttimeentries.notes,
        source: projecttimeentries.source,
        taskname: projecttasks.name,
      })
      .from(projecttimeentries)
      .innerJoin(projecttasks, eq(projecttimeentries.taskid, projecttasks.id))
      .innerJoin(companyprojects, eq(projecttimeentries.projectid, companyprojects.id))
      .where(
        and(
          eq(projecttimeentries.userid, userid),
          eq(projecttimeentries.companyid, companyid),
          eq(projecttimeentries.billable, true),
          eq(projecttimeentries.invoiced, false),
          eq(companyprojects.companyid, companyid),
          projectid ? eq(projecttimeentries.projectid, projectid) : undefined,
          gte(projecttimeentries.starttime, startDate),
          lte(projecttimeentries.starttime, endDate),
        ),
      )
      .orderBy(asc(projecttimeentries.starttime));

    const normalized = entries.map((entry) => ({
      id: entry.id,
      taskid: entry.taskid,
      taskname: entry.taskname,
      projectid: entry.projectid,
      date: entry.starttime.toISOString(),
      durationMinutes: entry.duration ?? 0,
      billable: entry.billable,
      notes: entry.notes,
      source: entry.source,
    }));

    const totalMinutes = normalized.reduce((sum, entry) => sum + entry.durationMinutes, 0);
    const totalHours = Number((totalMinutes / 60).toFixed(2));

    res.status(200).json({
      success: true,
      data: {
        entryCount: normalized.length,
        totalHours,
        entries: normalized,
      },
    });
  } catch (error) {
    logger.error(
      // [SCOPE 117 / T004] preserve Postgres cause (22P02 etc.)
      { error: serializeDbError(error) },
      "Failed to generate consultant invoice preview",
    );
    res.status(500).json({ error: "Failed to generate consultant invoice preview" });
  }
});

// ---------------------------------------------------------------------------
// AI Spec Session routes (FR-005)
// ---------------------------------------------------------------------------

/**
 * POST /api/consultant-hub/ai-session/start
 * Body: { specid, projectid }
 */
router.post("/ai-session/start", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userid = req.userid;
    const companyid = req.companyid;
    if (!userid || !companyid) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    const specid = typeof req.body?.specid === "string" ? req.body.specid : "";
    const projectid = typeof req.body?.projectid === "string" ? req.body.projectid : "";
    if (!specid || !projectid) {
      res.status(400).json({ error: "specid and projectid are required" });
      return;
    }
    // Verify project belongs to company
    const [project] = await db
      .select({ id: companyprojects.id })
      .from(companyprojects)
      .where(and(eq(companyprojects.id, projectid), eq(companyprojects.companyid, companyid)))
      .limit(1);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    const session = await AISpecSessionService.startSession({
      specid,
      projectid,
      userid,
      companyid,
    });
    res.status(201).json({ success: true, session });
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : "Unknown error" },
      "Failed to start AI spec session",
    );
    res.status(500).json({ error: "Failed to start AI spec session" });
  }
});

/**
 * GET /api/consultant-hub/ai-session/active?specid=...
 */
router.get("/ai-session/active", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userid = req.userid;
    if (!userid) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    const specid = typeof req.query.specid === "string" ? req.query.specid : "";
    if (!specid) {
      res.status(400).json({ error: "specid query parameter is required" });
      return;
    }
    const session = await AISpecSessionService.getActiveSession(specid, userid);
    res.status(200).json({ success: true, session });
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : "Unknown error" },
      "Failed to load active AI spec session",
    );
    res.status(500).json({ error: "Failed to load active AI spec session" });
  }
});

/**
 * GET /api/consultant-hub/ai-session/:id
 */
router.get("/ai-session/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userid = req.userid;
    const companyid = req.companyid;
    if (!userid || !companyid) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    const session = await AISpecSessionService.getSession(req.params.id);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    if (session.userid !== userid || session.companyid !== companyid) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const entries = await db
      .select({
        id: projecttimeentries.id,
        taskid: projecttimeentries.taskid,
        starttime: projecttimeentries.starttime,
        endtime: projecttimeentries.endtime,
        duration: projecttimeentries.duration,
        completionnotesummary: projecttimeentries.completionnotesummary,
      })
      .from(projecttimeentries)
      .where(eq(projecttimeentries.aispecsessionid, session.id))
      .orderBy(asc(projecttimeentries.starttime));

    res.status(200).json({
      success: true,
      session,
      entries: entries.map((e) => ({
        ...e,
        starttime: e.starttime.toISOString(),
        endtime: e.endtime?.toISOString() ?? null,
      })),
    });
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : "Unknown error" },
      "Failed to load AI spec session",
    );
    res.status(500).json({ error: "Failed to load AI spec session" });
  }
});

/**
 * POST /api/consultant-hub/ai-session/:id/task-switch
 * Body: { taskid }
 */
router.post("/ai-session/:id/task-switch", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userid = req.userid;
    if (!userid) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    const taskid = typeof req.body?.taskid === "string" ? req.body.taskid : "";
    if (!taskid) {
      res.status(400).json({ error: "taskid is required" });
      return;
    }
    const session = await AISpecSessionService.getSession(req.params.id);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    if (session.userid !== userid) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const entry = await AISpecSessionService.switchTask({
      sessionid: req.params.id,
      taskid,
      userid,
    });
    res.status(200).json({ success: true, entry });
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : "Unknown error" },
      "Failed to switch task on AI spec session",
    );
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to switch task",
    });
  }
});

/**
 * POST /api/consultant-hub/ai-session/:id/overhead
 * Body: { minutes }
 */
router.post("/ai-session/:id/overhead", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userid = req.userid;
    if (!userid) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    const minutes = Number(req.body?.minutes);
    if (!Number.isFinite(minutes) || minutes <= 0) {
      res.status(400).json({ error: "minutes must be a positive number" });
      return;
    }
    const session = await AISpecSessionService.getSession(req.params.id);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    if (session.userid !== userid) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const updated = await AISpecSessionService.addOverhead({
      sessionid: req.params.id,
      minutes,
    });
    res.status(200).json({ success: true, session: updated });
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : "Unknown error" },
      "Failed to add overhead to AI spec session",
    );
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to add overhead",
    });
  }
});

/**
 * POST /api/consultant-hub/ai-session/:id/close
 * Body: { taskSummaries?, sessionSummary? }
 */
router.post("/ai-session/:id/close", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userid = req.userid;
    if (!userid) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    const session = await AISpecSessionService.getSession(req.params.id);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    if (session.userid !== userid) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const taskSummaries =
      typeof req.body?.taskSummaries === "object" && req.body.taskSummaries !== null
        ? (req.body.taskSummaries as Record<string, string>)
        : undefined;
    const sessionSummary =
      typeof req.body?.sessionSummary === "string" ? req.body.sessionSummary : undefined;
    const closed = await AISpecSessionService.closeSession({
      sessionid: req.params.id,
      userid,
      taskSummaries,
      sessionSummary,
    });
    res.status(200).json({ success: true, session: closed });
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : "Unknown error" },
      "Failed to close AI spec session",
    );
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to close session",
    });
  }
});

// Silence ESLint about unused imports (kept for potential future expansion).
void aispecsessions;

export default router;
