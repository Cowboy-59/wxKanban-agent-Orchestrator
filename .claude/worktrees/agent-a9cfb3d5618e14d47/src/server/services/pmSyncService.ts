/**
 * PM Sync Service
 * Handles synchronization of tasks from external PM systems to wxKanban
 */

import { db } from '~/db/client.js';
import { projecttasks } from '~/db/schema/projecttask.js';
import { pmsystemconnections } from '~/db/schema/pmSystemConnection.js';
import { tasksyncrecords } from '~/db/schema/tasksyncrecord.js';
import { eq, and, sql } from 'drizzle-orm';
import { logger } from '~/server/lib/logger.js';
import { fetchTasksFromPMSystem, type PMSystem } from './pmSystemService.js';
import { createPMAdapter } from '~/server/lib/pm-adapters/index.js';
import type { PMTask } from '~/server/lib/pm-adapters/base.js';
import { ScopeStageService } from './ScopeStageService.js'; // [SCOPE 123 / T019]

export interface SyncResult {
  pmsystem: PMSystem;
  added: number;
  updated: number;
  unchanged: number;
  errors: string[];
}

/**
 * Format Date to YYYY-MM-DD string for date columns
 */
function formatDate(date: Date | undefined): string | undefined {
  if (!date) return undefined;
  return date.toISOString().split('T')[0];
}

/**
 * Sync tasks from a specific PM system for a user
 */
export async function syncTasksFromPM(
  userid: string,
  pmsystem: PMSystem
): Promise<SyncResult> {
  logger.info({ userid, pmsystem }, 'Starting PM task sync');

  const result: SyncResult = {
    pmsystem,
    added: 0,
    updated: 0,
    unchanged: 0,
    errors: [],
  };

  try {
    // Fetch tasks from PM system
    const pmTasks = await fetchTasksFromPMSystem(userid, pmsystem);

    if (pmTasks.length === 0) {
      logger.info({ userid, pmsystem }, 'No tasks found in PM system');
      return result;
    }

    // Get existing tasks for this user from this PM system
    const existingTasks = await db
      .select()
      .from(projecttasks)
      .where(
        and(
          eq(projecttasks.assignedtoid, userid),
          eq(projecttasks.sourcepmssystem, pmsystem)
        )
      );

    const existingTaskMap = new Map(existingTasks.map(t => [t.externalid, t]));

    // Process each PM task
    for (const pmTask of pmTasks) {
      try {
        const existingTask = existingTaskMap.get(pmTask.externalId);

        if (!existingTask) {
          // Create new task
          await createTaskFromPM(userid, pmsystem, pmTask);
          result.added++;
        } else if (shouldUpdateTask(existingTask, pmTask)) {
          // Update existing task
          await updateTaskFromPM(existingTask.id, pmTask);
          result.updated++;
        } else {
          result.unchanged++;
        }
      } catch (taskError) {
        const errorMsg = taskError instanceof Error ? taskError.message : 'Unknown error';
        logger.error(
          { error: errorMsg, externalId: pmTask.externalId },
          'Failed to sync individual task'
        );
        result.errors.push(`Task ${pmTask.externalId}: ${errorMsg}`);
      }
    }

    logger.info(
      {
        userid,
        pmsystem,
        added: result.added,
        updated: result.updated,
        unchanged: result.unchanged,
        errors: result.errors.length,
      },
      'PM task sync completed'
    );

    return result;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error: errorMsg, userid, pmsystem }, 'PM task sync failed');
    result.errors.push(`Sync failed: ${errorMsg}`);
    return result;
  }
}

/**
 * Sync tasks from all connected PM systems for a user
 */
export async function syncAllPMTasks(userid: string): Promise<SyncResult[]> {
  logger.info({ userid }, 'Starting sync for all PM systems');

  const systems: PMSystem[] = ['jira', 'monday'];
  const results: SyncResult[] = [];

  for (const pmsystem of systems) {
    try {
      const result = await syncTasksFromPM(userid, pmsystem);
      results.push(result);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ error: errorMsg, pmsystem }, 'Failed to sync PM system');
      results.push({
        pmsystem,
        added: 0,
        updated: 0,
        unchanged: 0,
        errors: [`Sync failed: ${errorMsg}`],
      });
    }
  }

  return results;
}

