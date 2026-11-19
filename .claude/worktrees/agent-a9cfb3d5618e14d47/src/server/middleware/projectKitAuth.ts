/**
 * projectKitAuth — spec 019 R15 AC11.
 *
 * Auth middleware for the project-kit endpoints that need to be callable
 * from headless consumer scripts (check-kit-version.mjs, upgrade-kit.mjs).
 * Tries JWT first (matches the existing authenticateToken behavior so the
 * wxKanban web UI still works), then falls back to bearer-token lookup in
 * the apitokens table.
 *
 * Why this exists: the standard authenticateToken middleware requires a
 * JWT minted by wxKanban's login flow — fine for browser-driven calls,
 * impossible for a script that only has the WXKANBAN_API_TOKEN written
 * into its kit's .env. Reusing that same API token for kit/* endpoints is
 * a deliberate (small) expansion of what the token authorizes; it already
 * decrypts the embedded DATABASE_URL, so granting it access to read the
 * latest available kit version + request an upgrade archive is a tight
 * extension of the same trust boundary.
 *
 * Apply ONLY to:
 *   GET /api/projects/:id/kit/upgrade
 *   GET /api/projects/:id/kit/latest-version
 *
 * The same JWT-or-project-token pattern, with the project taken from the
 * request body instead of the URL, guards POST /api/consultant-hub/agent-runs
 * (SPEC-143 T024: authenticateRunSender in routes/agentRuns.ts).
 *
 * Do NOT apply to /api/projects/:id/kit/download — that path uses JWT-
 * only because it issues a fresh API token in its response, which would
 * be a footgun if the request itself authenticated with an API token.
 */

import { Response, NextFunction } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { userprofiles } from '../../db/schema/userprofiles.js';
import { apiTokenService } from '../services/ApiTokenService.js';
import { verifyToken, extractToken } from '../lib/jwt.js';
import { logger } from '../lib/logger.js';
import type { AuthRequest } from './auth.js';

function getBearerToken(req: AuthRequest): string | null {
  const headerToken = extractToken(req.headers.authorization);
  if (headerToken) return headerToken;
  // Cookies are JWT-only — API tokens are header-only by convention.
  return null;
}

export async function authenticateProjectKitAccess(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Missing authorization token' });
    return;
  }

  // Try JWT first — preserves existing browser-driven behavior.
  try {
    const payload = verifyToken(token);
    req.userid = payload.userid;
    req.email = payload.email;
    req.companyid = payload.companyid;
    req.usertype = payload.usertype;
    req.billingplan = payload.billingplan;
    req.subscriptionstatus = payload.subscriptionstatus;
    req.maxusers = payload.maxusers;
    next();
    return;
  } catch {
    // JWT verification failed — fall through to API-token path.
  }

  // API token fallback — for headless consumer scripts.
  const tokenRecord = await apiTokenService.validateToken(token);
  if (!tokenRecord) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  // Spec 028 Phase 11 (2026-05-23): every token is project-scoped now.
  // The URL :id must match the token's projectid.
  const urlProjectId = String(req.params.id ?? '');
  if (tokenRecord.projectid !== urlProjectId) {
    logger.warn(
      { tokenId: tokenRecord.id, tokenProjectId: tokenRecord.projectid, urlProjectId },
      'project-scoped API token used against a different project',
    );
    res.status(403).json({ error: 'API token is scoped to a different project' });
    return;
  }

  // Hydrate the request with user identity so downstream canManageProjectKit
  // works. usertype is fetched from userprofiles since mcpapitokens doesn't store it.
  try {
    const [user] = await db
      .select({
        usertype: userprofiles.usertype,
        emailaddr: userprofiles.emailaddr,
      })
      .from(userprofiles)
      .where(eq(userprofiles.id, tokenRecord.userid))
      .limit(1);

    if (!user) {
      res.status(401).json({ error: 'API token references a user that no longer exists' });
      return;
    }

    req.userid = tokenRecord.userid;
    req.companyid = tokenRecord.companyid;
    req.usertype = user.usertype;
    req.email = user.emailaddr;
    next();
  } catch (err) {
    logger.error({ err, tokenId: tokenRecord.id }, 'projectKitAuth: failed to hydrate user');
    res.status(500).json({ error: 'Failed to validate API token' });
  }
}
