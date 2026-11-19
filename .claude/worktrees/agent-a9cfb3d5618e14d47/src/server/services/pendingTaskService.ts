import { db } from '~/db/client.js';
import { companyprojects } from '~/db/schema/companyproject.js';
import { projecttasks } from '~/db/schema/projecttask.js';
import { projectspecifications } from '~/db/schema/projectspecification.js';
import { projectphases } from '~/db/schema/projectphase.js';
import { eq, and, inArray, sql, isNull } from 'drizzle-orm';
import { createLogger } from '~/server/lib/logger.js';

const logger = createLogger('pending-task-service');

export interface ProjectTaskSummary {
  id: string;
  name: string;
  opencount: number;
  inprogresscount: number;
  totalpending: number;
}

export interface ScopeTaskGroup {
  id: string | null;
  specnumber: string | null;
  title: string;
  status: string | null;
  tasks: Array<{
    id: string;
    name: string;
    priority: string;
    status: string;
    assignee: string | null;
    duedate: string | null;
  }>;
}

export interface PendingTasksResult {
  project: {
    id: string;
    name: string;
    currentphase: string;
    totalpending: number;
  };
  scopes: ScopeTaskGroup[];
  unscopedtasks: ScopeTaskGroup['tasks'];
}

/**
 * Get per-project summary of pending tasks for a company.
 */
export async function getProjectTaskSummaries(companyid: string): Promise<ProjectTaskSummary[]> {
  try {
    const projects = await db
      .select({
        id: companyprojects.id,
        name: companyprojects.name,
      })
      .from(companyprojects)
      .where(
        and(
          eq(companyprojects.companyid, companyid),
          eq(companyprojects.status, 'ACTIVE'),
        )
      );

    const summaries: ProjectTaskSummary[] = [];

    for (const project of projects) {
      // Include all non-completed statuses: open, todo, in_progress
      const tasks = await db
        .select({
          status: projecttasks.status,
        })
        .from(projecttasks)
        .where(
          and(
            eq(projecttasks.projectid, project.id),
            inArray(projecttasks.status, ['open', 'todo', 'in_progress']),
          )
        );

      const opencount = tasks.filter((t) => t.status === 'open' || t.status === 'todo').length;
      const inprogresscount = tasks.filter((t) => t.status === 'in_progress').length;

      summaries.push({
        id: project.id,
        name: project.name,
        opencount,
        inprogresscount,
        totalpending: opencount + inprogresscount,
      });
    }

    // Sort by totalpending descending
    summaries.sort((a, b) => b.totalpending - a.totalpending);

    return summaries;
  } catch (error) {
    logger.error({ error, companyid }, 'Failed to get project task summaries');
    throw new Error('Failed to get project task summaries');
  }
}

/**
 * Get pending tasks for a project, grouped by scope (specification).
 * Role-based filtering applied server-side.
 */
export async function getPendingTasksByScope(
  projectid: string,
  companyid: string,
  usertype: string,
  userid: string,
  filters?: {
    priority?: string;
    status?: string;
    assignee?: string;
    showcompleted?: boolean;
  },
): Promise<PendingTasksResult | null> {
  try {
    // Verify project belongs to company
    const [project] = await db
      .select({
        id: companyprojects.id,
        name: companyprojects.name,
        currentphase: companyprojects.currentphase,
      })
      .from(companyprojects)
      .where(
        and(
          eq(companyprojects.id, projectid),
          eq(companyprojects.companyid, companyid),
        )
      )
      .limit(1);

    if (!project) return null;

    // Build task query conditions
    const conditions = [eq(projecttasks.projectid, projectid)];

    // Status filter — include 'todo' alongside 'open' (MCP pipeline creates tasks as 'todo')
    if (filters?.showcompleted) {
      // Show all statuses
    } else if (filters?.status && filters.status !== 'both') {
      if (filters.status === 'open') {
        conditions.push(inArray(projecttasks.status, ['open', 'todo']));
      } else {
        conditions.push(eq(projecttasks.status, filters.status));
      }
    } else {
      conditions.push(inArray(projecttasks.status, ['open', 'todo', 'in_progress']));
    }

    // Role-based filtering
    if (usertype === 'TEAM' || usertype === 'CONTRIBUTOR' || usertype === 'TEAM_MEMBER') {
      conditions.push(eq(projecttasks.assignedtoid, userid));
    }

    // Priority filter
    if (filters?.priority && filters.priority !== 'all') {
      conditions.push(eq(projecttasks.priority, filters.priority));
    }

    // Assignee filter (Admin/Team Manager only)
    if (filters?.assignee && (usertype === 'ADMIN' || usertype === 'TEAM_MANAGER')) {
      conditions.push(eq(projecttasks.assignedtoid, filters.assignee));
    }

    // Fetch tasks with spec info
    const allTasks = await db
      .select({
        id: projecttasks.id,
        name: projecttasks.name,
        priority: projecttasks.priority,
        status: projecttasks.status,
        assignedtoid: projecttasks.assignedtoid,
        duedate: projecttasks.duedate,
        specid: projecttasks.specid,
      })
      .from(projecttasks)
      .where(and(...conditions));

    // Fetch specs for grouping
    const specs = await db
      .select({
        id: projectspecifications.id,
        specnumber: projectspecifications.specnumber,
        title: projectspecifications.title,
        status: projectspecifications.status,
      })
      .from(projectspecifications)
      .where(eq(projectspecifications.projectid, projectid));

    const specMap = new Map(specs.map((s) => [s.id, s]));

    // Group tasks by scope
    const scopeGroups = new Map<string, ScopeTaskGroup>();
    const unscopedTasks: ScopeTaskGroup['tasks'] = [];

    for (const task of allTasks) {
      const taskRow = {
        id: task.id,
        name: task.name,
        priority: task.priority,
        status: task.status,
        assignee: task.assignedtoid,
        duedate: task.duedate?.toISOString() || null,
      };

      if (task.specid && specMap.has(task.specid)) {
        const spec = specMap.get(task.specid)!;
        if (!scopeGroups.has(task.specid)) {
          scopeGroups.set(task.specid, {
            id: spec.id,
            specnumber: spec.specnumber,
            title: spec.title,
            status: spec.status,
            tasks: [],
          });
        }
        scopeGroups.get(task.specid)!.tasks.push(taskRow);
      } else {
        unscopedTasks.push(taskRow);
      }
    }

    const totalpending = allTasks.length;

    return {
      project: {
        id: project.id,
        name: project.name,
        currentphase: project.currentphase,
        totalpending,
      },
      scopes: Array.from(scopeGroups.values()).sort((a, b) =>
        (a.specnumber || '').localeCompare(b.specnumber || '')
      ),
      unscopedtasks: unscopedTasks,
    };
  } catch (error) {
    logger.error({ error, projectid, companyid }, 'Failed to get pending tasks by scope');
    throw new Error('Failed to get pending tasks by scope');
  }
}
