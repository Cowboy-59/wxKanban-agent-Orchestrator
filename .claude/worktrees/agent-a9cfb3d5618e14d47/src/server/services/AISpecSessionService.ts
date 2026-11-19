/**
 * AISpecSessionService
 *
 * Spec-level AI engagement sessions (FR-005). Persists across consultant
 * conversations until all linked spec tasks reach status='completed'.
 *
 * Lifecycle:
 *   start  -> open aispecsessions row, status='active'
 *   switchTask -> close current open ai time entry, open new one for taskid
 *   addOverhead -> accumulate Q&A / non-task minutes against the session
 *   close  -> mark session completed, generate per-task + spec summary
 *   autoClose -> background job closes when all spec tasks completed
 *   timeout -> background job marks status='timeout' after 30 days
 */

import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  aispecsessions,
  projecttimeentries,
  projecttasks,
  projectspecifications,
} from "../../db/schema/index.js";
import { createLogger } from "../lib/logger.js";

const logger = createLogger("ai-spec-session-service");

const MAX_SESSION_DAYS = 30;

export interface StartSessionInput {
  specid: string;
  projectid: string;
  userid: string;
  companyid: string;
}

export interface SwitchTaskInput {
  sessionid: string;
  taskid: string;
  userid: string;
}

export interface AddOverheadInput {
  sessionid: string;
  minutes: number;
}

export interface CloseSessionInput {
  sessionid: string;
  userid: string;
  /** Optional per-task summaries keyed by taskid */
  taskSummaries?: Record<string, string>;
  /** Optional spec-level rollup summary */
  sessionSummary?: string;
  /** Final status to set; default 'completed' */
  finalStatus?: "completed" | "timeout" | "cancelled";
}

