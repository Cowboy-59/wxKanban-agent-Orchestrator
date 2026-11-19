import { db } from '~/db/client.js';
import { projectdocuments } from '~/db/schema/projectdocuments.js';
import { eq, and, isNull } from 'drizzle-orm';
import { createLogger } from '~/server/lib/logger.js';
import type { ProjectDocument } from '~/shared/types/projects.js';

const logger = createLogger('project-document-service');

// Explicit column projection to avoid stale column selections (e.g., legacy `type`)
const projectDocumentColumns = {
  id: projectdocuments.id,
  projectid: projectdocuments.projectid,
  specid: projectdocuments.specid,
  doctype: projectdocuments.doctype,
  title: projectdocuments.title,
  content: projectdocuments.content,
  filepath: projectdocuments.filepath,
  isgenerated: projectdocuments.isgenerated,
  createdat: projectdocuments.createdat,
  updatedat: projectdocuments.updatedat,
  createdbyid: projectdocuments.createdbyid,
};

type ProjectDocumentRow = {
  id: string;
  projectid: string;
  specid: string | null;
  doctype: string;
  title: string;
  content: string;
  filepath: string | null;
  isgenerated: boolean;
  createdat: Date;
  updatedat: Date;
  createdbyid: string | null;
};

function toProjectDocument(r: ProjectDocumentRow): ProjectDocument {
  return {
    id: r.id,
    projectid: r.projectid,
    specid: r.specid ?? null,
    doctype: r.doctype,
    title: r.title,
    content: r.content,
    filepath: r.filepath ?? null,
    isgenerated: r.isgenerated,
    createdat: r.createdat.toISOString(),
    updatedat: r.updatedat.toISOString(),
    createdbyid: r.createdbyid ?? null,
  };
}

export class ProjectDocumentService {
  static async getDocuments(projectid: string): Promise<ProjectDocument[]> {
    const rows = await db
      .select(projectDocumentColumns)
      .from(projectdocuments)
      .where(eq(projectdocuments.projectid, projectid))
      .orderBy(projectdocuments.createdat);

    return rows.map(toProjectDocument);
  }

  static async getOverview(projectid: string): Promise<ProjectDocument | null> {
    const [r] = await db
      .select(projectDocumentColumns)
      .from(projectdocuments)
      .where(
        and(
          eq(projectdocuments.projectid, projectid),
          isNull(projectdocuments.specid),
          eq(projectdocuments.doctype, 'overview')
        )
      )
      .limit(1);

    return r ? toProjectDocument(r) : null;
  }

  // [SCOPE 073 / T009] the auto-generated per-project scope-flow doc (MCP writes doctype='scopeflow')
  static async getScopeFlow(projectid: string): Promise<ProjectDocument | null> {
    const [r] = await db
      .select(projectDocumentColumns)
      .from(projectdocuments)
      .where(
        and(
          eq(projectdocuments.projectid, projectid),
          isNull(projectdocuments.specid),
          eq(projectdocuments.doctype, 'scopeflow')
        )
      )
      .limit(1);

    return r ? toProjectDocument(r) : null;
  }

  /**
   * Insert or update a project-level document by doctype (upsert by projectid + doctype, specid IS NULL).
   */
  static async upsertDocument(
    projectid: string,
    doctype: string,
    title: string,
    content: string,
    createdbyid: string | null,
    // [SCOPE 084 / T005] optional generated flag; defaults false to preserve
    // existing callers. Generators (e.g. the Help doc) pass true.
    isgenerated = false
  ): Promise<ProjectDocument> {
    const now = new Date();

    const [existing] = await db
      .select()
      .from(projectdocuments)
      .where(
        and(
          eq(projectdocuments.projectid, projectid),
          isNull(projectdocuments.specid),
          eq(projectdocuments.doctype, doctype)
        )
      )
      .limit(1);

    if (existing) {
      const [updated] = await db
        .update(projectdocuments)
        .set({ title, content, isgenerated, updatedat: now })
        .where(eq(projectdocuments.id, existing.id))
        .returning();

      logger.info({ projectid, doctype, docid: updated.id }, 'Project document updated');
      return toProjectDocument(updated);
    }

    const [inserted] = await db
      .insert(projectdocuments)
      .values({ projectid, specid: null, doctype, title, content, isgenerated, createdat: now, updatedat: now, createdbyid })
      .returning();

    logger.info({ projectid, doctype, docid: inserted.id }, 'Project document created');
    return toProjectDocument(inserted);
  }

  /**
   * Upsert a project-level document including a rendered PDF binary.
   * Used by the lifecycle generator.
   */
  static async upsertDocumentWithPdf(
    projectid: string,
    doctype: string,
    title: string,
    content: string,
    pdfBytes: Buffer,
    createdbyid: string | null
  ): Promise<ProjectDocument> {
    const now = new Date();

    const [existing] = await db
      .select()
      .from(projectdocuments)
      .where(
        and(
          eq(projectdocuments.projectid, projectid),
          isNull(projectdocuments.specid),
          eq(projectdocuments.doctype, doctype)
        )
      )
      .limit(1);

    if (existing) {
      const [updated] = await db
        .update(projectdocuments)
        .set({
          title,
          content,
          pdfcontent: pdfBytes,
          pdfgeneratedat: now,
          updatedat: now,
        })
        .where(eq(projectdocuments.id, existing.id))
        .returning();

      logger.info(
        { projectid, doctype, docid: updated.id, pdfbytes: pdfBytes.length },
        'Project document + PDF updated'
      );
      return toProjectDocument(updated);
    }

    const [inserted] = await db
      .insert(projectdocuments)
      .values({
        projectid,
        specid: null,
        doctype,
        title,
        content,
        pdfcontent: pdfBytes,
        pdfgeneratedat: now,
        createdat: now,
        updatedat: now,
        createdbyid,
      })
      .returning();

    logger.info(
      { projectid, doctype, docid: inserted.id, pdfbytes: pdfBytes.length },
      'Project document + PDF created'
    );
    return toProjectDocument(inserted);
  }

  /**
   * Fetch PDF bytes for a project-level document by doctype. Returns null if
   * no document or PDF exists.
   */
  static async getPdf(
    projectid: string,
    doctype: string
  ): Promise<{ bytes: Buffer; generatedat: Date } | null> {
    const [row] = await db
      .select({
        pdfcontent: projectdocuments.pdfcontent,
        pdfgeneratedat: projectdocuments.pdfgeneratedat,
      })
      .from(projectdocuments)
      .where(
        and(
          eq(projectdocuments.projectid, projectid),
          isNull(projectdocuments.specid),
          eq(projectdocuments.doctype, doctype)
        )
      )
      .limit(1);

    if (!row || !row.pdfcontent || !row.pdfgeneratedat) return null;
    return { bytes: row.pdfcontent, generatedat: row.pdfgeneratedat };
  }

  static async updateDocument(
    docid: string,
    projectid: string,
    updates: { title?: string; content?: string }
  ): Promise<ProjectDocument | null> {
    const now = new Date();

    const [updated] = await db
      .update(projectdocuments)
      .set({ ...updates, updatedat: now })
      .where(and(eq(projectdocuments.id, docid), eq(projectdocuments.projectid, projectid)))
      .returning();

    if (!updated) return null;

    logger.info({ docid, projectid }, 'Project document patched');
    return toProjectDocument(updated);
  }
}
