/**
 * Autopilot switch per project — SPEC-154 (SCOPE-132 Amendment H), FR-001.
 *
 * Lets a project's agent work the dev plan unattended. Gated on "Allow remote": refused while
 * remote is off, and turning remote off cascades this off too (enforced in
 * ProjectRemoteAccessService.setAllowRemote, not here, since that is the single place remote is
 * turned off). Reuses ProjectRemoteAccessService's canManage rule and the same companyauditlogs
 * table (SOC 2 CC6.1, CC7.2) — one rule set for who may change either switch.
 */
import { eq } from 'drizzle-orm';
import { db } from '~/db/client.js';
import { companyprojects } from '~/db/schema/companyproject.js';
import { companyauditlogs } from '~/db/schema/companyauditlog.js';
import { logger } from '~/server/lib/logger.js';
import { projectRemoteAccessService, type RemoteAccessActor } from './ProjectRemoteAccessService.js';
import { AUTOPILOT_RELEASE_GATE_OPEN } from './AutopilotReleaseGate.js'; // [SCOPE 154 / T012]

// [SCOPE 154 / T002] BEGIN — autopilot types and audit actions (FR-001)
/** The `companyauditlogs.action` values this feature writes (SOC 2 CC7.2). */
export type AutopilotAuditAction = 'project.autopilot.enabled' | 'project.autopilot.disabled';

export interface AutopilotProject {
  id: string;
  name: string;
  companyid: string | null;
  allowremote: boolean;
  autopilotenabled: boolean;
}

export interface AutopilotStore {
  project(projectId: string): Promise<AutopilotProject | null>;
  setAutopilotEnabled(projectId: string, enabled: boolean): Promise<void>;
  audit(entry: {
    companyid: string;
    action: AutopilotAuditAction;
    changedby: string | null;
    previousvalue: Record<string, unknown> | null;
    newvalue: Record<string, unknown>;
    description: string;
  }): Promise<void>;
}
// [SCOPE 154 / T002] END

// [SCOPE 154 / T002] BEGIN — ProjectAutopilotService
export class ProjectAutopilotService {
  constructor(private readonly store: AutopilotStore) {}

  /** The project and both switches, or null when the project does not exist. */
  async project(projectId: string): Promise<AutopilotProject | null> {
    return this.store.project(projectId);
  }

  /** Same rule as "Allow remote": a company ADMIN, or this project's TEAM_MANAGER member. */
  async canManage(projectId: string, actor: RemoteAccessActor): Promise<boolean> {
    return projectRemoteAccessService.canManage(projectId, actor);
  }

  /**
   * Turn Autopilot on or off. Refused with `remote_not_allowed` when turning it on while
   * "Allow remote" is off (FR-001) — the caller turns remote on first. Sending the current
   * value again changes and records nothing.
   */
  async setAutopilotEnabled(
    project: AutopilotProject,
    enabled: boolean,
    actorUserId: string,
  ): Promise<
    | { autopilotEnabled: boolean; changed: boolean }
    | { error: 'remote_not_allowed' }
    | { error: 'release_gate_closed' }
  > {
    // [SCOPE 154 / T012] FR-012: fails closed — checked before "Allow remote" so a closed gate is
    // never shadowed by a different refusal reason.
    if (enabled && !AUTOPILOT_RELEASE_GATE_OPEN) {
      return { error: 'release_gate_closed' };
    }
    if (enabled && !project.allowremote) {
      return { error: 'remote_not_allowed' };
    }
    const previous = project.autopilotenabled;
    if (previous === enabled) return { autopilotEnabled: enabled, changed: false };
    await this.store.setAutopilotEnabled(project.id, enabled);
    await this.audit({
      companyid: project.companyid,
      action: enabled ? 'project.autopilot.enabled' : 'project.autopilot.disabled',
      changedby: actorUserId,
      previousvalue: { autopilotenabled: previous },
      newvalue: { projectid: project.id, autopilotenabled: enabled },
      description: `Autopilot ${enabled ? 'enabled' : 'disabled'} on project "${project.name}".`,
    });
    return { autopilotEnabled: enabled, changed: true };
  }

  /** An audit write failure is logged, never thrown. A project with no company is not audited. */
  private async audit(entry: {
    companyid: string | null;
    action: AutopilotAuditAction;
    changedby: string | null;
    previousvalue: Record<string, unknown> | null;
    newvalue: Record<string, unknown>;
    description: string;
  }): Promise<void> {
    const { companyid } = entry;
    if (!companyid) {
      logger.warn({ action: entry.action }, 'autopilot audit skipped: project has no company');
      return;
    }
    try {
      await this.store.audit({ ...entry, companyid });
    } catch (err) {
      logger.error({ err, action: entry.action }, 'autopilot audit write failed');
    }
  }
}
// [SCOPE 154 / T002] END

// [SCOPE 154 / T002] BEGIN — drizzle autopilot store
export const drizzleAutopilotStore: AutopilotStore = {
  async project(projectId) {
    const [row] = await db
      .select({
        id: companyprojects.id,
        name: companyprojects.name,
        companyid: companyprojects.companyid,
        allowremote: companyprojects.allowremote,
        autopilotenabled: companyprojects.autopilotenabled,
      })
      .from(companyprojects)
      .where(eq(companyprojects.id, projectId))
      .limit(1);
    return row ?? null;
  },

  async setAutopilotEnabled(projectId, enabled) {
    await db
      .update(companyprojects)
      .set({ autopilotenabled: enabled, updatedat: new Date() })
      .where(eq(companyprojects.id, projectId));
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

export const projectAutopilotService = new ProjectAutopilotService(drizzleAutopilotStore);
// [SCOPE 154 / T002] END
