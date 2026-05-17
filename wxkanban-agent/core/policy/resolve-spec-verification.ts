// Spec 030 FR-004 — DB resolver for "is the project's active scope properly
// verified for implementation?". Queries projectspecifications to find the
// active scope, then projecttasks + projectdocuments to verify the
// downstream artifacts exist. The only code path in the kit that converts
// active-scope state into a SpecVerification value. Both adapters import
// this helper (MCP always; CLI when its caller has not pre-fetched).

import type { SpecVerification } from "./policy";

// Minimal DB shape this resolver needs. Compatible with FenceDbClient
// (fence-db.ts) and trivially adaptable from a Drizzle instance via
// db.execute(sql`...`) → { rows }.
export interface SpecVerificationQueryClient {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[] }>;
}

// projectspecifications.status values that indicate the scope is currently
// active work (planned → tasks_generated → implementing). Status values
// before 'planned' (draft, in_review, pending_clarification, clarified)
// are spec-design states; status values after 'implementing' (implemented,
// qa_passed, human_tested, beta_cleared, released) are post-implementation.
// See src/db/schema/projectspecification.ts for the full list.
const ACTIVE_SCOPE_STATUSES = [
  "planned",
  "tasks_generated",
  "implementing",
] as const;

// Returned when the active scope cannot be determined for any reason.
// policy.evaluate() then blocks with the existing "missing spec" message.
const ALL_MISSING: SpecVerification = {
  specExists: false,
  tasksExist: false,
  documentsExist: false,
};

export async function resolveSpecVerification(
  db: SpecVerificationQueryClient,
  projectId: string,
): Promise<SpecVerification> {
  // 1. Find the active scope. If 0 or >1 active scopes, treat as a
  //    precondition violation per spec 030 FR-004 corner-case rules.
  const scopeResult = await db.query<{ id: string; status: string }>(
    `SELECT id, status
       FROM projectspecifications
      WHERE projectid = $1
        AND status = ANY($2::text[])`,
    [projectId, ACTIVE_SCOPE_STATUSES],
  );

  if (scopeResult.rows.length !== 1) {
    return ALL_MISSING;
  }

  const activeScope = scopeResult.rows[0]!;

  // 2. Verify downstream artifacts exist for the active scope.
  const [tasksResult, docsResult] = await Promise.all([
    db.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM projecttasks WHERE specid = $1`,
      [activeScope.id],
    ),
    db.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM projectdocuments WHERE specid = $1`,
      [activeScope.id],
    ),
  ]);

  const taskCount = Number(tasksResult.rows[0]?.c ?? "0");
  const docCount = Number(docsResult.rows[0]?.c ?? "0");

  return {
    specExists: true,
    tasksExist: taskCount > 0,
    documentsExist: docCount > 0,
    specStatus: activeScope.status,
  };
}
