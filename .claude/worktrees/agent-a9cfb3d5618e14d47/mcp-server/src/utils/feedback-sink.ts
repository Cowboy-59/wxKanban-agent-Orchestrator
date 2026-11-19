// [SCOPE 043 / T012] BEGIN — central feedback sink routing (FR-010)
// Every VS Code bug report / suggestion routes to ONE wxperts-owned project (the
// "feedback sink", default wxKanban Development) regardless of which consumer
// token submitted it, so all kit feedback triages in one place. This builds a
// ScopedDb rebound to the sink project while carrying the *real* submitter's
// userId from the caller's token, so ownership (list_my_feedback /
// answer_feedback) and provenance (companyid on the row, originProjectId in
// context) are preserved. Resolving the sink's customerId from companyprojects
// (cached) keeps it from drifting against a second env var.
import { eq } from 'drizzle-orm';
import { withScope, type ScopedDb } from '../db/scoped-query.js';
import { companyprojects } from '../db/schema.js';
import type { McpScope } from '../middleware/auth.js';

// wxKanban Development — overridable per-environment via FEEDBACK_SINK_PROJECT_ID.
const DEFAULT_SINK_PROJECT_ID = 'ba924193-0335-4080-9fa6-33cd6b81300a';

let cachedSinkCustomerId: string | null = null;

export function sinkProjectId(): string {
  return process.env['FEEDBACK_SINK_PROJECT_ID'] || DEFAULT_SINK_PROJECT_ID;
}

/**
 * A ScopedDb bound to the feedback sink project, carrying the caller's userId.
 * All five feedback operations (submit, list, answer, triage dedup, artifact)
 * run against this so the row + artifact + dedup land in the sink project, while
 * the row still records the submitter (userId/companyId set explicitly by the
 * caller) and ownership checks remain keyed on userId.
 */
export async function resolveSinkScope(caller: McpScope): Promise<ScopedDb> {
  const projectId = sinkProjectId();
  if (!cachedSinkCustomerId) {
    // companyprojects is not project-scoped, so selectScoped runs an unscoped
    // read here (no direct db import — keeps the no-direct-db CI invariant).
    const rows = (await withScope(caller).selectScoped(
      companyprojects,
      eq(companyprojects.id, projectId),
    )) as Array<{ companyId: string | null }>;
    const cid = rows[0]?.companyId;
    if (!cid) {
      throw new Error(`feedback sink project not found or has no company: ${projectId}`);
    }
    cachedSinkCustomerId = cid;
  }
  return withScope({ ...caller, projectId, customerId: cachedSinkCustomerId });
}
// [SCOPE 043 / T012] END
