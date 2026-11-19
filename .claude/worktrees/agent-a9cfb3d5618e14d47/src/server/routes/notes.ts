import { Router, Response } from 'express';
import { z } from 'zod';
import { NotesService } from '~/server/services/NotesService.js';
import { ProjectService } from '~/server/services/ProjectService.js';
import { validateBody, validateParams, validateQuery } from '~/server/middleware/validation.js';
import { authenticateToken, requireAuth, AuthRequest } from '~/server/middleware/auth.js';
import { asyncHandler } from '~/server/middleware/errorHandler.js';
import { createLogger } from '~/server/lib/logger.js';

const router = Router();
const logger = createLogger('notes-routes');

// Validation schemas
const createNoteSchema = z.object({
  projectid: z.string().uuid('Project ID must be valid UUID'),
  content: z.string().min(1, 'Note content required').max(5000, 'Note too long'),
});

const updateNoteSchema = z.object({
  content: z.string().min(1, 'Note content required').max(5000, 'Note too long'),
});

const noteIdSchema = z.object({
  noteid: z.string().uuid('Note ID must be valid UUID'),
});

const projectIdSchema = z.object({
  projectid: z.string().uuid('Project ID must be valid UUID'),
});

const notesQuerySchema = z.object({
  type: z.enum(['user', 'system', 'all']).optional(),
  limit: z.string().transform(Number).optional(),
  offset: z.string().transform(Number).optional(),
});

/**
 * POST /api/notes
 * Create new note
 */
router.post(
  '/',
  authenticateToken,
  requireAuth,
  validateBody(createNoteSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userid = req.userid;
    if (!userid) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { projectid, content } = req.body;
    const companyid = req.companyid ?? '';
    const usertype = req.usertype ?? 'TEAM_MEMBER';

    logger.info({ userid, projectid }, 'Creating note');

    try {
      // Verify project access
      const proj = await ProjectService.getProject(projectid, userid, companyid, usertype);
      if (!proj) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      const noteRecord = await NotesService.createNote(projectid, userid, content);

      res.status(201).json({
        success: true,
        message: 'Note created',
        note: {
          id: noteRecord.id,
          projectid: noteRecord.projectid,
          content: noteRecord.content,
          author: noteRecord.author,
          createdAt: noteRecord.createdat.toISOString(),
        },
      });
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error', userid },
        'Failed to create note'
      );
      res.status(500).json({ error: 'Failed to create note' });
    }
  })
);

/**
 * GET /api/projects/:projectid/notes
 * Get project notes with optional filtering
 */
router.get(
  '/project/:projectid',
  authenticateToken,
  requireAuth,
  validateParams(projectIdSchema),
  validateQuery(notesQuerySchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userid = req.userid;
    if (!userid) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { projectid } = req.params;
    const { limit, offset } = req.query as any;
    const companyid = req.companyid ?? '';
    const usertype = req.usertype ?? 'TEAM_MEMBER';

    logger.debug({ userid, projectid }, 'Fetching project notes');

    try {
      // Verify project access
      const proj = await ProjectService.getProject(projectid, userid, companyid, usertype);
      if (!proj) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      const notes = await NotesService.getProjectNotes(projectid, {
        limit: limit ? parseInt(limit) : 50,
        offset: offset ? parseInt(offset) : 0,
      });

      res.status(200).json({
        success: true,
        notes: notes.map((n) => ({
          id: n.id,
          projectid: n.projectid,
          content: n.content,
          author: n.author || 'Unknown',
          createdAt: n.createdat.toISOString(),
          updatedAt: n.updatedat.toISOString(),
        })),
        count: notes.length,
      });
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error', userid, projectid },
        'Failed to fetch project notes'
      );
      res.status(500).json({ error: 'Failed to fetch notes' });
    }
  })
);

/**
 * GET /api/notes/:noteid
 * Get specific note
 */