/**
 * Determine if a task should be updated based on PM data
 */
function shouldUpdateTask(
  existingTask: { updatedat: Date; name: string; status: string },
  pmTask: PMTask
): boolean {
  // Check if title changed
  if (existingTask.name !== pmTask.title) {
    return true;
  }

  // Check if status changed
  if (existingTask.status !== mapPMStatusToTaskStatus(pmTask.status)) {
    return true;
  }

  return false;
}

/**
 * Create a new task from PM system data
 */
async function createTaskFromPM(
  userid: string,
  pmsystem: PMSystem,
  pmTask: PMTask
): Promise<void> {
  // Get project ID from environment variable
  const projectId = process.env['PM_SYNC_DEFAULT_PROJECT_ID'];

  if (!projectId) {
    logger.warn(
      { userid, pmsystem, externalId: pmTask.externalId },
      'Skipping PM task sync: PM_SYNC_DEFAULT_PROJECT_ID not set in environment'
    );
    throw new Error('PM_SYNC_DEFAULT_PROJECT_ID environment variable not set');
  }

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(projectId)) {
    logger.warn(
      { userid, pmsystem, externalId: pmTask.externalId, projectId },
      'Skipping PM task sync: PM_SYNC_DEFAULT_PROJECT_ID is not a valid UUID'
    );
    throw new Error('PM_SYNC_DEFAULT_PROJECT_ID is not a valid UUID');
  }

  await db.insert(projecttasks).values({
    assignedtoid: userid,
    externalid: pmTask.externalId,
    sourcepmssystem: pmsystem,
    name: pmTask.title,
    description: pmTask.description || undefined,
    status: mapPMStatusToTaskStatus(pmTask.status),
    priority: mapPMPriorityToTaskPriority(pmTask.priority) || 'medium',
    duedate: formatDate(pmTask.dueDate),
    projectid: projectId,
    sourceoforigin: 'external',
  });

  logger.debug(
    { userid, pmsystem, externalId: pmTask.externalId, projectId },
    'Created new task from PM system'
  );
}

/**
 * Update an existing task from PM system data
 */
async function updateTaskFromPM(
  taskId: string,
  pmTask: PMTask
): Promise<void> {
  await db
    .update(projecttasks)
    .set({
      name: pmTask.title,
      description: pmTask.description || undefined,
      status: mapPMStatusToTaskStatus(pmTask.status),
      priority: mapPMPriorityToTaskPriority(pmTask.priority) || 'medium',
      duedate: formatDate(pmTask.dueDate),
    })
    .where(eq(projecttasks.id, taskId));

  // [SCOPE 123 / T019] A status synced from the PM system can close a scope's last open task.
  await ScopeStageService.onTasksWritten([taskId], { actor: 'pm-sync', trigger: 'task_status' });

  logger.debug(
    { taskId, externalId: pmTask.externalId },
    'Updated task from PM system'
  );
}

/**
 * Map PM system status to wxKanban task status
 */
function mapPMStatusToTaskStatus(pmStatus: string): string {
  const statusMap: Record<string, string> = {
    'open': 'open',
    'in_progress': 'in_progress',
    'completed': 'completed',
    'orphaned': 'orphaned',
    'To Do': 'open',
    'In Progress': 'in_progress',
    'Done': 'completed',
    'Closed': 'completed',
    'active': 'in_progress',
    'archived': 'completed',
  };

  return statusMap[pmStatus] || 'open';
}

/**
 * Map PM system priority to wxKanban task priority
 */
function mapPMPriorityToTaskPriority(pmPriority?: string): string | null {
  if (!pmPriority) return null;

  const priorityMap: Record<string, string> = {
    'highest': 'critical',
    'high': 'high',
    'medium': 'medium',
    'low': 'low',
    'lowest': 'low',
    'Critical': 'critical',
    'Major': 'high',
    'Minor': 'low',
    'Trivial': 'low',
    'urgent': 'critical',
  };

  return priorityMap[pmPriority] || 'medium';
}

/**
 * Get sync status for all PM systems for a user
 */
