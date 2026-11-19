/**
 * Compliance Validation API Routes
 *
 * REST endpoints for compliance rule validation and override tracking:
 * - POST /api/compliance/validate (T052)
 * - GET /api/compliance/overrides (T053)
 * - GET /api/compliance/overrides/{overrideId} (T054)
 */

import { Router, Request, Response } from 'express';
import { logger } from '~/lib/logger';
import { complianceEngine } from '~/server/services/compliance-engine';
import { SecurityStandard } from '~/lib/compliance-rules';

const router = Router();

/**
 * T052: POST /api/compliance/validate
 *
 * Validate a proposed duty assignment against compliance rules.
 * Does NOT create an assignment, just checks for violations.
 *
 * Request body:
 * {
 *   projectId: string,
 *   userId: string,
 *   dutyNames: string[] (all duties user would have),
 *   securityStandard: 'SOC2' | 'HITRUST'
 * }
 *
 * Response (200) - Valid assignment:
 * {
 *   isValid: true,
 *   violations: [],
 *   standard: 'SOC2'
 * }
 *
 * Response (400) - Violations detected:
 * {
 *   isValid: false,
 *   violations: [
 *     {
 *       ruleId: string,
 *       reason: string,
 *       standard: 'SOC2' | 'HITRUST',
 *       duties: string[],
 *       severity: 'error'
 *     }
 *   ],
 *   standard: 'SOC2'
 * }
 */
router.post('/validate', async (req: Request, res: Response) => {
  try {
    const { projectId, userId, dutyNames, securityStandard } = req.body;

    logger.info(
      { projectId, userId, dutyNames, securityStandard },
      'POST /compliance/validate - Validating duty assignment'
    );

    // Validate required fields
    if (!projectId || !userId || !dutyNames || !securityStandard) {
      return res.status(400).json({
        error: 'Missing required fields: projectId, userId, dutyNames, securityStandard',
      });
    }

    // Validate securityStandard is valid
    if (!['SOC2', 'HITRUST'].includes(securityStandard)) {
      return res.status(400).json({
        error: 'Invalid securityStandard. Must be SOC2 or HITRUST',
      });
    }

    // Call compliance engine
    const validation = complianceEngine.validateDutyAssignment(
      projectId,
      userId,
      dutyNames[dutyNames.length - 1], // Last duty in array is the proposed new duty
      dutyNames.slice(0, -1), // All duties except the last
      securityStandard as any
    );

    // Return 400 if violations, 200 if valid
    const statusCode = validation.isValid ? 200 : 400;
    return res.status(statusCode).json(validation);
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error validating compliance');
    return res.status(500).json({ error: 'Failed to validate compliance' });
  }
});

/**
 * T053: GET /api/compliance/overrides
 *
 * List all compliance overrides with support for filtering and pagination.
 *
 * Query params:
 * - projectId?: string
 * - userId?: string
 * - overriddenBy?: string
 * - standard?: 'SOC2' | 'HITRUST'
 * - startDate?: ISO8601
 * - endDate?: ISO8601
 * - limit?: number (default 50, max 100)
 * - offset?: number (default 0)
 *
 * Response (200):
 * {
 *   total: number,
 *   limit: number,
 *   offset: number,
 *   items: [
 *     {
 *       complianceOverrideId: string,
 *       projectId: string,
 *       userId: string,
 *       userName: string,
 *       dutyName: string,
 *       violatedRules: string[],
 *       reason: string,
 *       overriddenBy: string,
 *       overriddenByName: string,
 *       standard: 'SOC2' | 'HITRUST',
 *       createdAt: ISO8601
 *     }
 *   ]
 * }
 */
router.get('/overrides', async (req: Request, res: Response) => {
  try {
    const {
      projectId,
      userId,
      overriddenBy,
      standard,
      startDate,
      endDate,
      limit = 50,
      offset = 0,
    } = req.query;

    logger.info(
      { projectId, userId, standard, limit, offset },
      'GET /compliance/overrides - Listing overrides'
    );

    // Validate limit
    const parsedLimit = Math.min(parseInt(limit as string) || 50, 100);
    const parsedOffset = parseInt(offset as string) || 0;

    // Validate dates if provided
    if (startDate && isNaN(Date.parse(startDate as string))) {
      return res.status(400).json({
        error: 'Invalid startDate format. Use ISO8601',
      });
    }

    if (endDate && isNaN(Date.parse(endDate as string))) {
      return res.status(400).json({
        error: 'Invalid endDate format. Use ISO8601',
      });
    }

    // Build filter object (implementation would use these filters)
    const filters = {
      projectId: projectId as string | undefined,
      userId: userId as string | undefined,
      overriddenBy: overriddenBy as string | undefined,
      standard: standard as SecurityStandard | undefined,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
    };

    // Query implementation (placeholder)
    const overrides: Array<{
      complianceOverrideId: string;
      projectId: string;
      userId: string;
      userName: string;
      dutyName: string;
      violatedRules: string[];
      reason: string;
      overriddenBy: string;
      overriddenByName: string;
      standard: SecurityStandard;
      createdAt: string;
    }> = []; // Would query database with filters
    const total = 0; // Would get total count

    return res.status(200).json({
      total,
      limit: parsedLimit,
      offset: parsedOffset,
      appliedFilters: filters,
      items: overrides,
    });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error listing overrides');
    return res.status(500).json({ error: 'Failed to list overrides' });
  }
});

/**
 * T054: GET /api/compliance/overrides/{overrideId}
 *
 * Get a single compliance override by ID with full audit details.
 *
 * Response (200):
 * {
 *   complianceOverrideId: string,
 *   projectId: string,
 *   projectName: string,
 *   userId: string,
 *   userName: string,
 *   userEmail: string,
 *   dutyName: string,
 *   violatedRules: [
 *     {
 *       ruleId: string,
 *       reason: string,
 *       standard: 'SOC2' | 'HITRUST'
 *     }
 *   ],
 *   reason: string,
 *   overriddenBy: string,
 *   overriddenByName: string,
 *   overriddenByEmail: string,
 *   standard: 'SOC2' | 'HITRUST',
 *   createdAt: ISO8601,
 *   updatedAt: ISO8601
 * }
 *
 * Response (404): Override not found
 */
router.get('/overrides/:overrideId', async (req: Request, res: Response) => {
  try {
    const { overrideId } = req.params;

    logger.info({ overrideId }, 'GET /compliance/overrides/{id} - Fetching override detail');

    // Query implementation (placeholder)
    const override = null; // Would query database

    if (!override) {
      return res.status(404).json({
        error: `Override ${overrideId} not found`,
      });
    }

    return res.status(200).json(override);
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error fetching override detail');
    return res.status(500).json({ error: 'Failed to fetch override' });
  }
});

/**
 * Note: PUT and DELETE endpoints NOT implemented for compliance overrides
 *
 * Compliance overrides are immutable for audit trail integrity.
 * Any modification request should return 405 Method Not Allowed.
 * This is enforced by not providing these endpoints.
 */

export default router;
