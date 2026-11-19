import { db } from '~/db/client.js';
import { notes } from '~/db/schema/note.js';
import { eq, desc } from 'drizzle-orm';
import { logger } from '~/server/lib/logger.js';

/**
 * Notes Service
 * Manages project notes with auto-generation for key actions
 */
export class NotesService {
  /**
   * Create new note
   */
  static async createNote(
    projectid: string,
    author: string,
    content: string,
  ): Promise<any> {
    logger.info(
      { projectid, author },
      'Creating note'
    );

    try {
      const [newNote] = await db
        .insert(notes)
        .values({
          projectid,
          author,
          content,
        })
        .returning();

      logger.info({ id: newNote.id }, 'Note created');
      return newNote;
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error', projectid },
        'Failed to create note'
      );
      throw error;
    }
  }

  /**
   * Get note by ID
   */
  static async getNote(noteId: string): Promise<any | null> {
    try {
      const noteRecord = await db
        .select()
        .from(notes)
        .where(eq(notes.id, noteId))
        .then((rows) => rows[0]);

      if (!noteRecord) return null;

      return noteRecord;
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error', noteId },
        'Failed to fetch note'
      );
      throw error;
    }
  }

  /**
   * Get project notes
   */
  static async getProjectNotes(
    projectid: string,
    options?: {
      limit?: number;
      offset?: number;
    }
  ): Promise<any[]> {
    try {
      const notesList = await db
        .select()
        .from(notes)
        .where(eq(notes.projectid, projectid))
        .orderBy(desc(notes.createdat))
        .limit(options?.limit ?? 1000)
        .offset(options?.offset ?? 0);

      return notesList;
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error', projectid },
        'Failed to fetch project notes'
      );
      throw error;
    }
  }

  /**
   * Update note content
   */
  static async updateNote(
    noteId: string,
    content: string
  ): Promise<any> {
    logger.info({ noteId }, 'Updating note');

    try {
      // Verify note exists
      const noteRecord = await this.getNote(noteId);
      if (!noteRecord) {
        throw new Error('Note not found');
      }

      const [updated] = await db
        .update(notes)
        .set({
          content,
        })
        .where(eq(notes.id, noteId))
        .returning();

      logger.info({ noteId }, 'Note updated');
      return updated;
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error', noteId },
        'Failed to update note'
      );
      throw error;
    }
  }

  /**
   * Delete note
   */
  static async deleteNote(noteId: string): Promise<boolean> {
    logger.info({ noteId }, 'Deleting note');

    try {
      // Verify note exists
      const noteRecord = await this.getNote(noteId);
      if (!noteRecord) {
        throw new Error('Note not found');
      }

      await db
        .delete(notes)
        .where(eq(notes.id, noteId));

      logger.info({ noteId }, 'Note deleted');
      return true;
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error', noteId },
        'Failed to delete note'
      );
      throw error;
    }
  }

  /**
   * Create system-generated note for key actions
   * Called automatically on important events
   */
  static async createSystemNote(
    projectid: string,
    action: string,
    details?: Record<string, unknown>
  ): Promise<any> {
    const timestamp = new Date().toLocaleString();
    const detailsStr = details ? JSON.stringify(details, null, 2) : '';
    const content = `[${timestamp}] ${action}${detailsStr ? '\n' + detailsStr : ''}`;

    logger.info(
      { projectid, action },
      'Creating system note'
    );

    try {
      // System notes are created with system author
      const [newNote] = await db
        .insert(notes)
        .values({
          projectid,
          author: 'system', // Special system author
          content,
        })
        .returning();

      logger.info({ id: newNote.id }, 'System note created');
      return newNote;
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error', projectid },
        'Failed to create system note'
      );
      throw error;
    }
  }

  /**
   * Get recent notes for dashboard
   */
  static async getRecentNotes(
    projectid: string,
    limit: number = 5
  ): Promise<any[]> {
    try {
      const notesList = await db
        .select()
        .from(notes)
        .where(eq(notes.projectid, projectid))
        .orderBy(desc(notes.createdat))
        .limit(limit);

      return notesList;
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error', projectid },
        'Failed to fetch recent notes'
      );
      throw error;
    }
  }
}
