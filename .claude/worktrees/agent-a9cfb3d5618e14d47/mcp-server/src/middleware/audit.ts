/**
 * Spec 028 / T007 — Per-request audit middleware.
 *
 * Attaches a mutable audit record at request entry. Other middlewares
 * (rate-limit, auth, scoped-query) mutate `req.mcpAudit.outcome` and
 * `errorcode` as they decide the outcome. On `res.finish`, the row is
 * INSERTed asynchronously so the response is not blocked.
 *
 * `/health` is skipped entirely.
 */
import { randomUUID } from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { db } from '../db/connection.js';
import { mcprequestaudit, type McpAuditOutcome } from '../db/schema.js';
import logger from '../utils/logger.js';

export interface McpAuditRecord {
  requestid: string;
  startMs: number;
  tool: string | null;
  /** [SCOPE 043 / audit] The project the caller asked for, vs the token's project. */
  requestedProjectId: string | null;
  outcome: McpAuditOutcome;
  errorcode: string | null;
}

declare module 'express-serve-static-core' {
  interface Request {
    mcpAudit?: McpAuditRecord;
  }
}

// [SCOPE 043 / T019] BEGIN — record the tool + the REQUESTED project
/**
 * Requests arrive in three shapes and the audit row must read the same facts
 * out of all of them:
 *   - `{ tool, args }`                              — the REST /call route
 *   - `{ method:'tools/call', params:{name,arguments} }` — JSON-RPC / streamable
 *   - an array of either                            — JSON-RPC batch
 *
 * The previous extractor understood only the first, so any call arriving over the
 * streamable transport recorded `tool: null` — which makes the trail unable to
 * answer "which requests hit this tool", the question an audit exists for.
 */
export interface CallDetails {
  tool: string | null;
  requestedProjectId: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The nil UUID is the conventional "no value" sentinel. It is shape-valid, so a
 * shape-only check stores it as though the caller had named a project — and no
 * project can ever carry it (primary keys are UUID v7; verified 2026-08-04 that
 * no row in companyprojects, companies or mcpapitokens holds it).
 */
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

/**
 * The audit row is written from the raw body at request ENTRY — before any Zod
 * schema has validated it. `requestedprojectid` is a uuid column, so anything that
 * is not a well-formed UUID must be dropped to null here. Passing a malformed
 * string through would fail the INSERT with 22P02, and asyncWriteAudit swallows
 * insert errors into a warning — so a hostile or buggy client could silently
 * suppress its own audit rows by sending a non-UUID projectId.
 *
 * A well-formed value must ALSO be a value that could name a project. The nil UUID
 * is not: storing it asserts "the caller requested project 000…", which is a claim
 * about intent that never happened. That matters because
 * `requestedprojectid IS DISTINCT FROM projectid` is the only predicate that can
 * find a cross-tenant request (NEW-2), so a sentinel recorded as a request is a
 * false positive in the query an investigation would run first. Observed in
 * production 2026-08-04, where it was one of two rows the detection query returned.
 * Null is the honest record: the caller named no project.
 */
function asUuid(v: unknown): string | null {
  if (typeof v !== 'string' || !UUID_RE.test(v)) return null;
  return v.toLowerCase() === NIL_UUID ? null : v;
}

function detailsOfOne(msg: unknown): CallDetails {
  const none: CallDetails = { tool: null, requestedProjectId: null };
  if (!msg || typeof msg !== 'object') return none;

  const m = msg as {
    tool?: unknown;
    args?: unknown;
    method?: unknown;
    params?: { name?: unknown; arguments?: unknown };
  };

  // REST /call — { tool, args }
  if (typeof m.tool === 'string') {
    const args = (m.args ?? {}) as Record<string, unknown>;
    return {
      tool: m.tool,
      requestedProjectId: asUuid(args['projectId'] ?? args['projectid']),
    };
  }

  // JSON-RPC — { method:'tools/call', params:{ name, arguments } }
  if (m.method === 'tools/call' && m.params && typeof m.params === 'object') {
    const a = (m.params.arguments ?? {}) as Record<string, unknown>;
    return {
      tool: typeof m.params.name === 'string' ? m.params.name : null,
      requestedProjectId: asUuid(a['projectId'] ?? a['projectid']),
    };
  }

  return none;
}

/**
 * One audit row is written per HTTP request, but a JSON-RPC batch can carry many
 * tool calls. The FIRST call carrying a tool name wins; the rest are not recorded.
 * That is a known limitation of one-row-per-request, not an oversight — splitting
 * a batch into several audit rows is a larger change than this fix.
 */
export function extractCallDetails(body: unknown): CallDetails {
  if (Array.isArray(body)) {
    for (const entry of body) {
      const d = detailsOfOne(entry);
      if (d.tool !== null) return d;
    }
    return { tool: null, requestedProjectId: null };
  }
  return detailsOfOne(body);
}
// [SCOPE 043 / T019] END

function asyncWriteAudit(payload: typeof mcprequestaudit.$inferInsert): void {
  db.insert(mcprequestaudit)
    .values(payload)
    .catch((err) => {
      logger.warn('audit.write.failed', {
        requestid: payload.requestid,
        outcome: payload.outcome,
        error: (err as Error).message,
      });
    });
}

export const auditStartMiddleware = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  if (req.path === '/health') {
    next();
    return;
  }
  const details = extractCallDetails(req.body);
  req.mcpAudit = {
    requestid: randomUUID(),
    startMs: Date.now(),
    tool: details.tool,
    requestedProjectId: details.requestedProjectId,
    outcome: 'success',
    errorcode: null,
  };
  next();
};

export const auditFinishMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  if (req.path === '/health') {
    next();
    return;
  }
  res.on('finish', () => {
    const audit = req.mcpAudit;
    if (!audit) return;

    let outcome: McpAuditOutcome = audit.outcome;
    let errorcode = audit.errorcode;
    if (res.statusCode >= 500) {
      outcome = 'error';
      errorcode = errorcode ?? 'internal-error';
    } else if (res.statusCode === 401) {
      outcome = 'auth-failed';
      errorcode = errorcode ?? 'invalid-token';
    } else if (res.statusCode === 403) {
      outcome = 'scope-violation';
      errorcode = errorcode ?? 'cross-scope';
    } else if (res.statusCode === 429) {
      outcome = 'throttled';
      errorcode = errorcode ?? 'rate-limited';
    } else if (res.statusCode >= 400) {
      outcome = 'error';
      errorcode = errorcode ?? `http-${res.statusCode}`;
    }

    asyncWriteAudit({
      requestid: audit.requestid,
      tokenid: req.mcpScope?.tokenId ?? null,
      customerid: req.mcpScope?.customerId ?? null,
      projectid: req.mcpScope?.projectId ?? null,
      // [SCOPE 043 / audit] Requires migration 0061. If the code ships before that
      // DDL lands, this key fails the INSERT with 42703 and the error is swallowed
      // below — audit logging stops without any request failing.
      requestedprojectid: audit.requestedProjectId,
      tool: audit.tool,
      methodpath: `${req.method} ${req.path}`,
      durationms: Date.now() - audit.startMs,
      outcome,
      errorcode,
      responsestatus: res.statusCode,
      clientip: req.ip ?? req.socket.remoteAddress ?? null,
      useragent: req.header('User-Agent') ?? null,
    });
  });
  next();
};
