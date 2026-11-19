import { Router, Response } from 'express';
import { z } from 'zod';
import { SpecificationLifecycleService } from '~/server/services/SpecificationLifecycleService.js';
import { validateBody, validateParams, validateQuery } from '~/server/middleware/validation.js';
import { authenticateToken, requireAuth, AuthRequest } from '~/server/middleware/auth.js';
import { asyncHandler } from '~/server/middleware/errorHandler.js';
import { createLogger } from '~/server/lib/logger.js';
import { assertConsultantCannotAdvancePhase } from '~/server/services/EngagementVisibility.js';
import { notifyScopePhaseAdvanced } from '~/server/services/EngagementNotifications.js';

const router = Router();
const logger = createLogger('specification-lifecycle-routes');

// Validation schemas
const createSpecificationSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters'),
  description: z.string().min(10, 'Description must be at least 10 characters'),
});

const transitionPhaseSchema = z.object({
  fromPhase: z.enum(['DESIGN', 'IMPLEMENTATION', 'QA', 'HUMAN_TESTING', 'BETA', 'RELEASE']),
  toPhase: z.enum(['DESIGN', 'IMPLEMENTATION', 'QA', 'HUMAN_TESTING', 'BETA', 'RELEASE']),
  approvedby: z.string().optional(),
  notes: z.string().max(1000, 'Notes too long').optional(),
  blockers: z.array(z.string()).optional(),
});

const updatePhaseNotesSchema = z.object({
  notes: z.string().max(1000, 'Notes too long'),
  blockers: z.array(z.string()).optional(),
});

const specificationIdSchema = z.object({
  specificationid: z.string().uuid('Specification ID must be valid UUID'),
});

const phaseQuerySchema = z.object({
  phase: z.enum(['DESIGN', 'IMPLEMENTATION', 'QA', 'HUMAN_TESTING', 'BETA', 'RELEASE']).optional(),
});

/**
 * POST /api/specifications
 * Create a new specification (starts in DESIGN phase)
 */
router.post(
  '/',
  authenticateToken,
  requireAuth,
  validateBody(createSpecificationSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userid = req.userid;
    if (!userid) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const companyid = req.body.companyid || 'default'; // Would come from user's company
    const { title, description } = req.body;

    logger.info({ userid, title }, 'Creating specification');

    try {
      const specification = await SpecificationLifecycleService.createSpecification(
        userid,
        companyid,
        title,
        description
      );

      res.status(201).json({
        success: true,
        message: 'Specification created in DESIGN phase',
        specification: {
          id: specification.id,
          title: specification.title,
          status: specification.status,
          createdAt: specification.createdat.toISOString(),
        },
      });
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error', userid },
        'Failed to create specification'
      );
      res.status(500).json({ error: 'Failed to create specification' });
    }
  })
);

/**
 * GET /api/specifications/:specificationid
 * Get specification details
 */
router.get(
  '/:specificationid',
  authenticateToken,
  requireAuth,
  validateParams(specificationIdSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userid = req.userid;
    if (!userid) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { specificationid } = req.params;

    logger.debug({ userid, specificationid }, 'Fetching specification');

    try {
      const specification = await SpecificationLifecycleService.getSpecification(specificationid, userid);

      if (!specification) {
        res.status(404).json({ error: 'Specification not found' });
        return;
      }

      res.status(200).json({
        success: true,
        specification: {
          id: specification.id,
          title: specification.title,
          content: specification.content,
          status: specification.status,
          createdAt: specification.createdat.toISOString(),
          updatedAt: specification.updatedat.toISOString(),
        },
      });
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error', userid, specificationid },
        'Failed to fetch specification'
      );
      res.status(500).json({ error: 'Failed to fetch specification' });
    }
  })
);

/**
 * GET /api/specifications/:specificationid/phase-info
 * Get current phase details and requirements
 */
