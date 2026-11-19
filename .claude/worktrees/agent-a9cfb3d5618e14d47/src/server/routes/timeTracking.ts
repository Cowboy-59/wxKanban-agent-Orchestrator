import { Router, Response } from 'express';
import { z } from 'zod';
import { TimeTrackingService } from '~/server/services/TimeTrackingService.js';
import { validateBody, validateParams, validateQuery } from '~/server/middleware/validation.js';
import { authenticateToken, requireAuth, AuthRequest } from '~/server/middleware/auth.js';
import { asyncHandler } from '~/server/middleware/errorHandler.js';
import { createLogger } from '~/server/lib/logger.js';
import { serializeDbError } from '~/server/lib/dbError.js';
import {
  registerActiveTimer,
  unregisterActiveTimer,
  recordActivity,
} from '~/server/services/inactivityService.js';
import { db } from '~/db/client.js';
import { eq } from 'drizzle-orm';
import { projecttimeentries } from '~/db/schema/projecttimeentry.js';
import { companies } from '~/db/schema/company.js';

const router = Router();
const logger = createLogger('time-tracking-routes');

// Validation schemas
const startTimerSchema = z.object({
  projectid: z.string().uuid('Project ID must be valid UUID'),
  taskid: z.string().uuid('Task ID must be valid UUID').optional(),
  description: z.string().max(500, 'Description too long').optional(),
  billable: z.boolean().default(true),
});

const updateEntrySchema = z.object({
  duration: z.number().positive('Duration must be positive').optional(),
  description: z.string().max(500, 'Description too long').optional(),
  billable: z.boolean().optional(),
});

const listEntriesSchema = z.object({
  projectid: z.string().uuid().optional(),
  taskid: z.string().uuid().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  billableOnly: z.string().transform(v => v === 'true').optional(),
  limit: z.string().transform(v => parseInt(v, 10)).optional(),
  offset: z.string().transform(v => parseInt(v, 10)).optional(),
});

const entryIdSchema = z.object({
  entryid: z.string().uuid('Entry ID must be valid UUID'),
});

/**
 * POST /api/time-tracking/start
 * Start a new timer
 */
router.post(
  '/start',
  authenticateToken,
  requireAuth,
  validateBody(startTimerSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userid = req.userid;
    if (!userid) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { projectid, taskid, description, billable } = req.body;

    logger.info({ userid, projectid }, 'Starting timer');

    try {
      // FR-012: Only one manual timer at a time per consultant. AI-source
      // entries are a separate channel and do not conflict.
      const activeManualTimer = await TimeTrackingService.getActiveTimer(userid, {
        source: 'manual',
      });
      if (activeManualTimer) {
        logger.warn(
          { userid, activeEntryId: activeManualTimer.id },
          'User already has active manual timer',
        );
        res.status(409).json({
          error: 'You already have an active timer running',
          activeTimer: {
            id: activeManualTimer.id,
            starttime: activeManualTimer.starttime.toISOString(),
          },
        });
        return;
      }

      const timeentry = await TimeTrackingService.startTimer({
        userid,
        companyid: req.companyid ?? "",
        projectid,
        taskid,
        description,
        billable,
      });

      // Register for inactivity monitoring
      registerActiveTimer(userid, timeentry.id);

      res.status(201).json({
        success: true,
        message: 'Timer started',
        timeentry: {
          id: timeentry.id,
          projectid: timeentry.projectid,
          taskid: timeentry.taskid,
          starttime: timeentry.starttime.toISOString(),
          description: timeentry.notes,
          billable: timeentry.billable,
        },
      });
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error', userid },
        'Failed to start timer'
      );
      res.status(500).json({ error: 'Failed to start timer' });
    }
  })
);

/**
 * POST /api/time-tracking/stop/:entryid
 * Stop a running timer
 */
