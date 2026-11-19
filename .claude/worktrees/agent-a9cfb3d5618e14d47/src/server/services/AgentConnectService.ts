/**
 * Agent connect — turn a company admission ticket into working access to ONE project.
 * SCOPE-134 / T028 (company-token authentication) and T005–T008 (room binding).
 *
 * The chain, every link server-side:
 *
 *   company token (companyagenttokens)      proves the agent may CONNECT to this company
 *     → live grant (projectagentgrants)      proves a human ticked THIS project for it
 *       → project MCP token (mcpapitokens)   short-lived, project-scoped, bound NAME:<hash>
 *       → room (projectrooms)                derived from the projectId, never client-supplied
 *
 * The minted MCP token is an ordinary project token, so it meets `scoped-query` and every
 * SOC 2 H-3 guard unchanged, and `clientbinding` makes `record_override` accept it. What
 * makes it different is its `name` marker: the MCP auth middleware re-checks the grant on
 * EVERY call for tokens carrying it, so unticking the box stops an agent already working.
 */
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '~/db/client.js';
import { mcpapitokens } from '~/db/schema/mcpapitokens.js';
import { companyprojects } from '~/db/schema/companyproject.js';
import { userprofiles } from '~/db/schema/userprofiles.js';
import { kitEncryptionService } from './KitEncryptionService.js';
import { agentReach, findInAgentReach, type ReachedProject } from '~/server/lib/agentReach.js'; // [SCOPE 152 / T006]
import { recordAgentAudit, type VerifiedDevice } from './AgentDeviceTokenService.js'; // [SCOPE 152 / T006]
import { companyYappchattService, CompanyYappchattError } from './CompanyYappchattService.js';
import { projectRemoteAccessService } from './ProjectRemoteAccessService.js';
import { logger } from '~/server/lib/logger.js';

// [SCOPE 152 / T006] BEGIN — K.A.I.N.'s agent name
/** The supervising agent K.A.I.N. signs in as; tags `[KAIN]` and binds `KAIN:<hash>` (SPEC-152). */
export const KAIN_AGENT_NAME = 'KAIN';
// [SCOPE 152 / T006] END

// [SCOPE 134 / T028] BEGIN — AgentConnectService
// MODIFIED-BY: [SCOPE 144 / T008] — rooms only under the company account; room before MCP token; error extra fields
/**
 * `mcpapitokens.name` prefix for grant-minted tokens. The MCP middleware keys its
 * per-call grant re-check off this exact prefix — change both or neither.
 */
export const AGENT_GRANT_TOKEN_PREFIX = 'agent-grant:';

/** Token name prefix and audit identity of the kit's per-project agent (Amendment A). */
export const PROJECT_AGENT_TOKEN_PREFIX = 'project-agent:';
export const PROJECT_AGENT_NAME = 'PROJECT-AGENT';

/** Project MCP tokens minted here expire; reconnecting mints a fresh one. */
const MCP_TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

export class AgentConnectError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
    /** Extra response fields, e.g. `{ contactEmail }` on 409 no_company_account. */
    readonly extra: Record<string, string | null> = {},
  ) {
    super(message);
    this.name = 'AgentConnectError';
  }
}

export interface AgentConnectResult {
  projectId: string;
  projectName: string;
  agentName: string;
  mcp: { token: string; expiresAt: string };
  room: {
    conversationId: string;
    /** Present ONLY when minted on this call. The agent keeps it; it is never stored here. */
    agentToken?: string;
    minted: boolean;
    /**
     * The operator whose YappChatt identity owns the room (OQ-5). The bridge's READ
     * session is minted for this email — the agent token can post but cannot read.
     */
    operatorEmail: string;
    /** SCOPE-144: the company YappChatt account that owns the room (FR-005). */
    ownerYappchattId?: string;
    /** SCOPE-144: the old room retired and replaced on this call (FR-007). */
    replacedConversationId?: string;
  };
}

export class AgentConnectService {
  // MODIFIED-BY: [SCOPE 152 / T006] — reach from agentReach; connect acts as the signed-in person, per device
  /** Every Project in the signed-in person's reach: own company first, then each client (FR-067). */
  async grants(device: VerifiedDevice): Promise<ReachedProject[]> {
    return agentReach(device.userId);
  }

