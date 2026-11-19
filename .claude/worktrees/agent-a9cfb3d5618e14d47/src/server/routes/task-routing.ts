/**
 * Task Routing API Routes
 *
 * REST endpoints for task workflow routing:
 * - POST /api/tasks/{taskId}/route-next-duty (T055)
 * - POST /api/tasks/{taskId}/reassign-duty (T056)
 * - GET /api/tasks/{taskId}/duty-history (T057)
 */

import { Router, Request, Response } from 'express';
import { logger } from '~/lib/logger';
import { taskRoutingService } from '~/server/services/task-routing';

const router = Router();

/**
 * T055: POST /api/tasks/{taskId}/route-next-duty
 *
 * Route task to next duty in the workflow sequence.
 * Implements auto-assignment (single member) and manual selection (multiple members).
 * Also handles ALL duty special case and task completion.
 *
 * Request body:
 * {
 *   manualAssigneeId?: string (if multiple options available, specify selected user)
 * }
 *
 * Response (200) - Single member available, auto-assigned:
 * {
 *   taskId: string,
 *   status: 'autoAssigned',
 *   nextDuty: string,
 *   assignedToUserId: string,
 *   message: string
 * }
 *
 * Response (200) - Multiple members available, manual selection required:
 * {
 *   taskId: string,
 *   status: 'requiresManualSelection',
 *   nextDuty: string,
 *   availableTeamMembers: [
 *     {
 *       userId: string,
 *       userName: string,
 *       dutyName: string
 *     }
 *   ],
 *   message: string
 * }
 *
 * Response (200) - ALL duty, assigned to all members:
 * {
 *   taskId: string,
 *   status: 'assignAllTeamMembers',
 *   assignedCount: number,
 *   message: string
 * }
 *
 * Response (200) - Final duty reached, task complete:
 * {
 *   taskId: string,
 *   status: 'complete',
 *   message: string,
 *   completedAt: ISO8601
 * }
 */
router.post('/:taskId/route-next-duty', async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    const { manualAssigneeId } = req.body;
    const projectId = req.query.projectId as string; // Would come from task query
    const currentDutyName = req.query.currentDuty as string; // Would come from task query

    logger.info(
      { taskId, manualAssigneeId },
      'POST /tasks/{taskId}/route-next-duty - Routing task'
    );

    // Validate required info
    if (!projectId || !currentDutyName) {
      return res.status(400).json({
        error: 'Missing required context: projectId and currentDuty',
      });
    }

    // Call service
    const result = await taskRoutingService.routeTaskToNextDuty(
      taskId,
      projectId,
      currentDutyName,
      manualAssigneeId
    );

    return res.status(200).json(result);
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error routing task');

    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }

    if (error.message.includes('does not have')) {
      return res.status(400).json({ error: error.message });
    }

    return res.status(500).json({ error: 'Failed to route task' });
  }
});

/**
 * T056: POST /api/tasks/{taskId}/reassign-duty
 *
 * Reassign a task to a different duty outside the normal sequence.
 * Used when a task needs to skip duties or go to a specific person.
 *
 * Request body:
 * {
 *   newDutyName: string,
 *   assignToUserId: string,
 *   reason: string (business reason for reassignment)
 * }
 *
 * Response (200):
 * {
 *   taskId: string,
 *   newDuty: string,
 *   newAssigneeId: string,
 *   newAssigneeName: string,
 *   reason: string,
 *   reassignedAt: ISO8601,
 *   reassignedBy: string,
 *   message: string
 * }
 *
 * Response (400):
 * {
 *   error: 'User does not have {duty} duty on this project'
 * }
 *
 * Response (404):
 * {
 *   error: 'Invalid duty: {dutyName}'
 * }
 */
router.post('/:taskId/reassign-duty', async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    const { newDutyName, assignToUserId, reason } = req.body;
    const projectId = req.query.projectId as string;

    logger.info(
      { taskId, newDutyName, assignToUserId },
      'POST /tasks/{taskId}/reassign-duty - Reassigning task'
    );

    // Validate required fields
    if (!newDutyName || !assignToUserId) {
      return res.status(400).json({
        error: 'Missing required fields: newDutyName, assignToUserId',
      });
    }

    if (!reason) {
      return res.status(400).json({
        error: 'Reason required for reassignment',
      });
    }

    // Call service
    const result = await taskRoutingService.reassignTaskDuty(
      taskId,
      projectId,
      newDutyName,
      assignToUserId,
      reason
    );

    return res.status(200).json(result);
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error reassigning task');

    if (error.message.includes('does not have')) {
      return res.status(400).json({ error: error.message });
    }

    if (error.message.includes('Invalid duty')) {
      return res.status(404).json({ error: error.message });
    }

    return res.status(500).json({ error: 'Failed to reassign task' });
  }
});

/**
 * T057: GET /api/tasks/{taskId}/duty-history
 *
 * Get complete duty assignment history for a task.
 * Shows all duty transitions in chronological order.
 *
 * Response (200):
 * [
 *   {
 *     taskId: string,
 *     dutyName: string,
 *     sequenceOrder: number,
 *     assignedToUserId: string,
 *     assignedToUserName: string,
 *     assignedAt: ISO8601,
 *     completedAt?: ISO8601,
 *     reason?: string (if reassignment)
 *   }
 * ]
 *
 * Response (404): Task not found
 * Response (403): User lacks permission to view this task
 */
router.get('/:taskId/duty-history', async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;

    logger.info({ taskId }, 'GET /tasks/{taskId}/duty-history - Fetching history');

    // Call service
    const history = await taskRoutingService.getTaskDutyHistory(taskId);

    return res.status(200).json(history);
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error fetching task history');

    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }

    if (error.message.includes('permission')) {
      return res.status(403).json({ error: error.message });
    }

    return res.status(500).json({ error: 'Failed to fetch task history' });
  }
});

export default router;