router.post(
  '/stop/:entryid',
  authenticateToken,
  requireAuth,
  validateParams(entryIdSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userid = req.userid;
    if (!userid) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const id = req.params.entryid;

    logger.info({ userid, id }, 'Stopping timer');

    try {
      const timeentry = await TimeTrackingService.stopTimer(id, userid, req.companyid ?? '');

      // Unregister from inactivity monitoring
      unregisterActiveTimer(userid);

      const durationMinutes = timeentry.duration ? timeentry.duration : 0;
      const durationHours = Math.floor(durationMinutes / 60);
      const durationRemainingMinutes = durationMinutes % 60;

      res.status(200).json({
        success: true,
        message: 'Timer stopped',
        timeentry: {
          id: timeentry.id,
          projectid: timeentry.projectid,
          starttime: timeentry.starttime.toISOString(),
          endtime: timeentry.endtime?.toISOString(),
          duration: timeentry.duration,
          durationFormatted: `${durationHours}h ${durationRemainingMinutes}m`,
          description: timeentry.notes,
          billable: timeentry.billable,
        },
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'Time entry not found') {
        logger.warn({ userid, id }, 'Time entry not found');
        res.status(404).json({ error: 'Timer not found' });
        return;
      }
      if (error instanceof Error && error.message === 'Timer is already stopped') {
        res.status(400).json({ error: 'Timer is already stopped' });
        return;
      }
      logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error', userid, id },
        'Failed to stop timer'
      );
      res.status(500).json({ error: 'Failed to stop timer' });
    }
  })
);

/**
 * GET /api/time-tracking/active
 * Get active timer if running
 */
router.get(
  '/active',
  authenticateToken,
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userid = req.userid;
    if (!userid) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    logger.debug({ userid }, 'Fetching active timer');

    try {
      const activeTimer = await TimeTrackingService.getActiveTimer(userid);

      if (!activeTimer) {
        res.status(200).json({
          success: true,
          activeTimer: null,
        });
        return;
      }

      // Calculate elapsed time
      const elapsedMs = new Date().getTime() - activeTimer.starttime.getTime();
      const elapsedSeconds = Math.floor(elapsedMs / 1000);

      res.status(200).json({
        success: true,
        activeTimer: {
          id: activeTimer.id,
          projectid: activeTimer.projectid,
          taskid: activeTimer.taskid,
          starttime: activeTimer.starttime.toISOString(),
          elapsedSeconds,
          description: activeTimer.notes,
          billable: activeTimer.billable,
        },
      });
    } catch (error) {
      logger.error(
        // [SCOPE 117 / T004] preserve Postgres cause — this handler produced
        // one of the two 2026-07-30 failures whose cause is still unidentified.
        { error: serializeDbError(error), userid },
        'Failed to fetch active timer'
      );
      res.status(500).json({ error: 'Failed to fetch active timer' });
    }
  })
);

/**
 * GET /api/time-tracking/entries
 * List time entries for user
 */
router.get(
  '/entries',
  authenticateToken,
  requireAuth,
  validateQuery(listEntriesSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userid = req.userid;
    if (!userid) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // Record activity
    recordActivity(userid);

    const { projectid, taskid, startDate, endDate, billableOnly, limit, offset } = req.query as any;

    logger.info({ userid, projectid }, 'Fetching time entries');

    try {
      const entries = await TimeTrackingService.listTimeEntries({
        companyid: req.companyid ?? '',
        projectid,
        taskid,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        billableOnly,
        limit: limit || 100,
        offset: offset || 0,
      });

      res.status(200).json({
        success: true,
        entries: entries.map((entry) => ({
          id: entry.id,
          projectid: entry.projectid,
          taskid: entry.taskid,
          starttime: entry.starttime.toISOString(),
          endtime: entry.endtime?.toISOString(),
          duration: entry.duration,
          description: entry.notes,
          billable: entry.billable,
          invoiced: entry.invoiced,
          createdAt: entry.createdat.toISOString(),
        })),
        count: entries.length,
      });
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error', userid },
        'Failed to fetch time entries'
      );
      res.status(500).json({ error: 'Failed to fetch time entries' });
    }
  })
);

/**
 * GET /api/time-tracking/entries/:entryid
 * Get a specific time entry
 */
router.get(
  '/entries/:entryid',
  authenticateToken,
  requireAuth,
  validateParams(entryIdSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userid = req.userid;
    if (!userid) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const id = req.params.entryid;

    logger.debug({ userid, id }, 'Fetching time entry');

    try {
      const entry = await TimeTrackingService.getTimeEntry(id, req.companyid ?? '');

      if (!entry) {
        res.status(404).json({ error: 'Time entry not found' });
        return;
      }

      res.status(200).json({
        success: true,
        entry: {
          id: entry.id,
          projectid: entry.projectid,
          taskid: entry.taskid,
          starttime: entry.starttime.toISOString(),
          endtime: entry.endtime?.toISOString(),
          duration: entry.duration,
          description: entry.notes,
          billable: entry.billable,
          invoiced: entry.invoiced,
          createdAt: entry.createdat.toISOString(),
          updatedAt: entry.updatedat.toISOString(),
        },
      });
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error', userid, id },
        'Failed to fetch time entry'
      );
      res.status(500).json({ error: 'Failed to fetch time entry' });
    }
  })
);