router.get(
  '/:noteid',
  authenticateToken,
  requireAuth,
  validateParams(noteIdSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userid = req.userid;
    if (!userid) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { noteid } = req.params;
    const companyid = req.companyid ?? '';
    const usertype = req.usertype ?? 'TEAM_MEMBER';

    logger.debug({ userid, noteid }, 'Fetching note');

    try {
      const noteRecord = await NotesService.getNote(noteid);

      if (!noteRecord) {
        res.status(404).json({ error: 'Note not found' });
        return;
      }

      // Tenant isolation: the note's project must be accessible to the caller.
      const proj = await ProjectService.getProject(noteRecord.projectid, userid, companyid, usertype);
      if (!proj) {
        res.status(404).json({ error: 'Note not found' });
        return;
      }

      res.status(200).json({
        success: true,
        note: {
          id: noteRecord.id,
          projectid: noteRecord.projectid,
          content: noteRecord.content,
          author: noteRecord.author,
          createdAt: noteRecord.createdat.toISOString(),
          updatedAt: noteRecord.updatedat.toISOString(),
        },
      });
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error', userid, noteid },
        'Failed to fetch note'
      );
      res.status(500).json({ error: 'Failed to fetch note' });
    }
  })
);

/**
 * PATCH /api/notes/:noteid
 * Update note content
 */
router.patch(
  '/:noteid',
  authenticateToken,
  requireAuth,
  validateParams(noteIdSchema),
  validateBody(updateNoteSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userid = req.userid;
    if (!userid) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { noteid } = req.params;
    const { content } = req.body;
    const companyid = req.companyid ?? '';
    const usertype = req.usertype ?? 'TEAM_MEMBER';

    logger.info({ userid, noteid }, 'Updating note');

    try {
      // Tenant isolation: resolve the note and confirm its project is the caller's.
      const existing = await NotesService.getNote(noteid);
      if (!existing) {
        res.status(404).json({ error: 'Note not found' });
        return;
      }
      const proj = await ProjectService.getProject(existing.projectid, userid, companyid, usertype);
      if (!proj) {
        res.status(404).json({ error: 'Note not found' });
        return;
      }

      const updated = await NotesService.updateNote(noteid, content);

      res.status(200).json({
        success: true,
        message: 'Note updated',
        note: {
          id: updated.id,
          content: updated.content,
          updatedAt: updated.updatedat.toISOString(),
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';

      if (message === 'Note not found') {
        res.status(404).json({ error: 'Note not found' });
        return;
      }
      if (message === 'Cannot edit system-generated notes') {
        res.status(400).json({ error: 'Cannot edit system-generated notes' });
        return;
      }

      logger.error(
        { error: message, userid, noteid },
        'Failed to update note'
      );
      res.status(500).json({ error: 'Failed to update note' });
    }
  })
);

/**
 * DELETE /api/notes/:noteid
 * Delete note
 */
router.delete(
  '/:noteid',
  authenticateToken,
  requireAuth,
  validateParams(noteIdSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userid = req.userid;
    if (!userid) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { noteid } = req.params;
    const companyid = req.companyid ?? '';
    const usertype = req.usertype ?? 'TEAM_MEMBER';

    logger.info({ userid, noteid }, 'Deleting note');

    try {
      // Tenant isolation: resolve the note and confirm its project is the caller's.
      const existing = await NotesService.getNote(noteid);
      if (!existing) {
        res.status(404).json({ error: 'Note not found' });
        return;
      }
      const proj = await ProjectService.getProject(existing.projectid, userid, companyid, usertype);
      if (!proj) {
        res.status(404).json({ error: 'Note not found' });
        return;
      }

      const success = await NotesService.deleteNote(noteid);

      if (!success) {
        res.status(404).json({ error: 'Note not found' });
        return;
      }

      res.status(200).json({
        success: true,
        message: 'Note deleted',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';

      if (message === 'Note not found') {
        res.status(404).json({ error: 'Note not found' });
        return;
      }
      if (message === 'Cannot delete system-generated notes') {
        res.status(400).json({ error: 'Cannot delete system-generated notes' });
        return;
      }

      logger.error(
        { error: message, userid, noteid },
        'Failed to delete note'
      );
      res.status(500).json({ error: 'Failed to delete note' });
    }
  })
);

export default router;
