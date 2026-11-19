import { db } from '~/db/client.js';
import { projecttimeentries } from '~/db/schema/projecttimeentry.js';
import { eq, gte, lte, desc, and, isNull } from 'drizzle-orm';
import { logger } from '~/server/lib/logger.js';
import { serializeDbError } from '~/server/lib/dbError.js';

/**
 * TimeEntry Interface - matches schema
 */
export interface TimeEntry {
  id: string;
  userid: string;
  companyid: string;
  taskid: string;
  projectid: string;
  starttime: Date;
  endtime: Date | null; // null = timer still running
  duration: number | null; // minutes; null while timer is running
  billable: boolean;
  entryrate: string | null; // rate snapshot at entry creation
  notes?: string;
  invoiced: boolean;
  invoicedat?: Date;
  createdat: Date;
  updatedat: Date;
}

/**
 * Create Time Entry Request
 */
export interface CreateTimeEntryRequest {
  userid: string;
  companyid: string;
  projectid: string;
  taskid: string;
  description?: string;
  notes?: string;
  billable?: boolean;
}

/**
 * Update Time Entry Request
 */
export interface UpdateTimeEntryRequest {
  endtime?: Date;
  duration?: number;
  description?: string;
  billable?: boolean;
}

/**
 * Time Summary
 */
export interface TimeSummary {
  totalDuration: number; // in seconds
  billableDuration: number; // in seconds
  entryCount: number;
  billableEntryCount: number;
}

/**
 * TimeTrackingService
 * Handles all time tracking operations
 */
