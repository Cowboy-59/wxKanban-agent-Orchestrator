import { db } from '~/db/client.js';
import { projecttasks } from '~/db/schema/projecttask.js';
import { taskdependencies } from '~/db/schema/taskdependency.js';
import { projectspecifications } from '~/db/schema/projectspecification.js';
import { userprofiles } from '~/db/schema/userprofiles.js';
import { projecttimeentries } from '~/db/schema/projecttimeentry.js';
import { companyauditlogs } from '~/db/schema/companyauditlog.js';
import { projectphases } from '~/db/schema/projectphase.js';
import { eq, and, count, inArray } from 'drizzle-orm';
import { createLogger } from '~/server/lib/logger.js';
import { NotificationService } from '~/server/services/NotificationService.js';
import { ScopeService } from '~/server/services/ScopeService.js';
import { ScopeStageService } from '~/server/services/ScopeStageService.js'; // [SCOPE 123 / T019]
import type {
  ProjectTask,
  ProjectTaskDetail,
  TaskDependency,
  TaskActivityEntry,
} from '~/shared/types/projects.js';

const logger = createLogger('task-service');

export class TaskService {
  // ─── Task Detail ────────────────────────────────────────────────────────────

  static async getTask(projectid: string, taskid: string): Promise<ProjectTaskDetail | null> {
    const rows = await db
      .select({
        id: projecttasks.id,
        projectid: projecttasks.projectid,
        phaseid: projecttasks.phaseid,
        name: projecttasks.name,
        description: projecttasks.description,
        issuetype: projecttasks.issuetype,
        priority: projecttasks.priority,
        status: projecttasks.status,
        results: projecttasks.results,
        effort: projecttasks.effort,
        sourceoforigin: projecttasks.sourceoforigin,
        assignedtoid: projecttasks.assignedtoid,
        duedate: projecttasks.duedate,
        specid: projecttasks.specid,
        externalid: projecttasks.externalid,
        sourcepmssystem: projecttasks.sourcepmssystem,
        createdat: projecttasks.createdat,
        updatedat: projecttasks.updatedat,
        assignedtoname: userprofiles.fullname,
        scopetitle: projectspecifications.title,
      })
      .from(projecttasks)
      .leftJoin(userprofiles, eq(projecttasks.assignedtoid, userprofiles.id))
      .leftJoin(projectspecifications, eq(projecttasks.specid, projectspecifications.id))
      .where(and(eq(projecttasks.id, taskid), eq(projecttasks.projectid, projectid)));

    const r = rows[0];
    if (!r) return null;

    // Get dependencies
    const blockedByRows = await db
      .select({ blockedbyid: taskdependencies.blockedbyid })
      .from(taskdependencies)
      .where(eq(taskdependencies.taskid, taskid));

    const blockingRows = await db
      .select({ taskid: taskdependencies.taskid })
      .from(taskdependencies)
      .where(eq(taskdependencies.blockedbyid, taskid));

    const blockedByTaskIds = blockedByRows.map((b) => b.blockedbyid);
    const blockingTaskIds = blockingRows.map((b) => b.taskid);

    const [blockedByTasks, blockingTasks] = await Promise.all([
      blockedByTaskIds.length > 0
        ? db.select({ id: projecttasks.id, name: projecttasks.name, status: projecttasks.status }).from(projecttasks).where(inArray(projecttasks.id, blockedByTaskIds))
        : Promise.resolve([]),
      blockingTaskIds.length > 0
        ? db.select({ id: projecttasks.id, name: projecttasks.name, status: projecttasks.status }).from(projecttasks).where(inArray(projecttasks.id, blockingTaskIds))
        : Promise.resolve([]),
    ]);

    // Count time entries (notes table has no taskid column yet — returns 0)
    const [[timeCount]] = await Promise.all([
      db.select({ cnt: count() }).from(projecttimeentries).where(eq(projecttimeentries.taskid, taskid)),
    ]);
    const noteCount = { cnt: 0 };

    const isblocked = blockedByTasks.some((t) => t.status !== 'completed');

    return {
      id: r.id,
      projectid: r.projectid,
      phaseid: r.phaseid ?? null,
      name: r.name,
      description: r.description ?? null,
      issuetype: r.issuetype ?? null,
      priority: r.priority,
      status: r.status,
      results: r.results ?? null,
      effort: r.effort ?? null,
      sourceoforigin: r.sourceoforigin,
      assignedtoid: r.assignedtoid ?? null,
      assignedtoname: r.assignedtoname ?? null,
      duedate: r.duedate?.toString() ?? null,
      specid: r.specid ?? null,
      scopetitle: r.scopetitle ?? null,
      externalid: r.externalid ?? null,
      sourcepmssystem: r.sourcepmssystem ?? null,
      blockedby: blockedByTasks,
      blocking: blockingTasks,
      timeentriescount: Number(timeCount?.cnt ?? 0),
      notescount: Number(noteCount?.cnt ?? 0),
      isblocked,
      createdat: r.createdat.toISOString(),
      updatedat: r.updatedat.toISOString(),
    };
  }