/**
 * PATCH /api/time-tracking/entries/:entryid
 * Update a time entry
 */
router.patch(
  '/entries/:entryid',
  authenticateToken,
  requireAuth,
  validateParams(entryIdSchema),
  validateBody(updateEntrySchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userid = req.userid;
    if (!userid) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // Record activity
    recordActivity(userid);

    const id = req.params.entryid;
    const updates = req.body;

    logger.info({ userid, id }, 'Updating time entry');

    try {
      const entry = await TimeTrackingService.updateTimeEntry(id, updates, req.companyid ?? '');

      res.status(200).json({
        success: true,
        message: 'Time entry updated',
        entry: {
          id: entry.id,
          projectid: entry.projectid,
          taskid: entry.taskid,
          starttime: entry.starttime.toISOString(),
          endtime: entry.endtime?.toISOString(),
          duration: entry.duration,
          description: entry.notes,
          billable: entry.billable,
          invoiced: entry.invoiced,
          updatedAt: entry.updatedat.toISOString(),
        },
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'Time entry not found') {
        res.status(404).json({ error: 'Time entry not found' });
        return;
      }
      if (error instanceof Error && error.message === 'Cannot update invoiced time entry') {
        res.status(400).json({ error: 'Cannot update invoiced time entry' });
        return;
      }
      logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error', userid, id },
        'Failed to update time entry'
      );
      res.status(500).json({ error: 'Failed to update time entry' });
    }
  })
);

/**
 * DELETE /api/time-tracking/entries/:entryid
 * Delete a time entry
 */
router.delete(
  '/entries/:entryid',
  authenticateToken,
  requireAuth,
  validateParams(entryIdSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userid = req.userid;
    if (!userid) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // Record activity
    recordActivity(userid);

    const id = req.params.entryid;

    logger.info({ userid, id }, 'Deleting time entry');

    // [SCOPE 037 / T044] BEGIN — final-on-submit for engagement time entries (FR-018)
    // If the entry lives in a CONSULTANT-plan tenant, treat as engagement-linked
    // and refuse delete; corrections must be done via an offsetting entry.
    try {
      const guard = await db
        .select({ billingplan: companies.billingplan })
        .from(projecttimeentries)
        .innerJoin(
          companies,
          eq(companies.id, projecttimeentries.companyid),
        )
        .where(eq(projecttimeentries.id, id))
        .limit(1);

      if (guard.length > 0 && guard[0].billingplan === 'CONSULTANT') {
        res.status(409).json({
          code: 'TIME_ENTRY_FINAL_ON_SUBMIT',
          error:
            'Time entries on consulting engagements are final on submit. ' +
            'To correct, log an offsetting entry with a note explaining the adjustment.',
        });
        return;
      }
    } catch (guardErr) {
      logger.warn(
        { error: guardErr, id },
        'Engagement final-on-submit guard failed — proceeding with normal delete path',
      );
    }
    // [SCOPE 037 / T044] END

    try {
      const deleted = await TimeTrackingService.deleteTimeEntry(id, req.companyid ?? '');

      if (!deleted) {
        res.status(404).json({ error: 'Time entry not found' });
        return;
      }

      res.status(200).json({
        success: true,
        message: 'Time entry deleted',
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'Cannot delete invoiced time entry') {
        res.status(400).json({ error: 'Cannot delete invoiced time entry' });
        return;
      }
      logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error', userid, id },
        'Failed to delete time entry'
      );
      res.status(500).json({ error: 'Failed to delete time entry' });
    }
  })
);

/**
 * GET /api/time-tracking/summary
 * Get time summary for user
 */
