/**
 * "Allow remote" per project — SPEC-145 (SCOPE-132 Amendment B), FR-002 – FR-004.
 *
 * One rule set, shared by the three routes that use it: whether a project allows its project
 * agent (the remote) to start, who may change that, the audited change itself, and the audit row
 * for a refused start. The server decides; the Cockpit only reads the answer (SOC 2 CC6.1).
 */
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '~/db/client.js';
import { companyprojects } from '~/db/schema/companyproject.js';
import { companyauditlogs } from '~/db/schema/companyauditlog.js';
import { projectusers } from '~/db/schema/projectuser.js';
import { logger } from '~/server/lib/logger.js';
import type { AutopilotAuditAction } from './ProjectAutopilotService.js'; // [SCOPE 154 / T002]

// [SCOPE 145 / T002] BEGIN — remote access types and audit actions (FR-002, FR-003)
// MODIFIED-BY: [SCOPE 154 / T002] — project carries autopilotenabled; audit may record the Autopilot cascade (FR-001)
/** The `companyauditlogs.action` values this feature writes (SOC 2 CC7.2). */
export type RemoteAccessAuditAction = 'project.remote.allowed' | 'project.remote.disallowed' | 'project.remote.refused';

export interface RemoteAccessProject {
  id: string;
  name: string;
  companyid: string | null;
  allowremote: boolean;
  /** SPEC-154: read so turning remote off can audit the Autopilot cascade it causes. */
  autopilotenabled?: boolean;
}

export interface RemoteAccessActor {
  userid: string;
  usertype: string | undefined;
}

export interface RemoteAccessAuditEntry {
  companyid: string;
  action: RemoteAccessAuditAction | AutopilotAuditAction;
  changedby: string | null;
  previousvalue: Record<string, unknown> | null;
  newvalue: Record<string, unknown>;
  description: string;
}

export interface RemoteAccessStore {
  project(projectId: string): Promise<RemoteAccessProject | null>;
  setAllowRemote(projectId: string, allow: boolean): Promise<void>;
  /** A current (not removed) projectusers row for this user on this project. */
  isCurrentProjectMember(projectId: string, userid: string): Promise<boolean>;
  audit(entry: RemoteAccessAuditEntry): Promise<void>;
}
// [SCOPE 145 / T002] END

// [SCOPE 145 / T002] BEGIN — ProjectRemoteAccessService
// MODIFIED-BY: [SCOPE 154 / T002] — setAllowRemote audits the Autopilot cascade when remote goes off (FR-001)
export class ProjectRemoteAccessService {
  constructor(private readonly store: RemoteAccessStore) {}

  /** The project and its setting, or null when the project does not exist. */
  async project(projectId: string): Promise<RemoteAccessProject | null> {
    return this.store.project(projectId);
  }

  /**
   * May this user change "Allow remote" on this project: a company ADMIN, or a TEAM_MANAGER
   * with a current projectusers row on it (the SPEC-144 Room Approver rule). The caller has
   * already confirmed the project belongs to the user's company (SOC 2 CC6.3).
   */
  async canManage(projectId: string, actor: RemoteAccessActor): Promise<boolean> {
    if (actor.usertype === 'ADMIN') return true;
    if (actor.usertype !== 'TEAM_MANAGER') return false;
    return this.store.isCurrentProjectMember(projectId, actor.userid);
  }

