/**
 * Project agent grants — grant, revoke, list, and the check that runs on every call.
 * SCOPE-134 / T027.
 */
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '~/db/client.js';
import { projectagentgrants, type ProjectAgentGrant } from '~/db/schema/projectagentgrant.js';
import { companyprojects } from '~/db/schema/companyproject.js';
import { logger } from '~/server/lib/logger.js';

export interface GrantedProject {
  projectid: string;
  name: string;
  grantedat: Date;
}

// [SCOPE 134 / T027] BEGIN — ProjectAgentGrantService
export class ProjectAgentGrantService {
  /**
   * Grant an agent access to one project. Idempotent: re-granting something already
   * live returns the existing row rather than creating a second, so a double-click on a
   * checkbox cannot produce two grants that then need two revokes.
   */
  async grant(projectid: string, agentname: string, grantedbyid: string): Promise<ProjectAgentGrant> {
    const [existing] = await db
      .select()
      .from(projectagentgrants)
      .where(
        and(
          eq(projectagentgrants.projectid, projectid),
          eq(projectagentgrants.agentname, agentname),
          isNull(projectagentgrants.revokedat),
        ),
      )
      .limit(1);
    if (existing) return existing;

    const [row] = await db
      .insert(projectagentgrants)
      .values({ projectid, agentname, grantedbyid })
      .returning();

    logger.info({ projectid, agentname, grantedbyid }, 'agent granted project access');
    return row;
  }

  /** Withdraw access. Takes effect on the agent's very next call — see `isGranted`. */
  async revoke(projectid: string, agentname: string, revokedbyid: string): Promise<boolean> {
    const rows = await db
      .update(projectagentgrants)
      .set({ revokedat: new Date(), revokedbyid })
      .where(
        and(
          eq(projectagentgrants.projectid, projectid),
          eq(projectagentgrants.agentname, agentname),
          isNull(projectagentgrants.revokedat),
        ),
      )
      .returning({ id: projectagentgrants.id });

    if (rows.length) logger.info({ projectid, agentname, revokedbyid }, 'agent project access revoked');
    return rows.length > 0;
  }

  /** Live agent names for one project — what the checkbox list renders from. */
  async listForProject(projectid: string): Promise<string[]> {
    const rows = await db
      .select({ agentname: projectagentgrants.agentname })
      .from(projectagentgrants)
      .where(and(eq(projectagentgrants.projectid, projectid), isNull(projectagentgrants.revokedat)));
    return rows.map((r) => r.agentname);
  }

  /**
   * Every project one agent may reach, within one company. This is what an agent polls
   * at connect to discover newly ticked projects.
   *
   * Joined against `companyprojects` and filtered by company rather than trusting the
   * grant rows alone: a grant names a project, and a project belongs to a company.
   * Reading grants without that join would let a grant written for another company's
   * project leak a name into this company's answer.
   */
  async listForAgent(companyid: string, agentname: string): Promise<GrantedProject[]> {
    return db
      .select({
        projectid: projectagentgrants.projectid,
        name: companyprojects.name,
        grantedat: projectagentgrants.grantedat,
      })
      .from(projectagentgrants)
      .innerJoin(companyprojects, eq(companyprojects.id, projectagentgrants.projectid))
      .where(
        and(
          eq(projectagentgrants.agentname, agentname),
          eq(companyprojects.companyid, companyid),
          isNull(projectagentgrants.revokedat),
        ),
      );
  }

  /**
   * The hot-path check: may this agent act on this project RIGHT NOW.
   *
   * Deliberately a fresh read every time rather than anything cached. The design promise
   * is that unticking the box stops an agent already working — a cache, however short,
   * turns that promise into "stops it eventually", which is a different and weaker thing.
   */
  async isGranted(companyid: string, agentname: string, projectid: string): Promise<boolean> {
    const rows = await db
      .select({ id: projectagentgrants.id })
      .from(projectagentgrants)
      .innerJoin(companyprojects, eq(companyprojects.id, projectagentgrants.projectid))
      .where(
        and(
          eq(projectagentgrants.projectid, projectid),
          eq(projectagentgrants.agentname, agentname),
          eq(companyprojects.companyid, companyid),
          isNull(projectagentgrants.revokedat),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }

  /** Filter a set of project ids down to the granted ones, in one query. */
  async filterGranted(
    companyid: string,
    agentname: string,
    projectids: string[],
  ): Promise<Set<string>> {
    if (!projectids.length) return new Set();
    const rows = await db
      .select({ projectid: projectagentgrants.projectid })
      .from(projectagentgrants)
      .innerJoin(companyprojects, eq(companyprojects.id, projectagentgrants.projectid))
      .where(
        and(
          inArray(projectagentgrants.projectid, projectids),
          eq(projectagentgrants.agentname, agentname),
          eq(companyprojects.companyid, companyid),
          isNull(projectagentgrants.revokedat),
        ),
      );
    return new Set(rows.map((r) => r.projectid));
  }
}
// [SCOPE 134 / T027] END

export const projectAgentGrantService = new ProjectAgentGrantService();