export class TimeTrackingService {
  /**
   * Start a new time entry
   */
  static async startTimer(request: CreateTimeEntryRequest): Promise<TimeEntry> {
    const now = new Date();

    logger.debug(
      { projectid: request.projectid, taskid: request.taskid },
      'Starting timer'
    );

    try {
      const [newEntry] = await db
        .insert(projecttimeentries)
        .values({
          userid: request.userid,
          companyid: request.companyid,
          projectid: request.projectid,
          taskid: request.taskid,
          starttime: now,
          notes: request.notes || null,
          billable: request.billable ?? true,
          invoiced: false,
        })
        .returning();

      logger.info({ id: newEntry.id }, 'Timer started');
      return newEntry as TimeEntry;
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error', request },
        'Failed to start timer'
      );
      throw error;
    }
  }

  /**
   * Stop a running time entry
   */
  static async stopTimer(entryid: string, _userid?: string, companyid?: string): Promise<TimeEntry> {
    const endtime = new Date();

    logger.debug({ entryid }, 'Stopping timer');

    try {
      const entry = await db
        .select()
        .from(projecttimeentries)
        .where(eq(projecttimeentries.id, entryid))
        .then((rows) => rows[0]);

      if (!entry) {
        logger.warn({ entryid }, 'Time entry not found');
        throw new Error('Time entry not found');
      }

      // Tenant isolation: the entry must belong to the caller's company.
      if (companyid && entry.companyid !== companyid) {
        logger.warn({ entryid, companyid }, 'Time entry not in caller company');
        throw new Error('Time entry not found');
      }

      if (_userid && entry.userid !== _userid) {
        logger.warn({ entryid, userid: _userid }, 'Time entry does not belong to user');
        throw new Error('Time entry not found');
      }

      if (entry.endtime) {
        logger.warn({ entryid }, 'Timer is already stopped');
        throw new Error('Timer is already stopped');
      }

      // Calculate duration in minutes
      const durationMs = endtime.getTime() - entry.starttime.getTime();
      const duration = Math.floor(durationMs / (1000 * 60));

      const [stoppedEntry] = await db
        .update(projecttimeentries)
        .set({
          endtime,
          duration,
          updatedat: endtime,
        })
        .where(eq(projecttimeentries.id, entryid))
        .returning();

      logger.info(
        { entryid, duration: `${duration}min` },
        'Timer stopped'
      );
      return stoppedEntry as TimeEntry;
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error', entryid },
        'Failed to stop timer'
      );
      throw error;
    }
  }

  /**
   * Get a specific time entry
   */
  static async getTimeEntry(entryid: string, companyid?: string): Promise<TimeEntry | null> {
    try {
      const entry = await db
        .select()
        .from(projecttimeentries)
        .where(
          and(
            eq(projecttimeentries.id, entryid),
            // Tenant isolation: scope to the caller's company when provided.
            companyid ? eq(projecttimeentries.companyid, companyid) : undefined,
          ),
        )
        .then((rows) => rows[0]);

      return (entry as TimeEntry) ?? null;
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error', entryid },
        'Failed to fetch time entry'
      );
      throw error;
    }
  }

  /**
   * Get most recent timer for project
   * Note: All timers are complete (have endtime), so "active" means most recently started
   */
  static async getActiveTimer(
    userid: string,
    options: { source?: 'manual' | 'ai' } = {},
  ): Promise<TimeEntry | null> {
    try {
      const conditions = [
        eq(projecttimeentries.userid, userid),
        isNull(projecttimeentries.endtime),
      ];
      if (options.source) {
        conditions.push(eq(projecttimeentries.source, options.source));
      }

      const entry = await db
        .select()
        .from(projecttimeentries)
        .where(and(...conditions))
        .orderBy(desc(projecttimeentries.starttime))
        .limit(1)
        .then((rows) => rows[0]);

      return entry as TimeEntry | null;
    } catch (error) {
      logger.error(
        // [SCOPE 117 / T004] preserve Postgres cause — this handler produced
        // one of the two 2026-07-30 failures whose cause is still unidentified.
        { error: serializeDbError(error), userid },
        'Failed to fetch recent timer'
      );
      throw error;
    }
  }

  /**
   * List time entries
   */
  static async listTimeEntries(
    filters?: {
      companyid?: string;
      projectid?: string;
      taskid?: string;
      startDate?: Date;
      endDate?: Date;
      billableOnly?: boolean;
      limit?: number;
      offset?: number;
    }
  ): Promise<TimeEntry[]> {
    try {
      const entries = await db
        .select()
        .from(projecttimeentries)
        .where(
          and(
            // Tenant isolation: scope to the caller's company when provided.
            filters?.companyid ? eq(projecttimeentries.companyid, filters.companyid) : undefined,
            filters?.projectid ? eq(projecttimeentries.projectid, filters.projectid) : undefined,
            filters?.taskid ? eq(projecttimeentries.taskid, filters.taskid) : undefined,
            filters?.startDate ? gte(projecttimeentries.starttime, filters.startDate) : undefined,
            filters?.endDate ? lte(projecttimeentries.starttime, filters.endDate) : undefined,
            filters?.billableOnly ? eq(projecttimeentries.billable, true) : undefined,
          )
        );

      // Apply offset and limit
      let result = entries as TimeEntry[];
      if (filters?.offset) {
        result = result.slice(filters.offset);
      }
      if (filters?.limit) {
        result = result.slice(0, filters.limit);
      }

      return result;
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error' },
        'Failed to fetch time entries'
      );
      throw error;
    }
  }

  /**
   * Update a time entry
   */
  static async updateTimeEntry(
    entryid: string,
    updates: UpdateTimeEntryRequest,
    companyid?: string
  ): Promise<TimeEntry> {
    const now = new Date();

    logger.debug({ entryid, updates }, 'Updating time entry');

    try {
      const entry = await this.getTimeEntry(entryid, companyid);

      if (!entry) {
        logger.warn({ entryid }, 'Time entry not found');
        throw new Error('Time entry not found');
      }

      if (entry.invoiced) {
        logger.warn({ entryid }, 'Cannot update invoiced entry');
        throw new Error('Cannot update invoiced time entry');
      }

      const [updatedEntry] = await db
        .update(projecttimeentries)
        .set({
          ...updates,
          updatedat: now,
        })
        .where(eq(projecttimeentries.id, entryid))
        .returning();

      logger.info({ entryid }, 'Time entry updated');
      return updatedEntry as TimeEntry;
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error', entryid },
        'Failed to update time entry'
      );
      throw error;
    }
  }

  /**
   * Delete a time entry
   */
  static async deleteTimeEntry(entryid: string, companyid?: string): Promise<boolean> {
    logger.debug({ entryid }, 'Deleting time entry');

    try {
      const entry = await this.getTimeEntry(entryid, companyid);

      if (!entry) {
        logger.warn({ entryid }, 'Time entry not found');
        return false;
      }

      if (entry.invoiced) {
        logger.warn({ entryid }, 'Cannot delete invoiced entry');
        throw new Error('Cannot delete invoiced time entry');
      }

      await db.delete(projecttimeentries).where(eq(projecttimeentries.id, entryid));

      logger.info({ entryid }, 'Time entry deleted');
      return true;
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error', entryid },
        'Failed to delete time entry'
      );
      throw error;
    }
  }

  /**
   * Get time summary within date range
   */
  static async getTimeSummary(
    filters?: {
      companyid?: string;
      projectid?: string;
      startDate?: Date;
      endDate?: Date;
      billableOnly?: boolean;
    }
  ): Promise<TimeSummary> {
    try {
      const entries = await this.listTimeEntries(filters);

      const totalDuration = entries.reduce((sum, entry) => sum + (entry.duration || 0), 0);
      const billableDuration = entries
        .filter((entry) => entry.billable)
        .reduce((sum, entry) => sum + (entry.duration || 0), 0);

      return {
        totalDuration,
        billableDuration,
        entryCount: entries.length,
        billableEntryCount: entries.filter((entry) => entry.billable).length,
      };
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error' },
        'Failed to get time summary'
      );
      throw error;
    }
  }

  /**
   * Mark entries as invoiced
   */
  static async markAsInvoiced(entryIds: string[]): Promise<number> {
    const now = new Date();

    logger.debug({ entryIds }, 'Marking entries as invoiced');

    try {
      await db
        .update(projecttimeentries)
        .set({
          invoiced: true,
          invoicedat: now,
          updatedat: now,
        })
        .where(eq(projecttimeentries.invoiced, false));

      logger.info({ count: entryIds.length }, 'Entries marked as invoiced');
      return entryIds.length;
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error' },
        'Failed to mark entries as invoiced'
      );
      throw error;
    }
  }

  /**
   * Get billable hours for invoicing (duration is in minutes)
   */
  static async getBillableHours(
    _userid: string,
    startDate: Date,
    endDate: Date,
    companyid?: string
  ): Promise<{
    totalSeconds: number;
    totalMinutes: number;
    totalHours: number;
    entryCount: number;
  }> {
    try {
      const entries = await this.listTimeEntries({
        companyid,
        startDate,
        endDate,
        billableOnly: true,
      });

      const totalMinutes = entries.reduce((sum, entry) => sum + (entry.duration || 0), 0);
      const totalSeconds = totalMinutes * 60;
      const totalHours = totalMinutes / 60;

      return {
        totalSeconds,
        totalMinutes,
        totalHours,
        entryCount: entries.length,
      };
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error' },
        'Failed to get billable hours'
      );
      throw error;
    }
  }

  /**
   * Validate timer duration doesn't exceed maximum (default 8 hours)
   */
  static validateTimerDuration(startTime: Date, endTime: Date, maxHours: number = 8): boolean {
    const durationMs = endTime.getTime() - startTime.getTime();
    const durationHours = durationMs / (1000 * 60 * 60);
    return durationHours <= maxHours;
  }

  /**
   * Get average time per task
   */
  static async getAverageTimePerTask(
    projectid: string
  ): Promise<Map<string, number>> {
    try {
      const entries = await this.listTimeEntries({ projectid });

      const taskDurations = new Map<string, number[]>();

      entries.forEach((entry) => {
        if (entry.taskid && entry.duration) {
          if (!taskDurations.has(entry.taskid)) {
            taskDurations.set(entry.taskid, []);
          }
          taskDurations.get(entry.taskid)!.push(entry.duration);
        }
      });

      const averages = new Map<string, number>();
      taskDurations.forEach((durations, taskid) => {
        const average = durations.reduce((a, b) => a + b, 0) / durations.length;
        averages.set(taskid, average);
      });

      return averages;
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error' },
        'Failed to get average time per task'
      );
      throw error;
    }
  }
}