  static async getTasksByPhase(
    projectid: string,
    phaseid: string,
    scopeid?: string
  ): Promise<{
    groups: Array<{
      scopeid: string | null;
      scopenumber: string | null;
      scopetitle: string | null;
      scopestatus: string | null;
      tasks: ProjectTask[];
      taskcount: number;
      completedcount: number;
    }>;
    unscopedtasks: ProjectTask[];
  }> {
    const conditions = [eq(projecttasks.projectid, projectid), eq(projecttasks.phaseid, phaseid)];
    if (scopeid) conditions.push(eq(projecttasks.specid, scopeid));

    const rows = await db
      .select({
        id: projecttasks.id,
        projectid: projecttasks.projectid,
        phaseid: projecttasks.phaseid,
        name: projecttasks.name,
        description: projecttasks.description,
        issuetype: projecttasks.issuetype,
        priority: projecttasks.priority,
        status: projecttasks.status,
        results: projecttasks.results,
        effort: projecttasks.effort,
        sourceoforigin: projecttasks.sourceoforigin,
        assignedtoid: projecttasks.assignedtoid,
        duedate: projecttasks.duedate,
        specid: projecttasks.specid,
        createdat: projecttasks.createdat,
        updatedat: projecttasks.updatedat,
        assignedtoname: userprofiles.fullname,
        scopenumber: projectspecifications.specnumber,
        scopetitle: projectspecifications.title,
        scopestatus: projectspecifications.status,
      })
      .from(projecttasks)
      .leftJoin(userprofiles, eq(projecttasks.assignedtoid, userprofiles.id))
      .leftJoin(projectspecifications, eq(projecttasks.specid, projectspecifications.id))
      .where(and(...conditions));

    // Check blocked status for all tasks
    const taskIds = rows.map((r) => r.id);
    const allDeps = taskIds.length > 0
      ? await db.select({ taskid: taskdependencies.taskid, blockedbyid: taskdependencies.blockedbyid })
          .from(taskdependencies).where(inArray(taskdependencies.taskid, taskIds))
      : [];

    const openBlockers = new Set<string>();
    if (allDeps.length > 0) {
      const blockerIds = [...new Set(allDeps.map((d) => d.blockedbyid))];
      const blockerStatuses = await db
        .select({ id: projecttasks.id, status: projecttasks.status })
        .from(projecttasks)
        .where(inArray(projecttasks.id, blockerIds));
      const openBlockerIds = new Set(blockerStatuses.filter((b) => b.status !== 'completed').map((b) => b.id));
      for (const dep of allDeps) {
        if (openBlockerIds.has(dep.blockedbyid)) openBlockers.add(dep.taskid);
      }
    }

    const toTask = (r: typeof rows[0]): ProjectTask => ({
      id: r.id,
      projectid: r.projectid,
      phaseid: r.phaseid ?? null,
      name: r.name,
      description: r.description ?? null,
      issuetype: r.issuetype ?? null,
      priority: r.priority,
      status: r.status,
      results: r.results ?? null,
      effort: r.effort ?? null,
      sourceoforigin: r.sourceoforigin,
      assignedtoid: r.assignedtoid ?? null,
      assignedtoname: r.assignedtoname ?? null,
      duedate: r.duedate?.toString() ?? null,
      createdat: r.createdat.toISOString(),
      updatedat: r.updatedat.toISOString(),
    });

    const scopedRows = rows.filter((r) => r.specid !== null);
    const unscopedRows = rows.filter((r) => r.specid === null);

    // Group by scope
    const groupMap = new Map<string, typeof scopedRows>();
    for (const r of scopedRows) {
      const key = r.specid!;
      const arr = groupMap.get(key) ?? [];
      arr.push(r);
      groupMap.set(key, arr);
    }

    const groups = [...groupMap.entries()].map(([sid, grpRows]) => {
      const first = grpRows[0]!;
      return {
        scopeid: sid,
        scopenumber: first.scopenumber ?? null,
        scopetitle: first.scopetitle ?? null,
        scopestatus: first.scopestatus ?? null,
        tasks: grpRows.map(toTask),
        taskcount: grpRows.length,
        completedcount: grpRows.filter((r) => r.status === 'completed').length,
      };
    });

    return { groups, unscopedtasks: unscopedRows.map(toTask) };
  }

