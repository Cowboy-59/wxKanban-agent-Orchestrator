/**
 * Company agent tokens — issue, list and revoke an agent's admission ticket.
 * SCOPE-134 / T026.
 *
 * Mirrors ApiTokenService's construction deliberately: the same generator, the same
 * hashing, the same show-once contract. Two token formats in one product would be two
 * things to reason about at every call site, and the difference between these credentials
 * is what they may DO, not what they look like.
 *
 * What this token may do: prove an agent can connect to a company, and list its grants.
 * What it may NOT do: read or write any project data. That is why it lives outside
 * `mcpapitokens` and never meets `scoped-query`.
 */
import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '~/db/client.js';
import { companyagenttokens, type CompanyAgentToken } from '~/db/schema/companyagenttoken.js';
import { kitEncryptionService } from './KitEncryptionService.js';
import { logger } from '~/server/lib/logger.js';

export interface IssuedAgentToken {
  /** The raw token. Returned ONCE — only its hash is stored. */
  token: string;
  record: CompanyAgentToken;
}

/** What a listing may safely show: never the token, never the hash. */
export interface AgentTokenSummary {
  id: string;
  agentname: string;
  tokenprefix: string;
  label: string | null;
  issuedat: Date;
  lastusedat: Date | null;
}

// [SCOPE 134 / T026] BEGIN — CompanyAgentTokenService
export class CompanyAgentTokenService {
  /**
   * Issue a ticket for one agent in one company.
   *
   * Re-issuing REVOKES the existing live ticket rather than adding a second. Accumulating
   * credentials that nothing ever retires is the exact failure YappChatt's agent tokens
   * demonstrate — they insert on every call and never revoke — and it is worth not
   * repeating on our own side of the boundary.
   */
  async issue(
    companyid: string,
    agentname: string,
    issuedbyid: string,
    label?: string,
  ): Promise<IssuedAgentToken> {
    const token = kitEncryptionService.generateApiToken();
    const tokenhash = kitEncryptionService.hashToken(token);
    const tokenprefix = token.substring(0, 12);

    const [record] = await db.transaction(async (tx) => {
      await tx
        .update(companyagenttokens)
        .set({ revokedat: new Date(), revokedbyid: issuedbyid })
        .where(
          and(
            eq(companyagenttokens.companyid, companyid),
            eq(companyagenttokens.agentname, agentname),
            isNull(companyagenttokens.revokedat),
          ),
        );

      return tx
        .insert(companyagenttokens)
        .values({ companyid, agentname, tokenhash, tokenprefix, issuedbyid, label: label ?? null })
        .returning();
    });

    logger.info({ companyid, agentname, tokenprefix, issuedbyid }, 'agent token issued');
    return { token, record };
  }

  /** Live tickets for a company. Never returns the hash — a listing is not a credential. */
  async list(companyid: string): Promise<AgentTokenSummary[]> {
    return db
      .select({
        id: companyagenttokens.id,
        agentname: companyagenttokens.agentname,
        tokenprefix: companyagenttokens.tokenprefix,
        label: companyagenttokens.label,
        issuedat: companyagenttokens.issuedat,
        lastusedat: companyagenttokens.lastusedat,
      })
      .from(companyagenttokens)
      .where(and(eq(companyagenttokens.companyid, companyid), isNull(companyagenttokens.revokedat)))
      .orderBy(desc(companyagenttokens.issuedat));
  }

  /**
   * Revoke one ticket.
   *
   * Scoped by company as well as id: an id alone would let a caller revoke another
   * company's credential by guessing, and a uuid is not an authorization.
   */
  async revoke(companyid: string, id: string, revokedbyid: string): Promise<boolean> {
    const rows = await db
      .update(companyagenttokens)
      .set({ revokedat: new Date(), revokedbyid })
      .where(
        and(
          eq(companyagenttokens.id, id),
          eq(companyagenttokens.companyid, companyid),
          isNull(companyagenttokens.revokedat),
        ),
      )
      .returning({ id: companyagenttokens.id });

    if (rows.length) logger.info({ companyid, id, revokedbyid }, 'agent token revoked');
    return rows.length > 0;
  }

  /**
   * Resolve a presented token to its live row, or null.
   *
   * Returns null for revoked as well as unknown: a revoked ticket and a fabricated one
   * are the same answer to the caller, and distinguishing them tells an attacker which
   * guesses were once real.
   */
  async validate(token: string): Promise<CompanyAgentToken | null> {
    const tokenhash = kitEncryptionService.hashToken(token);
    const [row] = await db
      .select()
      .from(companyagenttokens)
      .where(and(eq(companyagenttokens.tokenhash, tokenhash), isNull(companyagenttokens.revokedat)))
      .limit(1);

    if (!row) return null;

    // Best-effort, non-blocking: a failed timestamp update must never fail a valid
    // authentication.
    void db
      .update(companyagenttokens)
      .set({ lastusedat: new Date() })
      .where(eq(companyagenttokens.id, row.id))
      .catch(() => undefined);

    return row;
  }
}
// [SCOPE 134 / T026] END

export const companyAgentTokenService = new CompanyAgentTokenService();
