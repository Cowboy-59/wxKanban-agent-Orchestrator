/**
 * Duty Assignment API Routes
 *
 * REST endpoints for managing duty assignments:
 * - POST /api/projects/{projectId}/duties/assign (T048)
 * - GET /api/projects/{projectId}/duties/assignments (T049)
 * - DELETE /api/projects/{projectId}/duties/assignments/{assignmentId} (T050)
 * - GET /api/projects/{projectId}/duties/available (T051)
 */

import { Router, Request, Response } from 'express';
import { logger } from '~/lib/logger';
import { dutyAssignmentService } from '~/server/services/duty-assignment';

const router = Router();

/**
 * T048: POST /api/projects/{projectId}/duties/assign
 *
 * Assign a duty to a team member on a project.
 * Returns 201 on success, or 400/403/404/409 on error.
 *
 * Request body:
 * {
 *   userId: string,
 *   dutyName: string,
 *   overrideReason?: string (required if compliance violation)
 * }
 *
 * Response (201):
 * {
 *   dutyAssignmentId: string,
 *   userId: string,
 *   dutyName: string,
 *   projectId: string,
 *   assignedAt: ISO8601,
 *   complianceOverride?: {
 *     complianceOverrideId: string,
 *     violatedRules: string[],
 *     reason: string
 *   }
 * }
 */
router.post('/:projectId/duties/assign', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { userId, dutyName, overrideReason } = req.body;
    const requestingUserId = req.user?.id; // From auth middleware

    if (!requestingUserId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    logger.info(
      { projectId, userId, dutyName },
      'POST /duties/assign - Assigning duty'
    );

    // Validate required fields
    if (!userId || !dutyName) {
      return res.status(400).json({
        error: 'Missing required fields: userId, dutyName',
      });
    }

    // Get project security standard (would query database)
    const securityStandard = 'SOC2'; // Placeholder

    // Call service
    const result = await dutyAssignmentService.assignDutyToUser(
      projectId,
      userId,
      dutyName,
      requestingUserId,
      overrideReason,
      securityStandard as any
    );

    return res.status(201).json(result);
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error assigning duty');

    // Handle specific error types
    if (error.message.includes('permission') || error.message.includes('Team Manager')) {
      return res.status(403).json({ error: error.message });
    }

    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }

    if (error.message.includes('already has')) {
      return res.status(409).json({ error: error.message });
    }

    if (error.message.includes('violates') || error.message.includes('Override reason')) {
      return res.status(400).json({ error: error.message });
    }

    return res.status(500).json({ error: 'Failed to assign duty' });
  }
});

/**
 * T049: GET /api/projects/{projectId}/duties/assignments
 *
 * List all duty assignments for a project.
 * Supports optional userId filter.
 *
 * Query params:
 * - userId?: string (filter by user)
 *
 * Response (200):
 * [
 *   {
 *     dutyAssignmentId: string,
 *     userId: string,
 *     userName: string,
 *     dutyName: string,
 *     assignedAt: ISO8601,
 *     assignedBy?: string (Team Manager name),
 *     complianceOverride?: {
 *       complianceOverrideId: string,
 *       violatedRules: string[],
 *       reason: string,
 *       overriddenBy: string
 *     }
 *   }
 * ]
 */
router.get('/:projectId/duties/assignments', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { userId } = req.query;

    logger.info(
      { projectId, userId },
      'GET /duties/assignments - Listing assignments'
    );

    // Call service
    const assignments = await dutyAssignmentService.listAssignments(
      projectId,
      userId as string | undefined
    );

    return res.status(200).json(assignments);
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error listing assignments');
    return res.status(500).json({ error: 'Failed to list assignments' });
  }
});

/**
 * T050: DELETE /api/projects/{projectId}/duties/assignments/{assignmentId}
 *
 * Remove a duty assignment from a project.
 * Requires Team Manager role.
 *
 * Response (204): No Content
 * Response (403): Insufficient permissions
 * Response (404): Assignment not found
 */
router.delete(
  '/:projectId/duties/assignments/:assignmentId',
  async (req: Request, res: Response) => {
    try {
      const { projectId, assignmentId } = req.params;
      const requestingUserId = req.user?.id; // From auth middleware

      if (!requestingUserId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      logger.info(
        { projectId, assignmentId },
        'DELETE /duties/assignments/{id} - Removing assignment'
      );

      // Call service
      await dutyAssignmentService.removeDutyAssignment(
        projectId,
        assignmentId,
        requestingUserId
      );

      return res.status(204).send();
    } catch (error: any) {
      logger.error({ error: error.message }, 'Error removing assignment');

      if (error.message.includes('permission') || error.message.includes('Team Manager')) {
        return res.status(403).json({ error: error.message });
      }

      if (error.message.includes('not found')) {
        return res.status(404).json({ error: error.message });
      }

      return res.status(500).json({ error: 'Failed to remove assignment' });
    }
  }
);

/**
 * T051: GET /api/projects/{projectId}/duties/available
 *
 * Get all available duties for a project.
 * Includes sequence order and assigned member count.
 *
 * Response (200):
 * [
 *   {
 *     dutyName: string,
 *     sequence: number,
 *     isAvailable: boolean,
 *     assignedMemberCount: number,
 *     standard?: 'SOC2' | 'HITRUST'
 *   }
 * ]
 */
router.get('/:projectId/duties/available', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;

    logger.info({ projectId }, 'GET /duties/available - Listing available duties');

    // Call service
    const duties = await dutyAssignmentService.getAvailableDuties(projectId);

    return res.status(200).json(duties);
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error fetching available duties');
    return res.status(500).json({ error: 'Failed to fetch available duties' });
  }
});

export default router;
