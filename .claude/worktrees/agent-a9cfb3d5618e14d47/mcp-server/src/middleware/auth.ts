/**
 * Spec 028 / T005 — Bearer token auth middleware.
 *
 * Validates `Authorization: Bearer wxk_live_<64hex>` against `mcpapitokens`,
 * attaches scope context to the request, and updates `lastusedat` on success.
 *
 * Bypass: when `MCP_AUTH_REQUIRED !== 'true'`, the middleware short-circuits
 * with a synthetic dev scope. Production deployments MUST set the flag.
 */
import { createHash } from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { and, eq, gt, isNull, or, sql } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { mcpapitokens } from '../db/schema.js';
import logger from '../utils/logger.js';
import { findInAgentReach, isDeviceLive, parseAgentTokenName } from '../utils/agent-reach.js'; // [SCOPE 152 / T007]

/** Must match AGENT_GRANT_TOKEN_PREFIX in the app's AgentConnectService. */
export const AGENT_GRANT_TOKEN_PREFIX = 'agent-grant:';

export interface McpScope {
  tokenId: string | null;
  customerId: string | null;
  projectId: string | null;
  tokenPrefix: string | null;
  // [SCOPE 043 / T002] the acting user for a project-scoped token = the user who
  // issued it (mcpapitokens.issuedbyid). Used as the feedback submitter identity.
  userId: string | null;
  // [SCOPE 148 / T002] mcpapitokens.name, so a handler can tell a server-minted agent token
  // (`project-agent:…`) from a person's. Set by the middleware only, never from the request.
  tokenName?: string | null;
  authMode: 'token' | 'dev-bypass';
}

declare module 'express-serve-static-core' {
  interface Request {
    mcpScope?: McpScope;
  }
}

const DEV_BYPASS_SCOPE: McpScope = {
  tokenId: null,
  customerId: null,
  projectId: null,
  tokenPrefix: null,
  userId: null,
  authMode: 'dev-bypass',
};

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

function isAuthRequired(): boolean {
  return (process.env.MCP_AUTH_REQUIRED ?? 'true').toLowerCase() === 'true';
}

function parseBearer(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  if (req.path === '/health') {
    next();
    return;
  }

  if (!isAuthRequired()) {
    req.mcpScope = DEV_BYPASS_SCOPE;
    next();
    return;
  }

  const raw = parseBearer(req.header('Authorization'));
  if (!raw) {
    res.status(401).json({ error: 'missing-token' });
    return;
  }

  // [SCOPE 152 / T018] A failed check refuses this one request. Thrown out of this async middleware
  // it would be an unhandled rejection, which exits the process and takes MCP down for everyone.
  try {
    const tokenhash = hashToken(raw);
    const now = new Date();

    const [row] = await db
      .select()
      .from(mcpapitokens)
      .where(
        and(
          eq(mcpapitokens.tokenhash, tokenhash),
          isNull(mcpapitokens.revokedat),
          or(isNull(mcpapitokens.expiresat), gt(mcpapitokens.expiresat, now)),
        ),
      )
      .limit(1);

    if (!row) {
      res.status(401).json({ error: 'invalid-token' });
      return;
    }

    // [SCOPE 134 / T028] BEGIN — per-call grant re-check for grant-minted agent tokens
    // MODIFIED-BY: [SCOPE 152 / T007] — re-check the K.A.I.N. device and the person's reach, not a tick
    // A token minted by /api/agent/connect is only as good as the person and device behind it.
    // Checked on EVERY request, not cached: Allow remote off, an engagement paused or ended, an
    // assignment removed, the person deactivated or the device revoked must stop an agent already
    // working (FR-070). Tokens without the marker — every user token, and hand-made agent tokens —
    // are untouched. A retired `agent-grant:<AGENT>` name (minted from a Company Access Token, before
    // devices) carries no device and is refused.
    if (row.name.startsWith(AGENT_GRANT_TOKEN_PREFIX)) {
      const parsed = parseAgentTokenName(row.name, AGENT_GRANT_TOKEN_PREFIX);
      if (!parsed || !row.issuedbyid || !row.projectid) {
        res.status(401).json({ error: 'device_signed_out' });
        return;
      }
      if (!(await isDeviceLive(db, parsed.deviceId, row.issuedbyid))) {
        res.status(401).json({ error: 'device_signed_out' });
        return;
      }
      if (!(await findInAgentReach(db, row.issuedbyid, row.projectid))) {
        res.status(401).json({ error: 'access_revoked' });
        return;
      }
    }
    // [SCOPE 134 / T028] END

    req.mcpScope = {
      tokenId: row.id,
      customerId: row.customerid,
      projectId: row.projectid,
      tokenPrefix: row.tokenprefix,
      userId: row.issuedbyid, // [SCOPE 043 / T002] acting user for feedback submitter
      tokenName: row.name, // [SCOPE 148 / T002] the `via` of a feedback status change (FR-013)
      authMode: 'token',
    };

    // Best-effort lastusedat bump — never blocks the request.
    db.update(mcpapitokens)
      .set({ lastusedat: sql`now()` })
      .where(eq(mcpapitokens.id, row.id))
      .catch((err) => {
        logger.warn('auth.lastusedat.update.failed', { tokenId: row.id, error: (err as Error).message });
      });
  } catch (err) {
    logger.error('auth.check.failed', err as Error);
    if (!res.headersSent) res.status(500).json({ error: 'auth_check_failed' });
    return;
  }

  next();
};