router.get(
  '/:specificationid/phase-info',
  authenticateToken,
  requireAuth,
  validateParams(specificationIdSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userid = req.userid;
    if (!userid) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { specificationid } = req.params;

    logger.debug({ userid, specificationid }, 'Fetching phase info');

    try {
      const phaseInfo = await SpecificationLifecycleService.getCurrentPhaseInfo(specificationid, userid);

      if (!phaseInfo) {
        res.status(404).json({ error: 'Specification not found' });
        return;
      }

      res.status(200).json({
        success: true,
        phase: phaseInfo.phase,
        description: SpecificationLifecycleService.getPhaseDescription(phaseInfo.phase),
        requirements: phaseInfo.requirements,
        validNextPhases: phaseInfo.validNextPhases,
        phaseHistory: phaseInfo.phaseHistory ? {
          phase: phaseInfo.phaseHistory.phase,
          enteredAt: phaseInfo.phaseHistory.enteredat.toISOString(),
          exitedAt: phaseInfo.phaseHistory.exitedat?.toISOString(),
          notes: phaseInfo.phaseHistory.notes,
          blockers: phaseInfo.phaseHistory.blockers ? JSON.parse(phaseInfo.phaseHistory.blockers) : [],
        } : undefined,
      });
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error', userid, specificationid },
        'Failed to fetch phase info'
      );
      res.status(500).json({ error: 'Failed to fetch phase info' });
    }
  })
);

/**
 * GET /api/specifications/:specificationid/history
 * Get phase history
 */
router.get(
  '/:specificationid/history',
  authenticateToken,
  requireAuth,
  validateParams(specificationIdSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userid = req.userid;
    if (!userid) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { specificationid } = req.params;

    logger.debug({ userid, specificationid }, 'Fetching phase history');

    try {
      const history = await SpecificationLifecycleService.getPhaseHistory(specificationid, userid);

      res.status(200).json({
        success: true,
        history: history.map((h) => ({
          phase: h.phase,
          enteredAt: h.enteredat.toISOString(),
          exitedAt: h.exitedat?.toISOString(),
          approvedby: h.approvedby,
          notes: h.notes,
          blockers: h.blockers ? JSON.parse(h.blockers) : [],
        })),
      });
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error', userid, specificationid },
        'Failed to fetch phase history'
      );
      res.status(500).json({ error: 'Failed to fetch phase history' });
    }
  })
);

/**
 * GET /api/specifications/:specificationid/progress
 * Get lifecycle progress
 */
router.get(
  '/:specificationid/progress',
  authenticateToken,
  requireAuth,
  validateParams(specificationIdSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userid = req.userid;
    if (!userid) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { specificationid } = req.params;

    logger.debug({ userid, specificationid }, 'Fetching lifecycle progress');

    try {
      const progress = await SpecificationLifecycleService.getLifecycleProgress(specificationid, userid);

      res.status(200).json({
        success: true,
        currentPhase: progress.currentPhase,
        phaseIndex: progress.phaseIndex,
        completionPercentage: progress.completionPercentage,
        completedPhases: progress.completedPhases,
        phases: progress.phases.map((p: any) => ({
          phase: p.phase,
          status: p.status,
          description: SpecificationLifecycleService.getPhaseDescription(p.phase),
          enteredAt: p.enteredAt?.toISOString(),
          exitedAt: p.exitedAt?.toISOString(),
        })),
      });
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error', userid, specificationid },
        'Failed to fetch progress'
      );
      res.status(500).json({ error: 'Failed to fetch progress' });
    }
  })
);

/**
 * POST /api/specifications/:specificationid/transition
 * Transition specification to next phase
 */