  static async updateTask(
    projectid: string,
    taskid: string,
    data: {
      name?: string;
      description?: string;
      status?: string;
      results?: string;
      priority?: string;
      issuetype?: string;
      effort?: string;
      assignedtoid?: string | null;
      duedate?: string | null;
      specid?: string | null;
    },
    updatedbyid: string,
    companyid: string
  ): Promise<ProjectTaskDetail> {
    const task = await this.getTask(projectid, taskid);
    if (!task) throw new Error('Task not found');

    const updates: Record<string, unknown> = { updatedat: new Date() };
    if (data.name !== undefined) updates.name = data.name;
    if (data.description !== undefined) updates.description = data.description;
    if (data.status !== undefined) updates.status = data.status;
    if (data.results !== undefined) updates.results = data.results;
    if (data.priority !== undefined) updates.priority = data.priority;
    if (data.issuetype !== undefined) updates.issuetype = data.issuetype;
    if (data.effort !== undefined) updates.effort = data.effort;
    if (data.assignedtoid !== undefined) updates.assignedtoid = data.assignedtoid;
    if (data.duedate !== undefined) updates.duedate = data.duedate;
    if (data.specid !== undefined) updates.specid = data.specid;

    await db.update(projecttasks).set(updates).where(eq(projecttasks.id, taskid));

    // [SCOPE 123 / T019] Side-effect: a status change (or a move to another scope) can close a
    // scope's last open task. Advance the scope it is in now and the one it left. Never throws.
    if (data.status !== undefined || data.specid !== undefined) {
      const scopeids = [task.specid, data.specid ?? null].filter((s): s is string => !!s);
      await ScopeStageService.advance(scopeids, { actor: updatedbyid, trigger: 'task_status' });
    }

    // Side-effect: assignment notification
    if (data.assignedtoid && data.assignedtoid !== task.assignedtoid) {
      await NotificationService.create({
        userid: data.assignedtoid,
        type: 'task_assigned',
        entityid: taskid,
        entitytype: 'task',
        message: `You were assigned: ${task.name}`,
      });
    }

    // Side-effect: QA fail → auto-create bug in Phase 2 (T026)
    if (data.results === 'fail' && task.phaseid) {
      await this.handleQAFail(task, companyid, updatedbyid);
    }

    // Side-effect: Phase 4/5 escalated → auto-create scope stub (T027)
    if (data.status === 'escalated') {
      await this.handleEscalated(task, projectid, companyid, updatedbyid);
    }

    return this.getTask(projectid, taskid) as Promise<ProjectTaskDetail>;
  }

  // ─── Task Dependency Management ─────────────────────────────────────────────

  static async addDependency(
    taskid: string,
    blockedbyid: string
  ): Promise<TaskDependency> {
    if (taskid === blockedbyid) throw new Error('A task cannot depend on itself');

    const wouldCycle = await this.wouldCreateCycle(taskid, blockedbyid);
    if (wouldCycle) throw new Error('Adding this dependency would create a circular dependency');

    const [created] = await db
      .insert(taskdependencies)
      .values({ taskid, blockedbyid })
      .returning();

    logger.info({ taskid, blockedbyid }, 'Task dependency added');
    return {
      id: created.id,
      taskid: created.taskid,
      blockedbyid: created.blockedbyid,
      createdat: created.createdat.toISOString(),
    };
  }

  static async removeDependency(dependencyid: string): Promise<void> {
    await db.delete(taskdependencies).where(eq(taskdependencies.id, dependencyid));
    logger.info({ dependencyid }, 'Task dependency removed');
  }

