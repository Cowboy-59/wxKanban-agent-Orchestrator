import { Router, Response } from 'express';
import { z } from 'zod';
import { db } from '~/db/client.js';
import { projectusers } from '~/db/schema/projectuser.js';
import { companyprojects } from '~/db/schema/companyproject.js';
import { userprofiles } from '~/db/schema/userprofiles.js';
import { eq, and, isNull } from 'drizzle-orm';
import { authenticateToken, requireAuth, AuthRequest } from '~/server/middleware/auth.js';
import { asyncHandler } from '~/server/middleware/errorHandler.js';
import { createLogger } from '~/server/lib/logger.js';

const router = Router();
const logger = createLogger('project-assignments');

// Validation schemas
const assignUserSchema = z.object({
  userid: z.string().uuid('User ID must be a valid UUID'),
  role: z.enum(['Lead', 'TeamMember', 'Observer']).default('TeamMember'),
});

const removeUserSchema = z.object({
  userid: z.string().uuid('User ID must be a valid UUID'),
});

/**
 * GET /api/projects/:projectId/assignments
 * Get all user assignments for a project
 */
router.get(
  '/:projectId/assignments',
  authenticateToken,
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { companyid } = req;
    const { projectId } = req.params;

    if (!companyid) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // Verify project belongs to company
    const [project] = await db
      .select({ id: companyprojects.id })
      .from(companyprojects)
      .where(and(
        eq(companyprojects.id, projectId),
        eq(companyprojects.companyid, companyid)
      ))
      .limit(1);

    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    // Get all assignments with user details
    const assignments = await db
      .select({
        id: projectusers.id,
        userid: projectusers.userid,
        role: projectusers.role,
        assignedat: projectusers.assignedat,
        fullname: userprofiles.fullname,
        emailaddr: userprofiles.emailaddr,
      })
      .from(projectusers)
      .innerJoin(userprofiles, eq(projectusers.userid, userprofiles.id))
      .where(and(
        eq(projectusers.projectid, projectId),
        isNull(projectusers.removedat)
      ))
      .orderBy(projectusers.assignedat);

    res.status(200).json({
      success: true,
      projectId,
      assignments: assignments.map(a => ({
        id: a.id,
        userid: a.userid,
        role: a.role,
        assignedat: a.assignedat,
        user: {
          fullname: a.fullname,
          emailaddr: a.emailaddr,
        },
      })),
    });
  })
);

/**
 * POST /api/projects/:projectId/assignments
 * Assign a user to a project (ADMIN or TEAM_MANAGER only)
 */
router.post(
  '/:projectId/assignments',
  authenticateToken,
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { companyid, usertype, userid: currentUserId } = req;
    const { projectId } = req.params;
    const body = assignUserSchema.parse(req.body);

    if (!companyid || !usertype) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // Only ADMIN or TEAM_MANAGER can assign users
    if (usertype !== 'ADMIN' && usertype !== 'TEAM_MANAGER') {
      res.status(403).json({ error: 'Admin or Team Manager access required' });
      return;
    }

    // TEAM_MANAGER can only assign if they are the phase lead
    if (usertype === 'TEAM_MANAGER') {
      const { projectphases } = await import('~/db/schema/projectphase.js');
      const [activePhase] = await db
        .select({ assigneduserid: projectphases.assigneduserid })
        .from(projectphases)
        .where(and(
          eq(projectphases.projectid, projectId),
          eq(projectphases.status, 'in_progress')
        ))
        .limit(1);

      if (!activePhase || activePhase.assigneduserid !== currentUserId) {
        res.status(403).json({ error: 'Team Manager can only assign users to projects where they are the active phase lead' });
        return;
      }
    }

    // Verify project belongs to company
    const [project] = await db
      .select({ id: companyprojects.id, name: companyprojects.name })
      .from(companyprojects)
      .where(and(
        eq(companyprojects.id, projectId),
        eq(companyprojects.companyid, companyid)
      ))
      .limit(1);

    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    // Verify user belongs to company
    const [user] = await db
      .select({ id: userprofiles.id, fullname: userprofiles.fullname })
      .from(userprofiles)
      .where(and(
        eq(userprofiles.id, body.userid),
        eq(userprofiles.companyid, companyid)
      ))
      .limit(1);

    if (!user) {
      res.status(404).json({ error: 'User not found in your company' });
      return;
    }

    // Check if assignment already exists

    const [existing] = await db
      .select({ id: projectusers.id })
      .from(projectusers)
      .where(and(
        eq(projectusers.projectid, projectId),
        eq(projectusers.userid, body.userid),
        isNull(projectusers.removedat)
      ))
      .limit(1);

    if (existing) {
      res.status(409).json({ error: 'User is already assigned to this project' });
      return;
    }

    // Create assignment

    const [assignment] = await db
      .insert(projectusers)
      .values({
        projectid: projectId,
        userid: body.userid,
        role: body.role,
      })
      .returning();

    logger.info({
      projectId,
      userId: body.userid,
      role: body.role,
      assignedBy: currentUserId,
    }, 'User assigned to project');

    res.status(201).json({
      success: true,
      message: 'User assigned to project successfully',
      assignment: {
        id: assignment.id,
        userid: assignment.userid,
        role: assignment.role,
        assignedat: assignment.assignedat,
        user: {
          fullname: user.fullname,
        },
      },
    });
  })
);

/**
 * DELETE /api/projects/:projectId/assignments
 * Remove a user from a project (soft delete)
 */
router.delete(
  '/:projectId/assignments',
  authenticateToken,
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { companyid, usertype, userid: currentUserId } = req;
    const { projectId } = req.params;
    const body = removeUserSchema.parse(req.body);

    if (!companyid || !usertype) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // Only ADMIN or TEAM_MANAGER can remove users
    if (usertype !== 'ADMIN' && usertype !== 'TEAM_MANAGER') {
      res.status(403).json({ error: 'Admin or Team Manager access required' });
      return;
    }


    // TEAM_MANAGER can only remove if they are the phase lead
    if (usertype === 'TEAM_MANAGER') {
      const { projectphases } = await import('~/db/schema/projectphase.js');
      const [activePhase] = await db
        .select({ assigneduserid: projectphases.assigneduserid })
        .from(projectphases)
        .where(and(
          eq(projectphases.projectid, projectId),
          eq(projectphases.status, 'in_progress')
        ))
        .limit(1);

      if (!activePhase || activePhase.assigneduserid !== currentUserId) {
        res.status(403).json({ error: 'Team Manager can only remove users from projects where they are the active phase lead' });
        return;
      }
    }

    // Verify project belongs to company
    const [project] = await db

      .select({ id: companyprojects.id })
      .from(companyprojects)
      .where(and(
        eq(companyprojects.id, projectId),
        eq(companyprojects.companyid, companyid)
      ))
      .limit(1);

    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    // Soft delete by setting removedat

    const [updated] = await db
      .update(projectusers)
      .set({ removedat: new Date() })
      .where(and(
        eq(projectusers.projectid, projectId),
        eq(projectusers.userid, body.userid),
        isNull(projectusers.removedat)
      ))
      .returning();

    if (!updated) {
      res.status(404).json({ error: 'User is not assigned to this project' });
      return;
    }


    logger.info({
      projectId,
      userId: body.userid,
      removedBy: currentUserId,
    }, 'User removed from project');

    res.status(200).json({
      success: true,
      message: 'User removed from project successfully',
    });
  })
);

export default router;