  /**
   * Set the project's "Allow remote". A change writes one audit row naming the actor and the
   * old and new value; sending the current value again changes and records nothing.
   */
  async setAllowRemote(
    project: RemoteAccessProject,
    allow: boolean,
    actorUserId: string,
  ): Promise<{ allowRemote: boolean; changed: boolean }> {
    // Taken before the write, so the audit row's old value can never be read back as the new one.
    const previous = project.allowremote;
    if (previous === allow) return { allowRemote: allow, changed: false };
    await this.store.setAllowRemote(project.id, allow);
    await this.audit({
      companyid: project.companyid,
      action: allow ? 'project.remote.allowed' : 'project.remote.disallowed',
      changedby: actorUserId,
      previousvalue: { allowremote: previous },
      newvalue: { projectid: project.id, allowremote: allow },
      description: `Remote ${allow ? 'allowed' : 'disallowed'} on project "${project.name}".`,
    });
    // [SCOPE 154 / T002] FR-001: the store's write turned Autopilot off with remote; that is an
    // Autopilot change too, so it gets its own row in the same shape ProjectAutopilotService writes.
    if (!allow && project.autopilotenabled) {
      await this.audit({
        companyid: project.companyid,
        action: 'project.autopilot.disabled',
        changedby: actorUserId,
        previousvalue: { autopilotenabled: true },
        newvalue: { projectid: project.id, autopilotenabled: false },
        description: `Autopilot disabled on project "${project.name}" because remote was disallowed.`,
      });
    }
    return { allowRemote: allow, changed: true };
  }

  /** One audit row for a project-agent start the setting refused (FR-003). */
  async recordRefused(project: RemoteAccessProject, actorUserId: string | null): Promise<void> {
    await this.audit({
      companyid: project.companyid,
      action: 'project.remote.refused',
      changedby: actorUserId,
      previousvalue: null,
      newvalue: { projectid: project.id },
      description: `Project agent start refused: remote is not allowed on project "${project.name}".`,
    });
  }

  /** An audit write failure is logged, never thrown. A project with no company is not audited. */
  private async audit(entry: Omit<RemoteAccessAuditEntry, 'companyid'> & { companyid: string | null }): Promise<void> {
    const { companyid } = entry;
    if (!companyid) {
      logger.warn({ action: entry.action }, 'remote access audit skipped: project has no company');
      return;
    }
    try {
      await this.store.audit({ ...entry, companyid });
    } catch (err) {
      logger.error({ err, action: entry.action }, 'remote access audit write failed');
    }
  }
}
// [SCOPE 145 / T002] END

// [SCOPE 145 / T002] BEGIN — drizzle remote access store
// MODIFIED-BY: [SCOPE 154 / T002] — project() also reads autopilotenabled for the cascade audit (FR-001)
export const drizzleRemoteAccessStore: RemoteAccessStore = {
  async project(projectId) {
    const [row] = await db
      .select({
        id: companyprojects.id,
        name: companyprojects.name,
        companyid: companyprojects.companyid,
        allowremote: companyprojects.allowremote,
        autopilotenabled: companyprojects.autopilotenabled, // [SCOPE 154 / T002]
      })
      .from(companyprojects)
      .where(eq(companyprojects.id, projectId))
      .limit(1);
    return row ?? null;
  },

  async setAllowRemote(projectId, allow) {
    // [SCOPE 154 / T002] BEGIN — cascade (FR-001): turning remote off also turns Autopilot off
    const values: { allowremote: boolean; updatedat: Date; autopilotenabled?: boolean } = {
      allowremote: allow,
      updatedat: new Date(),
    };
    if (!allow) values.autopilotenabled = false;
    // [SCOPE 154 / T002] END
    await db
      .update(companyprojects)
      .set(values)
      .where(eq(companyprojects.id, projectId));
  },

  async isCurrentProjectMember(projectId, userid) {
    const [row] = await db
      .select({ id: projectusers.id })
      .from(projectusers)
      .where(and(eq(projectusers.projectid, projectId), eq(projectusers.userid, userid), isNull(projectusers.removedat)))
      .limit(1);
    return Boolean(row);
  },

  async audit(entry) {
    await db.insert(companyauditlogs).values({
      companyid: entry.companyid,
      action: entry.action,
      changedby: entry.changedby,
      previousvalue: entry.previousvalue,
      newvalue: entry.newvalue,
      description: entry.description,
    });
  },
};

export const projectRemoteAccessService = new ProjectRemoteAccessService(drizzleRemoteAccessStore);
// [SCOPE 145 / T002] END