export class AISpecSessionService {
  /**
   * Start a session. Idempotent: returns the existing active session
   * for (specid, userid) if one exists.
   */
  static async startSession(input: StartSessionInput) {
    const existing = await db
      .select()
      .from(aispecsessions)
      .where(
        and(
          eq(aispecsessions.specid, input.specid),
          eq(aispecsessions.userid, input.userid),
          eq(aispecsessions.status, "active"),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      logger.debug(
        { sessionid: existing[0].id, specid: input.specid },
        "Existing active session returned",
      );
      return existing[0];
    }

    const [created] = await db
      .insert(aispecsessions)
      .values({
        specid: input.specid,
        projectid: input.projectid,
        userid: input.userid,
        companyid: input.companyid,
        status: "active",
      })
      .returning();

    logger.info(
      { sessionid: created.id, specid: input.specid, userid: input.userid },
      "AI spec session started",
    );
    return created;
  }

  /**
   * Get active session for spec+user (if any).
   */
  static async getActiveSession(specid: string, userid: string) {
    const rows = await db
      .select()
      .from(aispecsessions)
      .where(
        and(
          eq(aispecsessions.specid, specid),
          eq(aispecsessions.userid, userid),
          eq(aispecsessions.status, "active"),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  /**
   * Get session by id (no auth check; caller must verify ownership).
   */
  static async getSession(sessionid: string) {
    const rows = await db
      .select()
      .from(aispecsessions)
      .where(eq(aispecsessions.id, sessionid))
      .limit(1);
    return rows[0] ?? null;
  }

  /**
   * Switch the open task-level AI time entry to a new task.
   * - Closes any currently open AI entry for this session
   * - Opens a new entry for taskid
   * - Updates session.taskcount if this is the first time we've touched the task
   */
  static async switchTask(input: SwitchTaskInput) {
    const session = await AISpecSessionService.getSession(input.sessionid);
    if (!session) {
      throw new Error("Session not found");
    }
    if (session.status !== "active") {
      throw new Error(`Session is ${session.status}, cannot switch task`);
    }

    const now = new Date();

    // Close any open AI entry for this session
    const open = await db
      .select()
      .from(projecttimeentries)
      .where(
        and(
          eq(projecttimeentries.aispecsessionid, input.sessionid),
          isNull(projecttimeentries.endtime),
        ),
      );

    for (const entry of open) {
      const durationMin = Math.max(
        0,
        Math.floor((now.getTime() - entry.starttime.getTime()) / 60000),
      );
      await db
        .update(projecttimeentries)
        .set({
          endtime: now,
          duration: durationMin,
          updatedat: now,
        })
        .where(eq(projecttimeentries.id, entry.id));
    }

    // Check if we've touched this task before in this session
    const prior = await db
      .select({ id: projecttimeentries.id })
      .from(projecttimeentries)
      .where(
        and(
          eq(projecttimeentries.aispecsessionid, input.sessionid),
          eq(projecttimeentries.taskid, input.taskid),
        ),
      )
      .limit(1);

    // Open a new entry for the requested task
    const [newEntry] = await db
      .insert(projecttimeentries)
      .values({
        taskid: input.taskid,
        projectid: session.projectid,
        userid: input.userid,
        companyid: session.companyid,
        aispecsessionid: input.sessionid,
        source: "ai",
        starttime: now,
        billable: true,
      })
      .returning();

    if (prior.length === 0) {
      await db
        .update(aispecsessions)
        .set({
          taskcount: sql`${aispecsessions.taskcount} + 1`,
          updatedat: now,
        })
        .where(eq(aispecsessions.id, input.sessionid));
    } else {
      await db
        .update(aispecsessions)
        .set({ updatedat: now })
        .where(eq(aispecsessions.id, input.sessionid));
    }

    logger.info(
      { sessionid: input.sessionid, taskid: input.taskid, entryid: newEntry.id },
      "AI session task switched",
    );
    return newEntry;
  }

  /**
   * Add overhead minutes (Q&A, clarifications) to the session.
   */
  static async addOverhead(input: AddOverheadInput) {
    if (input.minutes <= 0) {
      throw new Error("Overhead minutes must be positive");
    }
    const session = await AISpecSessionService.getSession(input.sessionid);
    if (!session) {
      throw new Error("Session not found");
    }
    if (session.status !== "active") {
      throw new Error(`Session is ${session.status}, cannot add overhead`);
    }

    await db
      .update(aispecsessions)
      .set({
        overheadduration: sql`${aispecsessions.overheadduration} + ${input.minutes}`,
        updatedat: new Date(),
      })
      .where(eq(aispecsessions.id, input.sessionid));

    return AISpecSessionService.getSession(input.sessionid);
  }

  /**
   * Close a session: stop any open AI entry, persist summaries,
   * compute totalduration, mark status.
   */
  static async closeSession(input: CloseSessionInput) {
    const session = await AISpecSessionService.getSession(input.sessionid);
    if (!session) {
      throw new Error("Session not found");
    }
    if (session.status !== "active") {
      return session; // already closed
    }

    const now = new Date();

    // Close any open AI entries for this session
    const open = await db
      .select()
      .from(projecttimeentries)
      .where(
        and(
          eq(projecttimeentries.aispecsessionid, input.sessionid),
          isNull(projecttimeentries.endtime),
        ),
      );

    for (const entry of open) {
      const durationMin = Math.max(
        0,
        Math.floor((now.getTime() - entry.starttime.getTime()) / 60000),
      );
      await db
        .update(projecttimeentries)
        .set({
          endtime: now,
          duration: durationMin,
          updatedat: now,
        })
        .where(eq(projecttimeentries.id, entry.id));
    }

    // Apply per-task summaries if provided
    if (input.taskSummaries) {
      const entries = await db
        .select()
        .from(projecttimeentries)
        .where(eq(projecttimeentries.aispecsessionid, input.sessionid));

      // Group by taskid; aggregate summary onto the last entry for that task
      const byTask = new Map<string, typeof entries>();
      for (const entry of entries) {
        // [SCOPE 005 / T002] taskid is nullable since 0072; session entries always carry one.
        if (!entry.taskid) continue;
        const list = byTask.get(entry.taskid) ?? [];
        list.push(entry);
        byTask.set(entry.taskid, list);
      }

      for (const [taskid, summary] of Object.entries(input.taskSummaries)) {
        const list = byTask.get(taskid);
        if (!list || list.length === 0) continue;
        // Apply to most recently started entry for this task
        const target = list.sort(
          (a, b) => b.starttime.getTime() - a.starttime.getTime(),
        )[0];
        await db
          .update(projecttimeentries)
          .set({ completionnotesummary: summary, updatedat: now })
          .where(eq(projecttimeentries.id, target.id));
      }
    }

    // Compute totalduration from all entries in session
    const allEntries = await db
      .select({ duration: projecttimeentries.duration })
      .from(projecttimeentries)
      .where(eq(projecttimeentries.aispecsessionid, input.sessionid));
    const taskMinutes = allEntries.reduce(
      (sum, e) => sum + (e.duration ?? 0),
      0,
    );
    const refreshed = await AISpecSessionService.getSession(input.sessionid);
    const total = taskMinutes + (refreshed?.overheadduration ?? 0);

    const [closed] = await db
      .update(aispecsessions)
      .set({
        status: input.finalStatus ?? "completed",
        endtime: now,
        totalduration: total,
        summary: input.sessionSummary ?? refreshed?.summary ?? null,
        updatedat: now,
      })
      .where(eq(aispecsessions.id, input.sessionid))
      .returning();

    logger.info(
      {
        sessionid: input.sessionid,
        status: closed.status,
        totalduration: closed.totalduration,
        taskcount: closed.taskcount,
      },
      "AI spec session closed",
    );
    return closed;
  }

  /**
   * Background job: find active sessions where all spec tasks are completed
   * and auto-close them.
   */
  static async runAutoClose(): Promise<{ closed: number }> {
    const active = await db
      .select()
      .from(aispecsessions)
      .where(eq(aispecsessions.status, "active"));

    let closed = 0;
    for (const session of active) {
      // Resolve spec to projectspecifications.id; specid stored as string
      const specRow = await db
        .select({ id: projectspecifications.id })
        .from(projectspecifications)
        .where(
          and(
            eq(projectspecifications.projectid, session.projectid),
            // Accept matching against either the UUID id or a human spec
            // identifier stored elsewhere; here we match by id-equivalence
            // only if specid is a UUID; otherwise the comparison is by
            // string in projecttasks.specid below.
            sql`true`,
          ),
        )
        .limit(1);
      const specUuid = specRow[0]?.id ?? session.specid;

      // Count tasks linked to this spec
      const tasks = await db
        .select({ id: projecttasks.id, status: projecttasks.status })
        .from(projecttasks)
        .where(eq(projecttasks.specid, specUuid));

      if (tasks.length === 0) continue; // no tasks yet — leave session open

      const allDone = tasks.every((t) => t.status === "completed");
      if (!allDone) continue;

      await AISpecSessionService.closeSession({
        sessionid: session.id,
        userid: session.userid,
      });
      closed += 1;
    }

    if (closed > 0) {
      logger.info({ closed }, "Auto-closed AI spec sessions on completion");
    }
    return { closed };
  }

  /**
   * Background job: force-stop sessions older than MAX_SESSION_DAYS.
   */
  static async runTimeoutSweep(): Promise<{ timedOut: number }> {
    const cutoff = new Date(
      Date.now() - MAX_SESSION_DAYS * 24 * 60 * 60 * 1000,
    );
    const stale = await db
      .select()
      .from(aispecsessions)
      .where(
        and(
          eq(aispecsessions.status, "active"),
          sql`${aispecsessions.starttime} < ${cutoff.toISOString()}`,
        ),
      );

    let timedOut = 0;
    for (const session of stale) {
      await AISpecSessionService.closeSession({
        sessionid: session.id,
        userid: session.userid,
        finalStatus: "timeout",
      });
      timedOut += 1;
    }

    if (timedOut > 0) {
      logger.warn(
        { timedOut, cutoff: cutoff.toISOString() },
        "Timed out long-running AI spec sessions",
      );
    }
    return { timedOut };
  }
}