  async connect(
    device: VerifiedDevice,
    projectId: string,
    opts: { mintAgentToken?: boolean } = {},
  ): Promise<AgentConnectResult> {
    const agentName = KAIN_AGENT_NAME;

    // Not in reach and not found are one answer: telling them apart would let a device
    // probe which project ids exist. A refusal mints, revokes and creates nothing (FR-070).
    const reached = await findInAgentReach(device.userId, projectId);
    if (!reached) {
      throw new AgentConnectError('not_granted', 404, `${agentName} has not been granted this project.`);
    }

    // The signed-in person is the operator (OQ-5): the room is joined, and tokens minted, as them.
    const [operator] = await db
      .select({ email: userprofiles.emailaddr })
      .from(userprofiles)
      .where(eq(userprofiles.id, device.userId))
      .limit(1);
    if (!operator?.email) {
      throw new AgentConnectError('no_operator', 409, 'The signed-in user has no email on file.');
    }

    // The room first (SCOPE-144): a refusal such as no_company_account then leaves no
    // MCP token minted and no prior one revoked. The room belongs to the Project's company.
    const room = await this.resolveRoom(projectId, reached.projectName, agentName, operator.email, {
      mintAgentToken: opts.mintAgentToken,
      companyId: reached.companyId,
      actorUserId: device.userId,
    });
    // The token's company is the Project's (SPEC-152 research OQ-1), its issuer the person, and
    // its name carries the device — so reconnecting revokes only this device's token here (FR-068).
    const mcp = await this.mintProjectToken({
      companyid: reached.companyId,
      projectId,
      issuedbyid: device.userId,
      name: `${AGENT_GRANT_TOKEN_PREFIX}${agentName}:${device.deviceId}`,
      bindAs: agentName,
    });

    await recordAgentAudit({
      companyid: reached.companyId,
      action: 'agent.connect',
      changedby: device.userId,
      newvalue: { projectId, deviceId: device.deviceId, deviceName: device.deviceName, via: reached.via },
      description: `K.A.I.N. connected to "${reached.projectName}" from device "${device.deviceName}" (${reached.via}).`,
    });

    return { projectId, projectName: reached.projectName, agentName, mcp, room };
  }

  // [SCOPE 134 / T029] BEGIN — the project agent's room (SCOPE-132 Amendment A, FR-031)
  // MODIFIED-BY: [SCOPE 144 / T008] — createCompanyAccount; the room is the company account's
  // MODIFIED-BY: [SCOPE 145 / T003] — 403 remote_not_allowed before any room or token work
  /**
   * The room a project's kit agent joins to be supervised by `supervisor` (KAIN).
   *
   * Authenticated by the project's own kit API token, so no company ticket ever sits in a
   * project repo. The project comes from the token row, never the request (FR-013), and
   * the room is the SAME `(project, supervisor)` room KAIN's connect resolves — created
   * here if the project agent arrives first.
   */
  async projectAgentRoom(
    token: { projectid: string; customerid: string; issuedbyid: string; name: string; expiresat: Date | null },
    supervisor: string,
    opts: { mintAgentToken?: boolean; createCompanyAccount?: boolean } = {},
  ): Promise<{
    projectId: string;
    projectName: string;
    supervisor: string;
    agentName: string;
    mcp: { token: string; expiresAt: string };
    room: AgentConnectResult['room'];
  }> {
    if (token.expiresat && token.expiresat.getTime() <= Date.now()) {
      throw new AgentConnectError('token_expired', 401, 'This project token has expired.');
    }
    // A supervisor's grant-minted token is not a project agent's credential. Letting it
    // through would let KAIN mint a second identity in the room and answer as both.
    if (token.name.startsWith(AGENT_GRANT_TOKEN_PREFIX) || token.name.startsWith(PROJECT_AGENT_TOKEN_PREFIX)) {
      throw new AgentConnectError('wrong_token', 403, 'Use the project kit token, not a supervising agent token.');
    }

    const [project] = await db
      .select({ name: companyprojects.name, companyid: companyprojects.companyid, allowremote: companyprojects.allowremote })
      .from(companyprojects)
      .where(eq(companyprojects.id, token.projectid))
      .limit(1);
    if (!project) throw new AgentConnectError('no_project', 404, 'The project for this token no longer exists.');

    // SPEC-145 FR-003: the project must allow remote. Checked before any YappChatt call, room
    // change or token mint, so a refused start creates, retires and mints nothing.
    if (!project.allowremote) {
      await projectRemoteAccessService.recordRefused(
        { id: token.projectid, name: project.name, companyid: project.companyid ?? token.customerid, allowremote: false },
        token.issuedbyid,
      );
      throw new AgentConnectError(
        'remote_not_allowed',
        403,
        `Remote is not allowed on project "${project.name}". A company ADMIN or the project's TEAM_MANAGER can turn on Allow remote in the project's Kit tab.`,
      );
    }

    const [operator] = await db
      .select({ email: userprofiles.emailaddr })
      .from(userprofiles)
      .where(eq(userprofiles.id, token.issuedbyid))
      .limit(1);
    if (!operator?.email) {
      throw new AgentConnectError('no_operator', 409, 'The user who issued this project token has no email on file.');
    }

    const room = await this.resolveRoom(token.projectid, project.name, supervisor, operator.email, {
      mintAgentToken: opts.mintAgentToken,
      createCompanyAccount: opts.createCompanyAccount,
      companyId: project.companyid ?? token.customerid,
      actorUserId: token.issuedbyid,
    });

    // Its own bound, short-lived MCP token, so the gate's decisions can be filed through
    // record_override (which accepts only bound tokens). Binding the shared kit token
    // instead would change the identity the Cockpit and the kit also use.
    const mcp = await this.mintProjectToken({
      companyid: token.customerid,
      projectId: token.projectid,
      issuedbyid: token.issuedbyid,
      name: `${PROJECT_AGENT_TOKEN_PREFIX}${supervisor}`,
      bindAs: PROJECT_AGENT_NAME,
    });
    return { projectId: token.projectid, projectName: project.name, supervisor, agentName: PROJECT_AGENT_NAME, mcp, room };
  }
  // [SCOPE 134 / T029] END

