import { eq, and, isNull } from 'drizzle-orm';
import { db } from '~/db/client.js';
import { projectdocuments } from '~/db/schema/projectdocuments.js';
import { createLogger } from '~/server/lib/logger.js';

const logger = createLogger('scope-analysis');

// Two doctypes: per-scope (specid set) and project-wide (specid null). Both are
// authored in VS Code by `/analyzescope` and pushed to projectdocuments via MCP —
// the app NEVER generates them (kit stays the workflow engine). This service is
// read-only: it fetches the stored markdown for the viewer + PDF.
export const SCOPE_ANALYSIS_DOCTYPE = 'ScopeAnalysis';
export const PROJECT_SCOPE_ANALYSIS_DOCTYPE = 'ProjectScopeAnalysis';

// [SCOPE 060 / T010] BEGIN — Read-only store access for Scope Analysis reports
export class ScopeAnalysisService {
  /** Per-scope report: stored markdown for (projectid, specid, doctype=ScopeAnalysis). */
  static async getForScope(
    projectid: string,
    specid: string,
  ): Promise<{ content: string; updatedat: Date | null } | null> {
    const [row] = await db
      .select({ content: projectdocuments.content, updatedat: projectdocuments.updatedat })
      .from(projectdocuments)
      .where(
        and(
          eq(projectdocuments.projectid, projectid),
          eq(projectdocuments.specid, specid),
          eq(projectdocuments.doctype, SCOPE_ANALYSIS_DOCTYPE),
        ),
      )
      .limit(1);
    return row ? { content: row.content, updatedat: row.updatedat ?? null } : null;
  }

  /** Project-wide report: stored markdown for (projectid, specid IS NULL, doctype=ProjectScopeAnalysis). */
  static async getForProject(
    projectid: string,
  ): Promise<{ content: string; updatedat: Date | null } | null> {
    const [row] = await db
      .select({ content: projectdocuments.content, updatedat: projectdocuments.updatedat })
      .from(projectdocuments)
      .where(
        and(
          eq(projectdocuments.projectid, projectid),
          isNull(projectdocuments.specid),
          eq(projectdocuments.doctype, PROJECT_SCOPE_ANALYSIS_DOCTYPE),
        ),
      )
      .limit(1);
    return row ? { content: row.content, updatedat: row.updatedat ?? null } : null;
  }

  /** Spec-level doc-status: which specs of a project have a per-scope analysis (+ timestamp). */
  static async statusForProject(projectid: string): Promise<Record<string, string | null>> {
    const rows = await db
      .select({ specid: projectdocuments.specid, updatedat: projectdocuments.updatedat })
      .from(projectdocuments)
      .where(
        and(
          eq(projectdocuments.projectid, projectid),
          eq(projectdocuments.doctype, SCOPE_ANALYSIS_DOCTYPE),
        ),
      );
    const out: Record<string, string | null> = {};
    for (const r of rows) {
      if (r.specid) out[r.specid] = r.updatedat ? r.updatedat.toISOString() : null;
    }
    logger.debug({ projectid, count: rows.length }, 'scope-analysis status');
    return out;
  }
}
// [SCOPE 060 / T010] END