  // ─── Activity Log ───────────────────────────────────────────────────────────

  static async getActivity(taskid: string): Promise<TaskActivityEntry[]> {
    const rows = await db
      .select({
        id: companyauditlogs.id,
        changedby: companyauditlogs.changedby,
        action: companyauditlogs.action,
        description: companyauditlogs.description,
        timestamp: companyauditlogs.timestamp,
        actorname: userprofiles.fullname,
      })
      .from(companyauditlogs)
      .leftJoin(userprofiles, eq(companyauditlogs.changedby, userprofiles.id))
      .where(eq(companyauditlogs.description, `task:${taskid}`));

    return rows.map((r) => ({
      id: r.id,
      actorid: r.changedby ?? '',
      actorname: r.actorname ?? 'Unknown',
      type: r.action,
      description: r.description ?? '',
      createdat: r.timestamp.toISOString(),
    }));
  }

  // ─── QA Fail Side Effect (T026) ─────────────────────────────────────────────

  private static async handleQAFail(
    task: ProjectTaskDetail,
    companyid: string,
    createdbyid: string
  ): Promise<void> {
    if (!task.phaseid) return;

    const implPhases = await db
      .select({ id: projectphases.id, assigneduserid: projectphases.assigneduserid })
      .from(projectphases)
      .where(and(eq(projectphases.projectid, task.projectid), eq(projectphases.phasename, 'Implementation')));

    const implPhase = implPhases[0];
    if (!implPhase) return;

    const [bugTask] = await db.insert(projecttasks).values({
      projectid: task.projectid,
      phaseid: implPhase.id,
      createdbyid,
      specid: task.specid,
      name: `Bug: ${task.name}`,
      description: `Auto-created from QA failure of task: ${task.name}\n\n${task.description ?? ''}`,
      issuetype: 'bug',
      priority: 'high',
      status: 'open',
      sourceoforigin: 'internal',
    }).returning();

    logger.info({ qaTaskId: task.id, bugTaskId: bugTask.id }, 'QA fail: auto-created bug task');

    if (implPhase.assigneduserid) {
      await NotificationService.create({
        userid: implPhase.assigneduserid,
        type: 'qa_fail_bug_created',
        entityid: bugTask.id,
        entitytype: 'task',
        message: `QA failure: bug task created for "${task.name}"`,
      });
    }

    await db.insert(companyauditlogs).values({
      companyid,
      action: 'qa_fail_bug_created',
      changedby: createdbyid,
      newvalue: { qaTaskId: task.id, bugTaskId: bugTask.id },
      description: `task:${task.id}`,
    });
  }

  // ─── Escalated Side Effect (T027) ───────────────────────────────────────────

  private static async handleEscalated(
    task: ProjectTaskDetail,
    projectid: string,
    companyid: string,
    createdbyid: string
  ): Promise<void> {
    const newScope = await ScopeService.createScope(
      projectid,
      createdbyid,
      {
        title: `escalated-${task.name.toLowerCase().replace(/\s+/g, '-').slice(0, 50)}`,
        content: `# Escalated Issue\n\n> Auto-created from escalated task during Human Testing / Beta.\n\n## Original Task\n**${task.name}**\n\n${task.description ?? ''}\n\n## Action Required\nReview this scope and assign to next release cycle.`,
      }
    );

    logger.info({ taskId: task.id, scopeId: newScope.id }, 'Escalated: auto-created draft scope stub');

    await db.insert(companyauditlogs).values({
      companyid,
      action: 'scope_stub_from_escalation',
      changedby: createdbyid,
      newvalue: { taskId: task.id, scopeId: newScope.id },
      description: `task:${task.id}`,
    });
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private static async wouldCreateCycle(taskid: string, newBlockerid: string): Promise<boolean> {
    // BFS: if taskid transitively blocks newBlockerid, adding that dep creates a cycle
    const visited = new Set<string>();
    const queue = [taskid];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current === newBlockerid) return true;
      if (visited.has(current)) continue;
      visited.add(current);

      const downstream = await db
        .select({ taskid: taskdependencies.taskid })
        .from(taskdependencies)
        .where(eq(taskdependencies.blockedbyid, current));

      for (const d of downstream) {
        if (!visited.has(d.taskid)) queue.push(d.taskid);
      }
    }
    return false;
  }
}
