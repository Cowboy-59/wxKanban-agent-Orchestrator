// [SCOPE 043 / T018] BEGIN — caller project-access check (cross-tenant disclosure fix)
// WHY THIS EXISTS: list_my_feedback accepts `projectId` from the CALLER and uses it
// to decide which feedback the view returns. Feedback is stored in one central sink
// project (feedback-sink.ts), and resolveSinkScope rebinds ANY caller's scope to that
// sink — so the scoped-query guard faithfully enforces `projectid = sink`, which every
// tenant's row satisfies. The tenancy decision therefore fell entirely to a post-fetch
// filter driven by unvalidated caller input, and nothing compared that input to the
// caller's own token.
//
// Verified 2026-08-02 against production: a token bound to project A returned project
// B's feedback in full, and passing the sink's own id (a hardcoded public constant)
// returned every tenant's submissions in one call.
//
// The check is company-level on purpose. It preserves the behaviour the Cockpit needs
// — the workspace's project may legitimately differ from the token's bound project —
// while making "some other company's project" unreachable. It also closes the
// showAllInProject switch for free: only a caller whose company OWNS the sink can pass
// this check for the sink's id, so the triage-hub view stops being reachable by typing
// a public UUID.
import { eq } from 'drizzle-orm';
import { withScope } from '../db/scoped-query.js';
import { companyprojects } from '../db/schema.js';
import type { McpScope } from '../middleware/auth.js';

export class ProjectAccessError extends Error {
  readonly code = 'scope-violation';
  constructor(message: string) {
    super(message);
    this.name = 'ProjectAccessError';
  }
}

/**
 * A single opaque message for every denial. Distinguishing "no such project" from
 * "not your project" would turn this into an existence oracle for project ids.
 */
export const PROJECT_ACCESS_DENIED =
  'scope-violation: the requested project is not accessible to this token.';

export interface ProjectAccessDecisionInput {
  /** The caller's company, from the token. */
  callerCompanyId: string | null;
  /** How the caller authenticated. */
  authMode: McpScope['authMode'];
  /**
   * The company that owns the requested project, or null when the project does
   * not exist or carries no company.
   */
  projectOwnerCompanyId: string | null;
}

/**
 * Pure, DB-free access decision — default-deny.
 *
 * Every branch that is not an explicit company match denies, so a new McpScope
 * shape or an unresolvable project fails closed rather than falling through.
 */
export function decideProjectAccess(input: ProjectAccessDecisionInput): {
  allowed: boolean;
  reason: string;
} {
  // dev-bypass carries no customer identity, so it cannot be checked against one.
  // It must not inherit access by virtue of being unauthenticated.
  if (input.authMode !== 'token') {
    return { allowed: false, reason: 'dev-bypass carries no company identity' };
  }
  if (!input.callerCompanyId) {
    return { allowed: false, reason: 'token resolved no company' };
  }
  if (!input.projectOwnerCompanyId) {
    return { allowed: false, reason: 'project not found or has no owning company' };
  }
  if (input.projectOwnerCompanyId !== input.callerCompanyId) {
    return { allowed: false, reason: 'project belongs to a different company' };
  }
  return { allowed: true, reason: 'project belongs to the caller company' };
}

/**
 * Throw unless `projectId` belongs to the caller's company.
 *
 * Call this BEFORE resolveSinkScope — once the scope has been rebound to the sink,
 * the caller's own company is no longer on the scope to check against.
 */
export async function assertCallerCanViewProject(
  caller: McpScope,
  projectId: string,
): Promise<void> {
  // MODIFIED-BY: [SCOPE 043 / T024] — delegates to callerCanViewProject so the
  // throwing gate and the advertised capability cannot drift apart.
  if (!(await callerCanViewProject(caller, projectId))) {
    throw new ProjectAccessError(PROJECT_ACCESS_DENIED);
  }
}
// [SCOPE 043 / T018] END