  /**
   * One live grant-minted token per agent per project: prior ones are revoked, so
   * reconnecting never accumulates credentials.
   */
  private async mintProjectToken(args: {
    companyid: string;
    projectId: string;
    issuedbyid: string;
    /** Token name; prior live tokens with this name on the project are revoked. */
    name: string;
    /** The `NAME` half of clientbinding — what record_override checks agentName against. */
    bindAs: string;
  }): Promise<{ token: string; expiresAt: string }> {
    const { companyid, projectId, issuedbyid: grantedbyid, name, bindAs } = args;
    const token = kitEncryptionService.generateApiToken();
    const tokenhash = kitEncryptionService.hashToken(token);
    const expiresat = new Date(Date.now() + MCP_TOKEN_TTL_MS);

    await db.transaction(async (tx) => {
      await tx
        .update(mcpapitokens)
        .set({ revokedat: new Date(), revokedbyid: grantedbyid })
        .where(
          and(
            eq(mcpapitokens.projectid, projectId),
            eq(mcpapitokens.name, name),
            isNull(mcpapitokens.revokedat),
          ),
        );
      await tx.insert(mcpapitokens).values({
        customerid: companyid,
        projectid: projectId,
        tokenhash,
        tokenprefix: token.substring(0, 12),
        name,
        // The acting user is the human who granted access, so feedback and audit rows
        // attribute to a person rather than to nobody.
        issuedbyid: grantedbyid,
        expiresat,
        // SCOPE-133's binding format, which is what record_override verifies.
        clientbinding: `${bindAs}:${tokenhash}`,
      });
    });

    logger.info({ projectId, name }, 'agent project token minted');
    return { token, expiresAt: expiresat.toISOString() };
  }

  /**
   * The room for (project, agent). Created on first connect, from the grant-resolved
   * projectId — never from anything the client sent (FR-013).
   */
  private async resolveRoom(
    projectId: string,
    projectName: string,
    agentName: string,
    operatorEmail: string,
    opts: { mintAgentToken?: boolean; createCompanyAccount?: boolean; companyId: string; actorUserId: string | null },
  ): Promise<AgentConnectResult['room']> {
    // SCOPE-144 / T008: every room is created and owned by the company YappChatt account
    // (FR-005); no account → 409 no_company_account (FR-006); a room with another or no
    // recorded owner is retired and replaced (FR-007). The rules live in
    // CompanyYappchattService so both connect paths share them.
    try {
      return await companyYappchattService.ensureCompanyRoom({
        companyId: opts.companyId,
        projectId,
        projectName,
        agentName,
        operatorEmail,
        actorUserId: opts.actorUserId,
        mintAgentToken: opts.mintAgentToken,
        createCompanyAccount: opts.createCompanyAccount,
      });
    } catch (err) {
      if (err instanceof CompanyYappchattError) {
        throw new AgentConnectError(err.code, err.status, err.message, err.extra);
      }
      throw err;
    }
  }
}
// [SCOPE 134 / T028] END

export const agentConnectService = new AgentConnectService();