router.post(
  '/:specificationid/transition',
  authenticateToken,
  requireAuth,
  validateParams(specificationIdSchema),
  validateBody(transitionPhaseSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userid = req.userid;
    if (!userid) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // [SCOPE 037 / T037] BEGIN — block consultants from manual phase advance (FR-013 AC2 / FR-014)
    try {
      await assertConsultantCannotAdvancePhase(userid);
    } catch (err) {
      const e = err as Error & { code?: string };
      if (e.code === 'CONSULTANT_PHASE_ADVANCE_DENIED') {
        res.status(403).json({ code: e.code, error: e.message });
        return;
      }
      throw err;
    }
    // [SCOPE 037 / T037] END

    const { specificationid } = req.params;
    const { fromPhase, toPhase, approvedby, notes, blockers } = req.body;

    logger.info(
      { userid, specificationid, from: fromPhase, to: toPhase },
      'Transitioning specification phase'
    );

    try {
      // Validate transition
      if (!SpecificationLifecycleService.validatePhaseTransition(fromPhase, toPhase)) {
        res.status(400).json({
          error: `Cannot transition from ${fromPhase} to ${toPhase}`,
        });
        return;
      }

      const result = await SpecificationLifecycleService.transitionPhase({
        specificationid,
        fromPhase,
        toPhase,
        approvedby,
        notes,
        blockers,
      });

      // [SCOPE 037 / T047] BEGIN — notify Client ADMINs of assigned engagements (FR-024)
      // Fire-and-forget; doesn't block the response. Uses spec's `specnumber`
      // (text like '037') which matches engagementassignments.scopeid format.
      void notifyScopePhaseAdvanced({
        scopeId: result.specnumber,
        fromPhase,
        toPhase,
      });
      // [SCOPE 037 / T047] END

      res.status(200).json({
        success: true,
        message: `Specification transitioned to ${toPhase}`,
        specification: {
          id: result.id,
          title: result.title,
          status: result.status,
          updatedAt: result.updatedat.toISOString(),
        },
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('Cannot transition')) {
        res.status(400).json({ error: error.message });
        return;
      }
      if (error instanceof Error && error.message === 'Specification not found') {
        res.status(404).json({ error: 'Specification not found' });
        return;
      }
      logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error', userid, specificationid },
        'Failed to transition phase'
      );
      res.status(500).json({ error: 'Failed to transition phase' });
    }
  })
);

/**
 * PATCH /api/specifications/:specificationid/phase-notes
 * Update current phase notes and blockers
 */
router.patch(
  '/:specificationid/phase-notes',
  authenticateToken,
  requireAuth,
  validateParams(specificationIdSchema),
  validateBody(updatePhaseNotesSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userid = req.userid;
    if (!userid) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { specificationid } = req.params;
    const { notes, blockers } = req.body;

    logger.info({ userid, specificationid }, 'Updating phase notes');

    try {
      const updated = await SpecificationLifecycleService.updatePhaseNotes(
        specificationid,
        userid,
        notes,
        blockers
      );

      res.status(200).json({
        success: true,
        message: 'Phase notes updated',
        phaseHistory: {
          phase: updated.phase,
          notes: updated.notes,
          blockers: updated.blockers ? JSON.parse(updated.blockers) : [],
        },
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'Specification not found') {
        res.status(404).json({ error: 'Specification not found' });
        return;
      }
      logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error', userid, specificationid },
        'Failed to update phase notes'
      );
      res.status(500).json({ error: 'Failed to update phase notes' });
    }
  })
);

/**
 * GET /api/specifications
 * List specifications (optionally filtered by phase)
 */
router.get(
  '/',
  authenticateToken,
  requireAuth,
  validateQuery(phaseQuerySchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userid = req.userid;
    if (!userid) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { phase } = req.query as any;

    logger.info({ userid, phase }, 'Listing specifications');

    try {
      let specifications;

      if (phase) {
        specifications = await SpecificationLifecycleService.getSpecificationsByPhase(userid, phase);
      } else {
        specifications = await SpecificationLifecycleService.getActiveSpecifications(userid);
      }

      res.status(200).json({
        success: true,
        specifications: specifications.map((spec) => ({
          id: spec.id,
          title: spec.title,
          status: spec.status,
          createdAt: spec.createdat.toISOString(),
          updatedAt: spec.updatedat.toISOString(),
        })),
        count: specifications.length,
      });
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error', userid },
        'Failed to list specifications'
      );
      res.status(500).json({ error: 'Failed to list specifications' });
    }
  })
);

/**
 * POST /api/specifications/:specificationid/archive
 * Archive a specification
 */
router.post(
  '/:specificationid/archive',
  authenticateToken,
  requireAuth,
  validateParams(specificationIdSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userid = req.userid;
    if (!userid) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { specificationid } = req.params;

    logger.info({ userid, specificationid }, 'Archiving specification');

    try {
      const success = await SpecificationLifecycleService.archiveSpecification(specificationid, userid);

      if (!success) {
        res.status(404).json({ error: 'Specification not found' });
        return;
      }

      res.status(200).json({
        success: true,
        message: 'Specification archived',
      });
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error', userid, specificationid },
        'Failed to archive specification'
      );
      res.status(500).json({ error: 'Failed to archive specification' });
    }
  })
);

export default router;