export async function getSyncStatus(userid: string): Promise<{
  pmsystem: PMSystem;
  lastsyncsat: Date | null;
  syncstatus: string;
  taskcount: number;
}[]> {
  try {
    const { getUserPMConnections } = await import('./pmSystemService.js');
    const connections = await getUserPMConnections(userid);

    const status = await Promise.all(
      connections.map(async (conn) => {
        const taskCount = await db
          .select({ count: projecttasks.id })
          .from(projecttasks)
          .where(
            and(
              eq(projecttasks.assignedtoid, userid),
              eq(projecttasks.sourcepmssystem, conn.pmsystem)
            )
          )
          .then(rows => rows.length);

        return {
          pmsystem: conn.pmsystem,
          lastsyncsat: null, // Not in PMConnection interface yet
          syncstatus: conn.syncstatus,
          taskcount: taskCount,
        };
      })
    );

    return status;
  } catch (error) {
    logger.error({ error, userid }, 'Failed to get sync status');
    throw new Error('Failed to get sync status');
  }
}

/**
 * Process pending outbound sync records (FR-006).
 *
 * Picks up tasksyncrecords with lastsyncstatus='pending', resolves the PM
 * adapter for the linked connection, and pushes the pendingstatus to the
 * external system. Failures are recorded with retrycount++ and remain
 * pending for the next cycle.
 *
 * Status mapping (wxKanban -> PM): 'active'/'in_progress' -> 'In Progress',
 * 'blocked' -> 'Blocked', 'suspended' -> 'On Hold'. Adapters normalize
 * further as needed.
 */
const MAX_OUTBOUND_RETRIES = 5;

function mapStatusForPM(status: string | null | undefined): string {
  switch (status) {
    case 'active':
    case 'in_progress':
      return 'In Progress';
    case 'blocked':
      return 'Blocked';
    case 'suspended':
      return 'On Hold';
    case 'completed':
      return 'Done';
    default:
      return status ?? 'In Progress';
  }
}

export async function runOutboundSync(): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
}> {
  const pending = await db
    .select({
      record: tasksyncrecords,
      task: projecttasks,
      connection: pmsystemconnections,
    })
    .from(tasksyncrecords)
    .innerJoin(projecttasks, eq(tasksyncrecords.taskid, projecttasks.id))
    .innerJoin(pmsystemconnections, eq(tasksyncrecords.pmconnectionid, pmsystemconnections.id))
    .where(
      and(
        eq(tasksyncrecords.lastsyncstatus, 'pending'),
        sql`${tasksyncrecords.retrycount} < ${MAX_OUTBOUND_RETRIES}`,
      ),
    );

  let succeeded = 0;
  let failed = 0;

  for (const row of pending) {
    const { record, task, connection } = row;
    const now = new Date();

    try {
      if (!task.externalid) {
        throw new Error('Task is missing externalid; cannot sync back');
      }
      const adapter = createPMAdapter(
        connection.pmsystem as 'jira' | 'monday' | 'asana' | 'trello',
        connection.accesstoken,
        connection.refreshtoken,
      );
      const pmStatus = mapStatusForPM(record.pendingstatus);
      await adapter.updateTaskStatus(connection.accesstoken, task.externalid, pmStatus);

      await db
        .update(tasksyncrecords)
        .set({
          lastsyncstatus: 'success',
          lastsyncedat: now,
          lastsyncerror: null,
          updatedat: now,
        })
        .where(eq(tasksyncrecords.id, record.id));
      succeeded += 1;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      const nextRetry = record.retrycount + 1;
      await db
        .update(tasksyncrecords)
        .set({
          lastsyncstatus: nextRetry >= MAX_OUTBOUND_RETRIES ? 'failed' : 'pending',
          lastsyncedat: now,
          lastsyncerror: errorMsg,
          retrycount: nextRetry,
          updatedat: now,
        })
        .where(eq(tasksyncrecords.id, record.id));
      logger.warn(
        { taskid: task.id, pmsystem: connection.pmsystem, retry: nextRetry, error: errorMsg },
        'Outbound PM sync failed',
      );
      failed += 1;
    }
  }

  if (pending.length > 0) {
    logger.info(
      { processed: pending.length, succeeded, failed },
      'Outbound PM sync batch complete',
    );
  }
  return { processed: pending.length, succeeded, failed };
}

