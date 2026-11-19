import { db } from "~/db/client.js";
import {
  wxkanbandocuments,
  WxKanbanDocument,
} from "~/db/schema/wxkanbandocuments.js";
import { eq, and, desc, sql } from "drizzle-orm";
import { createLogger } from "../lib/logger.js";
import { createHash } from "crypto";

const logger = createLogger("document-service");

export type UploadDocumentInput = {
  documenttype: string;
  title: string;
  description?: string;
  filename?: string;
  filecontent: string;
  framework?: string;
  version?: string;
  effectivedate?: Date;
};

export type DocumentFilters = {
  // [SCOPE 146 / T003] MODIFIED-BY — frameworkOnly narrows a read to the Platform Compliance Library's rule documents
  documenttype?: string;
  framework?: string;
  status?: string;
  searchQuery?: string;
  limit?: number;
  offset?: number;
  frameworkOnly?: boolean;
};

// [SCOPE 146 / T003] BEGIN — the document type a non-SYSADMIN may read (FR-003)
/**
 * Framework rule documents are the only part of wxkanbandocuments a customer may read. Every other
 * type (db_analysis, erdiagram, audit_report) is an internal platform document, SYSADMIN only.
 */
export const FRAMEWORK_DOCUMENT_TYPE = "compliance_framework";

export type DocumentReadOptions = { frameworkOnly?: boolean };
// [SCOPE 146 / T003] END

/**
 * Compute SHA-256 hash of content for tamper detection.
 */
function computeHash(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

/**
 * Upload a new document to wxkanbandocuments.
 * Computes SHA-256 hash and sets up full-text search.
 */
export async function uploadDocument(
  data: UploadDocumentInput,
  userId: string,
): Promise<WxKanbanDocument> {
  try {
    const filehash = computeHash(data.filecontent);

    // Build full-text search vector
    const searchText = `${data.title} ${data.description ?? ""} ${data.filecontent}`;

    const result = await db
      .insert(wxkanbandocuments)
      .values({
        documenttype: data.documenttype,
        title: data.title,
        description: data.description,
        filename: data.filename,
        filecontent: data.filecontent,
        filehash,
        framework: data.framework,
        version: data.version,
        effectivedate: data.effectivedate ? data.effectivedate.toISOString().split('T')[0] : null,

        status: "active",
        extractedtasks: 0,
        createdby: userId,
        fulltextsearch: sql`to_tsvector('english', ${searchText})`,
      })
      .returning();

    logger.info(
      { documentId: result[0].id, title: data.title, framework: data.framework },
      "Uploaded document",
    );
    return result[0];
  } catch (error) {
    logger.error({ error, title: data.title }, "Failed to upload document");
    throw error;
  }
}

/**
 * List documents with optional filters.
 */
export async function listDocuments(filters: DocumentFilters = {}): Promise<WxKanbanDocument[]> {
  // [SCOPE 146 / T003] MODIFIED-BY — frameworkOnly is ANDed with documenttype, so a query parameter cannot widen it
  try {
    const conditions = [];

    if (filters.frameworkOnly) {
      conditions.push(eq(wxkanbandocuments.documenttype, FRAMEWORK_DOCUMENT_TYPE));
    }
    if (filters.documenttype) {
      conditions.push(eq(wxkanbandocuments.documenttype, filters.documenttype));
    }
    if (filters.framework) {
      conditions.push(eq(wxkanbandocuments.framework, filters.framework));
    }
    if (filters.status) {
      conditions.push(eq(wxkanbandocuments.status, filters.status));
    }

    const result = await db
      .select()
      .from(wxkanbandocuments)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(wxkanbandocuments.createdat))
      .limit(filters.limit ?? 100)
      .offset(filters.offset ?? 0);

    return result;
  } catch (error) {
    logger.error({ error, filters }, "Failed to list documents");
    throw error;
  }
}


/**
 * Get a single document by ID.
 */
export async function getDocument(
  id: string,
  options: DocumentReadOptions = {},
): Promise<WxKanbanDocument | null> {
  // [SCOPE 146 / T003] MODIFIED-BY — frameworkOnly answers null for an internal document, as for a missing one
  try {
    const byId = eq(wxkanbandocuments.id, id);
    const result = await db
      .select()
      .from(wxkanbandocuments)
      .where(
        options.frameworkOnly
          ? and(byId, eq(wxkanbandocuments.documenttype, FRAMEWORK_DOCUMENT_TYPE))
          : byId,
      )
      .limit(1);

    return result[0] ?? null;
  } catch (error) {
    logger.error({ error, documentId: id }, "Failed to get document");
    throw error;
  }
}

/**
 * Delete a document by ID.
 */
export async function deleteDocument(id: string): Promise<void> {
  try {
    await db.delete(wxkanbandocuments).where(eq(wxkanbandocuments.id, id));
    logger.info({ documentId: id }, "Deleted document");
  } catch (error) {
    logger.error({ error, documentId: id }, "Failed to delete document");
    throw error;
  }
}

/**
 * Search documents using full-text search.
 */
export async function searchDocuments(
  query: string,
  options: DocumentReadOptions = {},
): Promise<WxKanbanDocument[]> {
  // [SCOPE 146 / T003] MODIFIED-BY — frameworkOnly keeps internal documents out of search results
  try {
    const searchVector = query
      .split(/\s+/)
      .filter((w) => w.length > 0)
      .map((w) => w.replace(/[^a-zA-Z0-9]/g, ""))
      .join(" & ");

    if (!searchVector) {
      return [];
    }

    const result = await db.execute(sql`
      SELECT * FROM wxkanbandocuments
      WHERE fulltextsearch @@ to_tsquery('english', ${searchVector})
      ${options.frameworkOnly ? sql`AND documenttype = ${FRAMEWORK_DOCUMENT_TYPE}` : sql``}
      ORDER BY ts_rank(fulltextsearch, to_tsquery('english', ${searchVector})) DESC
      LIMIT 50
    `);

    return result.rows as WxKanbanDocument[];
  } catch (error) {
    logger.error({ error, query }, "Failed to search documents");
    throw error;
  }
}

/**
 * Update extracted task count for a document.
 */
export async function updateExtractedTaskCount(
  documentId: string,
  count: number,
): Promise<void> {
  try {
    await db
      .update(wxkanbandocuments)
      .set({ extractedtasks: count })
      .where(eq(wxkanbandocuments.id, documentId));

    logger.info({ documentId, count }, "Updated extracted task count");
  } catch (error) {
    logger.error({ error, documentId, count }, "Failed to update extracted task count");
    throw error;
  }
}

/**
 * Verify document integrity by recomputing hash.
 * Returns true if hash matches, false otherwise.
 */
export async function verifyDocumentIntegrity(id: string): Promise<boolean> {
  try {
    const doc = await getDocument(id);
    if (!doc || !doc.filecontent || !doc.filehash) {
      return false;
    }

    const computedHash = computeHash(doc.filecontent);
    return computedHash === doc.filehash;
  } catch (error) {
    logger.error({ error, documentId: id }, "Failed to verify document integrity");
    return false;
  }
}