router.get(
  '/summary',
  authenticateToken,
  requireAuth,
  validateQuery(listEntriesSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userid = req.userid;
    if (!userid) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { projectid, startDate, endDate, billableOnly } = req.query as any;

    logger.info({ userid, projectid }, 'Fetching time summary');

    try {
      const summary = await TimeTrackingService.getTimeSummary({
        companyid: req.companyid ?? '',
        projectid,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        billableOnly,
      });

      const totalHours = Math.floor(summary.totalDuration / 3600);
      const totalMinutes = Math.floor((summary.totalDuration % 3600) / 60);
      const billableHours = Math.floor(summary.billableDuration / 3600);
      const billableMinutes = Math.floor((summary.billableDuration % 3600) / 60);

      res.status(200).json({
        success: true,
        summary: {
          totalDuration: summary.totalDuration,
          totalDurationFormatted: `${totalHours}h ${totalMinutes}m`,
          billableDuration: summary.billableDuration,
          billableDurationFormatted: `${billableHours}h ${billableMinutes}m`,
          entryCount: summary.entryCount,
          billableEntryCount: summary.billableEntryCount,
        },
      });
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error', userid },
        'Failed to fetch time summary'
      );
      res.status(500).json({ error: 'Failed to fetch time summary' });
    }
  })
);

/**
 * GET /api/time-tracking/billable
 * Get billable hours for invoicing
 */
router.get(
  '/billable',
  authenticateToken,
  requireAuth,
  validateQuery(
    z.object({
      startDate: z.string().datetime('Start date must be ISO datetime'),
      endDate: z.string().datetime('End date must be ISO datetime'),
    })
  ),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userid = req.userid;
    if (!userid) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { startDate, endDate } = req.query as any;

    logger.info({ userid }, 'Fetching billable hours');

    try {
      const billable = await TimeTrackingService.getBillableHours(
        userid,
        new Date(startDate),
        new Date(endDate),
        req.companyid ?? ''
      );

      res.status(200).json({
        success: true,
        billable: {
          totalSeconds: billable.totalSeconds,
          totalHours: billable.totalHours,
          totalMinutes: billable.totalMinutes,
          formatted: `${billable.totalHours}h ${billable.totalMinutes}m`,
          entryCount: billable.entryCount,
        },
      });
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error', userid },
        'Failed to fetch billable hours'
      );
      res.status(500).json({ error: 'Failed to fetch billable hours' });
    }
  })
);

/**
 * GET /api/time-tracking/export/csv
 * Export time entries as CSV
 */
router.get(
  '/export/csv',
  authenticateToken,
  requireAuth,
  validateQuery(
    z.object({
      startDate: z.string().datetime().optional(),
      endDate: z.string().datetime().optional(),
      projectid: z.string().uuid().optional(),
    })
  ),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userid = req.userid;
    if (!userid) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { startDate, endDate, projectid } = req.query as any;

    logger.info({ userid, startDate, endDate, projectid }, 'Exporting time entries to CSV');

    try {
      // Fetch time entries
      const entries = await TimeTrackingService.listTimeEntries({
        companyid: req.companyid ?? '',
        projectid,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        limit: 10000, // High limit for export
        offset: 0,
      });

      // Generate CSV content
      const csvHeader = 'Date,Project,Task,Description,Start Time,End Time,Duration (minutes),Billable,Invoiced\n';
      
      const csvRows = entries.map((entry) => {
        const date = entry.starttime.toISOString().split('T')[0];
        const startTime = entry.starttime.toISOString();
        const endTime = entry.endtime ? entry.endtime.toISOString() : '';
        const duration = entry.duration || 0;
        const billable = entry.billable ? 'Yes' : 'No';
        const invoiced = entry.invoiced ? 'Yes' : 'No';
        
        // Escape quotes in description
        const description = (entry.notes || '').replace(/"/g, '""');
        
        return `"${date}","${entry.projectid}","${entry.taskid || ''}","${description}","${startTime}","${endTime}",${duration},"${billable}","${invoiced}"`;
      });

      const csvContent = csvHeader + csvRows.join('\n');

      // Set headers for CSV download
      const filename = `time-entries-${new Date().toISOString().split('T')[0]}.csv`;
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      
      res.status(200).send(csvContent);
      
      logger.info({ userid, entryCount: entries.length }, 'CSV export completed');
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error', userid },
        'Failed to export time entries to CSV'
      );
      res.status(500).json({ error: 'Failed to export time entries' });
    }
  })
);

export default router;