// [SCOPE 043 / T024] BEGIN — the same decision, asked as a question (FR-022)
/**
 * Non-throwing form of {@link assertCallerCanViewProject}.
 *
 * Amendment D FR-022 needs to TELL the Cockpit whether it may ask for the incoming
 * queue, instead of letting it find out by being refused twice a minute. That is
 * the same question the gate already answers, so it must not become a second
 * implementation of it: a capability check that drifts from the enforcement it
 * advertises either hides a feature or invites a request that will be refused.
 *
 * The enforcement direction is unchanged — `assertCallerCanViewProject` still runs
 * on every privileged path. This only lets a caller find out the answer cheaply and
 * in advance; it grants nothing, and a client that ignores the flag is still
 * refused.
 */
export async function callerCanViewProject(
  caller: McpScope,
  projectId: string,
): Promise<boolean> {
  // companyprojects is not project-scoped, so selectScoped runs an unscoped read
  // here (no direct db import — keeps the no-direct-db CI invariant).
  const rows = (await withScope(caller).selectScoped(
    companyprojects,
    eq(companyprojects.id, projectId),
  )) as Array<{ companyId: string | null }>;

  return decideProjectAccess({
    callerCompanyId: caller.customerId,
    authMode: caller.authMode,
    projectOwnerCompanyId: rows[0]?.companyId ?? null,
  }).allowed;
}
// [SCOPE 043 / T024] END

// [SCOPE 043 / T023] BEGIN — classify a denial as a refusal, not a server fault (FR-021)
// Amendment D. `ProjectAccessError` is a plain Error, so it missed the
// `instanceof McpError` branch in the tool-call catch and landed in the generic
// one: logged at ERROR and rethrown as InternalError (-32603), which /call then
// turned into an HTTP 500. Measured 2026-08-04: three consumer projects polling the
// vendor-only incoming queue produced 5,396 "errors" in a day for what is the
// correct, permanent answer "no".
//
// The tool layer converts the denial to an McpError, so by the time the HTTP layer
// sees it the class is gone. Rather than match on the message — which would couple
// the transport to the wording of an opaque string that exists precisely so it can
// stay uninformative — the conversion stamps this marker into McpError's `data`,
// and both layers ask the same predicate.
export const PROJECT_ACCESS_DENIAL_MARKER = 'scope-violation';

/** True for a project-access denial in either form: raw, or already converted. */
export function isProjectAccessDenial(error: unknown): boolean {
  if (error instanceof ProjectAccessError) return true;
  const data = (error as { data?: unknown } | null | undefined)?.data;
  if (typeof data !== 'object' || data === null) return false;
  return (data as { reason?: unknown }).reason === PROJECT_ACCESS_DENIAL_MARKER;
}
// [SCOPE 043 / T023] END

// [SCOPE 043 / T025] BEGIN — make the denial reach the audit row on every transport
/**
 * Report a denial to the audit record, via the callback the HTTP layer injects
 * into server-owned `_meta`.
 *
 * T023 made `/call` answer 403, and `auditFinishMiddleware` derives
 * `outcome: 'scope-violation'` from that status. `/mcp` and `/messages` never
 * produce a 4xx — a JSON-RPC error rides inside HTTP 200 (or 202 on the SSE
 * ack) — so on those two transports the status-code mapping cannot fire and the
 * denial would still be written as `success`. That is the residual half of
 * NEW-3: anyone filtering the audit trail for `scope-violation` gets an empty
 * set while denials are happening.
 *
 * `_meta` is the channel because it is the one the server already owns and that
 * is already proven to reach the handler — `mcpScope` travels the same way on
 * all three transports. A callback rather than the audit record itself: a
 * function cannot survive `JSON.stringify`, so if `_meta` is ever logged or
 * echoed, this leaks nothing. Given `_meta` has twice been the trust boundary
 * that failed here (H-3, NEW-8), what sits in it should be as small as possible.
 *
 * Defensive on purpose. A caller cannot send a function, but it can send the
 * KEY holding a string — and calling that blindly would raise a TypeError, which
 * becomes the 500 that FR-021 exists to remove. The strip list in
 * `SERVER_OWNED_META_KEYS` removes it first; this is the second layer.
 */
export function recordDenialFromMeta(meta: unknown): void {
  if (typeof meta !== 'object' || meta === null) return;
  const fn = (meta as { recordDenial?: unknown }).recordDenial;
  if (typeof fn === 'function') (fn as () => void)();
}
// [SCOPE 043 / T025] END
