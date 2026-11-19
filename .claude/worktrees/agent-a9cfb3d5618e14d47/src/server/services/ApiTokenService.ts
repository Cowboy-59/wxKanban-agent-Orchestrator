/**
 * ApiTokenService
 *
 * Manages project-scoped API tokens. Spec 028 Phase 11 (2026-05-23) unified
 * the token store: `mcpapitokens` is now the single source of truth, used by
 * the hosted MCP middleware AND the wxKanban kit endpoints. Personal/user-
 * level tokens are no longer supported — every token is bound to a project.
 *
 * Public surface preserved for callers; internal storage moved from `apitokens`
 * to `mcpapitokens`. `createToken` now requires `projectId`.
 */

import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { mcpapitokens, type McpApiToken, type NewMcpApiToken } from '../../db/schema/mcpapitokens.js';
import { kitEncryptionService } from './KitEncryptionService';
import { logger } from '../lib/logger';

export interface CreateTokenResult {
  token: string;  // Full token (shown once)
  record: McpApiToken;
}

/**
 * Compatibility shape — preserves the field set the pre-Phase-11
 * `apitokens` row exposed to callers, mapped onto the `mcpapitokens` columns.
 * Lets callers keep using `userid`/`companyid`/`createdat`/`projectid`
 * without churn. Internal-only; service methods return McpApiToken.
 *
 * Drop these aliases once every caller has been migrated to the
 * McpApiToken field names.
 */
export interface ApiTokenCompat extends McpApiToken {
  userid: string;     // alias of issuedbyid
  companyid: string;  // alias of customerid
}

function withCompatAliases(row: McpApiToken): ApiTokenCompat {
  return Object.assign({}, row, {
    userid: row.issuedbyid,
    companyid: row.customerid,
  });
}

export class ApiTokenService {
  private static instance: ApiTokenService;

  private constructor() {}

  public static getInstance(): ApiTokenService {
    if (!ApiTokenService.instance) {
      ApiTokenService.instance = new ApiTokenService();
    }
    return ApiTokenService.instance;
  }

  /**
   * Create a new project-scoped API token.
   *
   * `projectId` is required as of Phase 11. Callers that previously omitted it
   * were minting personal tokens, which are no longer supported.
   */
  async createToken(
    userId: string,
    companyId: string,
    projectId: string,
    name?: string,
  ): Promise<CreateTokenResult> {
    const token = kitEncryptionService.generateApiToken();
    const tokenPrefix = token.substring(0, 12);
    const tokenHash = kitEncryptionService.hashToken(token);

    const [existing] = await db
      .select()
      .from(mcpapitokens)
      .where(eq(mcpapitokens.tokenhash, tokenHash))
      .limit(1);

    if (existing) {
      logger.error('Token hash collision detected — retrying');
      return this.createToken(userId, companyId, projectId, name); // Retry once
    }

    const newToken: NewMcpApiToken = {
      customerid: companyId,
      projectid: projectId,
      issuedbyid: userId,
      tokenprefix: tokenPrefix,
      tokenhash: tokenHash,
      name: name || `Token ${new Date().toISOString().split('T')[0]}`,
    };

    const [record] = await db.insert(mcpapitokens).values(newToken).returning();

    logger.info({ userId, projectId, tokenId: record.id }, 'API token created');

    return { token, record };
  }

  /**
   * Validate a bearer token. Returns the row (with compat aliases) on hit,
   * null on miss. Refreshes `lastusedat` on hit.
   */
  async validateToken(token: string): Promise<ApiTokenCompat | null> {
    const tokenHash = kitEncryptionService.hashToken(token);

    const [record] = await db
      .select()
      .from(mcpapitokens)
      .where(and(
        eq(mcpapitokens.tokenhash, tokenHash),
        isNull(mcpapitokens.revokedat),
      ))
      .limit(1);

    if (!record) return null;

    // Best-effort lastusedat bump — never blocks the request.
    db.update(mcpapitokens)
      .set({ lastusedat: sql`now()` })
      .where(eq(mcpapitokens.id, record.id))
      .catch((err: unknown) => logger.warn({ err, tokenId: record.id }, 'lastusedat bump failed'));

    return withCompatAliases(record);
  }

  /**
   * List tokens issued for a project (replaces pre-Phase-11 listUserTokens).
   * Callers needing user-scope can filter by `issuedbyid` client-side.
   */
  async listProjectTokens(projectId: string): Promise<McpApiToken[]> {
    return db
      .select()
      .from(mcpapitokens)
      .where(eq(mcpapitokens.projectid, projectId))
      .orderBy(mcpapitokens.issuedat);
  }

  /**
   * Revoke a token. The `userId` argument is recorded as `revokedbyid`; it
   * is no longer used to ownership-check (project membership checks live in
   * the route layer).
   */
  async revokeToken(tokenId: string, userId: string): Promise<boolean> {
    const result = await db
      .update(mcpapitokens)
      .set({ revokedat: new Date(), revokedbyid: userId })
      .where(and(eq(mcpapitokens.id, tokenId), isNull(mcpapitokens.revokedat)))
      .returning();

    if (result.length > 0) {
      logger.info({ tokenId, userId }, 'API token revoked');
      return true;
    }
    return false;
  }

  /**
   * Fetch a token row by id.
   */
  async getTokenById(tokenId: string): Promise<McpApiToken | null> {
    const [record] = await db
      .select()
      .from(mcpapitokens)
      .where(eq(mcpapitokens.id, tokenId))
      .limit(1);

    return record || null;
  }

  /**
   * Reuse an active project token if one exists, otherwise mint a new one.
   * The returned `token` string is empty when we're reusing — callers cannot
   * recover the cleartext from the hash and must source it from the prior
   * kit's `.env`. New mints return the cleartext exactly once.
   */
  async getOrCreateToken(
    userId: string,
    companyId: string,
    projectId: string,
    name?: string,
  ): Promise<CreateTokenResult> {
    const [existing] = await db
      .select()
      .from(mcpapitokens)
      .where(and(
        eq(mcpapitokens.projectid, projectId),
        isNull(mcpapitokens.revokedat),
      ))
      .orderBy(mcpapitokens.issuedat)
      .limit(1);

    if (existing) {
      logger.info({ projectId, tokenId: existing.id }, 'Reusing existing project token');
      return { token: '', record: existing };
    }

    return this.createToken(userId, companyId, projectId, name);
  }
}

export const apiTokenService = ApiTokenService.getInstance();
