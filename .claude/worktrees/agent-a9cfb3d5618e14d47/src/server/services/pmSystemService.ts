import { db } from '~/db/client.js';
import { pmsystemconnections } from '~/db/schema/pmSystemConnection';
import { eq } from 'drizzle-orm';
import { logger } from '~/server/lib/logger';
import { createJiraAdapter } from '~/server/lib/pm-adapters/jira.js';
import { createMondayAdapter } from '~/server/lib/pm-adapters/monday.js';
import type { PMTask } from '~/server/lib/pm-adapters/base.js';
import { initializeUserSyncJobs } from './jobScheduler.js';



export type PMSystem = 'jira' | 'monday' | 'asana' | 'trello';

export interface PMConnection {
  id: string;
  userid: string;
  pmsystem: PMSystem;
  syncstatus: string;
  createdat: Date;
  updatedat: Date;
}

/**
 * Get all PM system connections for a user
 */
export async function getUserPMConnections(userid: string): Promise<PMConnection[]> {
  try {
    const connections = await db
      .select()
      .from(pmsystemconnections)
      .where(eq(pmsystemconnections.userid, userid));

    return connections.map((conn) => ({
      id: conn.id,
      userid: conn.userid,
      pmsystem: conn.pmsystem as PMSystem,
      syncstatus: conn.syncstatus,
      createdat: conn.createdat,
      updatedat: conn.updatedat,
    }));
  } catch (error) {
    logger.error({ error, userid }, 'Failed to get user PM connections');
    throw new Error('Failed to get PM connections');
  }
}

/**
 * Get a specific PM system connection
 */
export async function getPMConnection(
  userid: string,
  pmsystem: PMSystem
): Promise<PMConnection | null> {
  try {
    const connection = await db
      .select()
      .from(pmsystemconnections)
      .where(
        eq(pmsystemconnections.userid, userid)
      )
      .then((rows) => rows.find((r) => r.pmsystem === pmsystem));

    if (!connection) {
      return null;
    }

    return {
      id: connection.id,
      userid: connection.userid,
      pmsystem: connection.pmsystem as PMSystem,
      syncstatus: connection.syncstatus,
      createdat: connection.createdat,
      updatedat: connection.updatedat,
    };
  } catch (error) {
    logger.error({ error, userid, pmsystem }, 'Failed to get PM connection');
    throw new Error('Failed to get PM connection');
  }
}

/**
 * Disconnect a PM system
 */
export async function disconnectPMSystem(userid: string, pmsystem: PMSystem): Promise<boolean> {
  try {
    const connection = await getPMConnection(userid, pmsystem);

    if (!connection) {
      return false;
    }

    await db
      .delete(pmsystemconnections)
      .where(eq(pmsystemconnections.id, connection.id));

    logger.info({ userid, pmsystem }, 'PM system disconnected');
    return true;
  } catch (error) {
    logger.error({ error, userid, pmsystem }, 'Failed to disconnect PM system');
    throw new Error('Failed to disconnect PM system');
  }
}

/**
 * Connect a PM system and store credentials
 */
export async function connectPMSystem({
  userid,
  pmsystem,
  accesstoken,
  refreshtoken,
  expiresat,
}: {
  userid: string;
  pmsystem: PMSystem;
  accesstoken: string;
  refreshtoken: string;
  expiresat: Date;
}): Promise<PMConnection> {
  try {
    // Check if connection already exists
    const existing = await getPMConnection(userid, pmsystem);

    if (existing) {
      // Update existing connection
      await db
        .update(pmsystemconnections)
        .set({
          accesstoken,
          refreshtoken,
          expiresat,
          syncstatus: 'active',
          lastsyncsat: new Date(),
          updatedat: new Date(),
        })
        .where(eq(pmsystemconnections.id, existing.id));

      logger.info({ userid, pmsystem }, 'PM system connection updated');
      return {
        ...existing,
        syncstatus: 'active',
      };
    }

    // Create new connection
    const [connection] = await db
      .insert(pmsystemconnections)
      .values({
        userid,
        pmsystem,
        accesstoken,
        refreshtoken,
        expiresat,
        syncstatus: 'active',
        lastsyncsat: new Date(),
      })
      .returning();

      logger.info({ userid, pmsystem, connectionId: connection.id }, 'PM system connected');

      // Initialize sync jobs for this user
      initializeUserSyncJobs(userid);

      return {
        id: connection.id,
        userid: connection.userid,
        pmsystem: connection.pmsystem as PMSystem,
        syncstatus: connection.syncstatus,
        createdat: connection.createdat,
        updatedat: connection.updatedat,
      };

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ error: message, userid, pmsystem }, 'Failed to connect PM system');
    throw new Error(`Failed to connect PM system: ${message}`);
  }
}

/**
 * Fetch tasks from a PM system using adapters
 */
export async function fetchTasksFromPMSystem(
  userid: string,
  pmsystem: PMSystem
): Promise<PMTask[]> {
  try {
    const connection = await getPMConnection(userid, pmsystem);

    if (!connection || connection.syncstatus !== 'active') {
      logger.warn({ userid, pmsystem }, 'PM system connection not active');
      return [];
    }

    // Get the full connection details with tokens
    const fullConnection = await db
      .select()
      .from(pmsystemconnections)
      .where(eq(pmsystemconnections.id, connection.id))
      .then((rows) => rows[0]);

    if (!fullConnection) {
      return [];
    }

    // Use appropriate adapter to fetch tasks
    let tasks: PMTask[] = [];
    try {
      if (pmsystem === 'jira') {
        const jiraAdapter = createJiraAdapter();
        tasks = await jiraAdapter.fetchTasks(fullConnection.accesstoken, { limit: 50 });
      } else if (pmsystem === 'monday') {
        const mondayAdapter = createMondayAdapter();
        tasks = await mondayAdapter.fetchTasks(fullConnection.accesstoken, { limit: 50 });
      } else {
        logger.warn({ pmsystem }, 'Unsupported PM system for task fetching');
        return [];
      }

      // Update last sync timestamp
      await db
        .update(pmsystemconnections)
        .set({
          lastsyncsat: new Date(),
          updatedat: new Date(),
        })
        .where(eq(pmsystemconnections.id, connection.id));

      logger.info({ userid, pmsystem, taskCount: tasks.length }, 'Successfully fetched tasks from PM system');
      return tasks;
    } catch (adapterError) {
      logger.error(
        { error: adapterError instanceof Error ? adapterError.message : 'Unknown error', pmsystem },
        'PM adapter failed to fetch tasks'
      );
      return [];
    }
  } catch (error) {
    logger.error({ error, userid, pmsystem }, 'Failed to fetch tasks from PM system');
    throw new Error('Failed to fetch tasks from PM system');
  }
}
