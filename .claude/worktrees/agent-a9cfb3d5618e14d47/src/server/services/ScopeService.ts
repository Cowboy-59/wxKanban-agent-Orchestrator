import { db } from '~/db/client.js';
import { generateOnce, parseJsonLoose } from '~/server/ai/llm-provider.js';
import { projectspecifications } from '~/db/schema/projectspecification.js';
import { projecttasks } from '~/db/schema/projecttask.js';
import { userprofiles } from '~/db/schema/userprofiles.js';
import { companyauditlogs } from '~/db/schema/companyauditlog.js';
import { scopeconversations } from '~/db/schema/scopeconversation.js';
import { projectdocuments } from '~/db/schema/projectdocuments.js';
import { companyprojects } from '~/db/schema/companyproject.js';
import { eq, and, sql, asc, desc, count, max, inArray } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { createLogger } from '~/server/lib/logger.js';
import type { ScopeStatus, ProjectScope, ScopeConflict, ScopeMatrixRow, PanelDocument } from '~/shared/types/projects.js';


const logger = createLogger('scope-service');

const PHASE_ORDER = ['Design', 'Implementation', 'QA', 'HumanTesting', 'Beta', 'Release'] as const;

// Scope status thresholds for matrix cell derivation
const PHASE_STATUS_THRESHOLD: Record<string, ScopeStatus[]> = {
  Design: ['clarified', 'planned', 'tasks_generated', 'implemented', 'qa_passed', 'human_tested', 'beta_cleared', 'released'],
  Implementation: ['implemented', 'qa_passed', 'human_tested', 'beta_cleared', 'released'],
  QA: ['qa_passed', 'human_tested', 'beta_cleared', 'released'],
  HumanTesting: ['human_tested', 'beta_cleared', 'released'],
  Beta: ['beta_cleared', 'released'],
  Release: ['released'],
};

const PHASE_ACTIVE_STATUSES: Record<string, ScopeStatus[]> = {
  Design: ['in_review', 'pending_clarification'],
  Implementation: ['tasks_generated'],
  QA: ['implemented'],
  HumanTesting: ['qa_passed'],
  Beta: ['human_tested'],
  Release: ['beta_cleared'],
};

export class ScopeService {
  static async getScopes(
    projectid: string,
    opts: { includeArchived?: boolean } = {}
  ): Promise<ProjectScope[]> {
    // [SCOPE 103 / T004] Archived scopes are hidden from working surfaces by default; the
    // restore listing passes includeArchived:true to see them.
    const scopeFilter = opts.includeArchived
      ? eq(projectspecifications.projectid, projectid)
      : and(
          eq(projectspecifications.projectid, projectid),
          sql`${projectspecifications.status} <> 'archived'`
        );
    // [SCOPE 058 / T031] Second userprofiles join for the checkout holder (the first is the author).
    const claimers = alias(userprofiles, 'claimers');
    const rows = await db
      .select({
        id: projectspecifications.id,
        projectid: projectspecifications.projectid,
        specnumber: projectspecifications.specnumber,
        title: projectspecifications.title,
        content: projectspecifications.content,
        status: projectspecifications.status,
        specorder: projectspecifications.specorder,
        isoptional: projectspecifications.isoptional,
        createdbyid: projectspecifications.createdbyid,
        createdat: projectspecifications.createdat,
        approvedat: projectspecifications.approvedat,
        updatedat: projectspecifications.updatedat,
        createdbyname: userprofiles.fullname,
        claimedbyid: projectspecifications.claimedbyid,
        claimedat: projectspecifications.claimedat,
        claimedbyname: claimers.fullname,
      })
      .from(projectspecifications)
      .leftJoin(userprofiles, eq(projectspecifications.createdbyid, userprofiles.id))
      .leftJoin(claimers, eq(projectspecifications.claimedbyid, claimers.id))
      .where(scopeFilter)
      .orderBy(asc(projectspecifications.specorder), asc(projectspecifications.specnumber));

    const scopeids = rows.map((r) => r.id);
    if (scopeids.length === 0) return [];

    // Get full task count breakdown per scope
    const taskCounts = await db
      .select({
        specid: projecttasks.specid,
        total: count(),
        completed: sql<number>`COUNT(*) FILTER (WHERE ${projecttasks.status} IN ('completed','done'))`,
        open: sql<number>`COUNT(*) FILTER (WHERE ${projecttasks.status} IN ('open','todo'))`,
        in_progress: sql<number>`COUNT(*) FILTER (WHERE ${projecttasks.status} = 'in_progress')`,
        orphaned: sql<number>`COUNT(*) FILTER (WHERE ${projecttasks.status} = 'orphaned')`,
      })
      .from(projecttasks)
      .where(and(eq(projecttasks.projectid, projectid)))
      .groupBy(projecttasks.specid);

    const countMap = new Map<string, { total: number; completed: number; open: number; in_progress: number; orphaned: number }>();
    for (const tc of taskCounts) {
      if (tc.specid) {
        countMap.set(tc.specid, {
          total: Number(tc.total),
          completed: Number(tc.completed),
          open: Number(tc.open),
          in_progress: Number(tc.in_progress),
          orphaned: Number(tc.orphaned),
        });
      }
    }

    // Fetch documents for all scopes

    const scopeIds = rows.map((r) => r.id);
    let documentsMap = new Map<string, PanelDocument[]>();
    
    if (scopeIds.length > 0) {
      const docs = await db
        .select({
          id: projectdocuments.id,
          specid: projectdocuments.specid,
          doctype: projectdocuments.doctype,
          title: projectdocuments.title,
          filepath: projectdocuments.filepath,
        })
        .from(projectdocuments)
        .where(inArray(projectdocuments.specid, scopeIds));

      for (const doc of docs) {
        if (doc.specid) {
          const existing = documentsMap.get(doc.specid) ?? [];
          existing.push({
            id: doc.id,
            doctype: doc.doctype,
            title: doc.title,
            filepath: doc.filepath,
            content: '', // Don't fetch content for list view
          });
          documentsMap.set(doc.specid, existing);
        }
      }
    }

    return rows.map((r) => ({
      id: r.id,
      projectid: r.projectid,
      specnumber: r.specnumber,
      title: r.title,
      content: r.content,
      status: r.status as ScopeStatus,
      specorder: r.specorder,
      isoptional: r.isoptional,
      createdbyid: r.createdbyid ?? null,
      createdat: r.createdat.toISOString(),
      approvedat: r.approvedat?.toISOString() ?? null,
      updatedat: r.updatedat.toISOString(),
      createdbyname: r.createdbyname ?? null,
      claimedbyid: r.claimedbyid ?? null,
      claimedbyname: r.claimedbyname ?? null,
      claimedat: r.claimedat?.toISOString() ?? null,
      taskcount: countMap.get(r.id)?.total ?? 0,
      completedtaskcount: countMap.get(r.id)?.completed ?? 0,
      opencount: countMap.get(r.id)?.open ?? 0,
      inprogresscount: countMap.get(r.id)?.in_progress ?? 0,
      orphanedcount: countMap.get(r.id)?.orphaned ?? 0,
      documents: documentsMap.get(r.id) ?? [],
    }));
  }


  static async getScope(scopeid: string): Promise<ProjectScope | null> {
    // [SCOPE 058 / T031] Second userprofiles join for the checkout holder (the first is the author).
    const claimers = alias(userprofiles, 'claimers');
    const rows = await db
      .select({
        id: projectspecifications.id,
        projectid: projectspecifications.projectid,
        specnumber: projectspecifications.specnumber,
        title: projectspecifications.title,
        content: projectspecifications.content,
        status: projectspecifications.status,
        specorder: projectspecifications.specorder,
        isoptional: projectspecifications.isoptional,
        createdbyid: projectspecifications.createdbyid,
        createdat: projectspecifications.createdat,
        approvedat: projectspecifications.approvedat,
        updatedat: projectspecifications.updatedat,
        createdbyname: userprofiles.fullname,
        claimedbyid: projectspecifications.claimedbyid,
        claimedat: projectspecifications.claimedat,
        claimedbyname: claimers.fullname,
      })
      .from(projectspecifications)
      .leftJoin(userprofiles, eq(projectspecifications.createdbyid, userprofiles.id))
      .leftJoin(claimers, eq(projectspecifications.claimedbyid, claimers.id))
      .where(eq(projectspecifications.id, scopeid));

    const r = rows[0];
    if (!r) return null;

    const [taskCount] = await db
      .select({
        total: count(),
        completed: sql<number>`COUNT(*) FILTER (WHERE ${projecttasks.status} IN ('completed','done'))`,
        open: sql<number>`COUNT(*) FILTER (WHERE ${projecttasks.status} IN ('open','todo'))`,
        in_progress: sql<number>`COUNT(*) FILTER (WHERE ${projecttasks.status} = 'in_progress')`,
        orphaned: sql<number>`COUNT(*) FILTER (WHERE ${projecttasks.status} = 'orphaned')`,
      })
      .from(projecttasks)
      .where(eq(projecttasks.specid, scopeid));

    // Fetch documents for this scope
    const docs = await db
      .select({
        id: projectdocuments.id,
        doctype: projectdocuments.doctype,
        title: projectdocuments.title,
        filepath: projectdocuments.filepath,
      })
      .from(projectdocuments)
      .where(eq(projectdocuments.specid, scopeid));

    const documents: PanelDocument[] = docs.map((d) => ({
      id: d.id,
      doctype: d.doctype,
      title: d.title,
      filepath: d.filepath,
      content: '', // Don't fetch content for list view
    }));

    return {
      id: r.id,
      projectid: r.projectid,
      specnumber: r.specnumber,
      title: r.title,
      content: r.content,
      status: r.status as ScopeStatus,
      specorder: r.specorder,
      isoptional: r.isoptional,
      createdbyid: r.createdbyid ?? null,
      createdat: r.createdat.toISOString(),
      approvedat: r.approvedat?.toISOString() ?? null,
      updatedat: r.updatedat.toISOString(),
      createdbyname: r.createdbyname ?? null,
      claimedbyid: r.claimedbyid ?? null,
      claimedbyname: r.claimedbyname ?? null,
      claimedat: r.claimedat?.toISOString() ?? null,
      taskcount: Number(taskCount?.total ?? 0),
      completedtaskcount: Number(taskCount?.completed ?? 0),
      opencount: Number(taskCount?.open ?? 0),
      inprogresscount: Number(taskCount?.in_progress ?? 0),
      orphanedcount: Number(taskCount?.orphaned ?? 0),
      documents,
    };
  }


  static async createScope(
    projectid: string,
    createdbyid: string,
    data: { title: string; content?: string }
  ): Promise<ProjectScope> {
    // Determine next specnumber
    const [maxRow] = await db
      .select({ maxnum: max(projectspecifications.specnumber) })
      .from(projectspecifications)
      .where(eq(projectspecifications.projectid, projectid));

    const nextNum = maxRow?.maxnum
      ? String(Number(maxRow.maxnum) + 1).padStart(3, '0')
      : '001';

    // Determine next specorder
    const [orderRow] = await db
      .select({ maxorder: max(projectspecifications.specorder) })
      .from(projectspecifications)
      .where(eq(projectspecifications.projectid, projectid));

    const nextOrder = (orderRow?.maxorder ?? -1) + 1;

    const [created] = await db
      .insert(projectspecifications)
      .values({
        projectid,
        specnumber: nextNum,
        title: data.title,
        content: data.content ?? '',
        status: 'draft',
        specorder: nextOrder,
        isoptional: false,
        createdbyid,
      })
      .returning();

    logger.info({ projectid, scopeid: created.id, specnumber: nextNum }, 'Scope created');
    return this.getScope(created.id) as Promise<ProjectScope>;
  }

  static async updateScope(
    scopeid: string,
    data: {
      title?: string;
      content?: string;
      specorder?: number;
      isoptional?: boolean;
    },
    companyid: string,
    updatedbyid: string
  ): Promise<ProjectScope> {
    const scope = await this.getScope(scopeid);
    if (!scope) throw new Error('Scope not found');

    const updates: Record<string, unknown> = { updatedat: new Date() };

    if (data.title !== undefined) updates.title = data.title;
    if (data.specorder !== undefined) updates.specorder = data.specorder;
    if (data.isoptional !== undefined) updates.isoptional = data.isoptional;

    if (data.content !== undefined && data.content !== scope.content) {
      updates.content = data.content;
      // Auto-revert to draft if status was in_review or clarified
      if (scope.status === 'in_review' || scope.status === 'clarified') {
        updates.status = 'draft';
        updates.approvedat = null;
        await db.insert(companyauditlogs).values({
          companyid,
          action: 'scope_auto_reverted',
          changedby: updatedbyid,
          newvalue: { scopeid, from: scope.status, to: 'draft', reason: 'content_edited' },
          description: `Scope ${scope.specnumber} auto-reverted to draft after content edit`,
        });
        logger.info({ scopeid, from: scope.status }, 'Scope auto-reverted to draft after content edit');
      }
    }

    await db.update(projectspecifications).set(updates).where(eq(projectspecifications.id, scopeid));
    return this.getScope(scopeid) as Promise<ProjectScope>;
  }

  static async submitScope(
    scopeid: string,
    companyid: string,
    submittedbyid: string,
    override = false
  ): Promise<{ scope: ProjectScope; conflicts: ScopeConflict[]; requiresOverride: boolean }> {
    const scope = await this.getScope(scopeid);
    if (!scope) throw new Error('Scope not found');
    if (scope.status !== 'draft') throw new Error(`Cannot submit scope in status: ${scope.status}`);

    // Run conflict check (fail-open)
    let conflicts: ScopeConflict[] = [];
    try {
      conflicts = await this.checkConflicts(scope);
    } catch (err) {
      logger.warn({ err, scopeid }, 'Conflict check failed — proceeding with fail-open');
    }

    const requiresOverride = conflicts.length > 0 && !override;

    if (requiresOverride) {
      return { scope, conflicts, requiresOverride: true };
    }

    if (override && conflicts.length > 0) {
      await db.insert(companyauditlogs).values({
        companyid,
        action: 'scope_conflict_override',
        changedby: submittedbyid,
        newvalue: { scopeid, conflicts },
        description: `Scope ${scope.specnumber} submitted with conflict override`,
      });
    }

    await db
      .update(projectspecifications)
      .set({ status: 'in_review', updatedat: new Date() })
      .where(eq(projectspecifications.id, scopeid));

    logger.info({ scopeid }, 'Scope submitted for review');
    const updatedScope = await this.getScope(scopeid);
    return { scope: updatedScope!, conflicts, requiresOverride: false };
  }

  static async approveScope(
    scopeid: string,
    action: 'approve' | 'request_changes' | 'request_clarification',
    opts: { note?: string; clarificationtype?: 'chat_note' | 'meeting' },
    companyid: string,
    actingUserid: string
  ): Promise<ProjectScope> {
    const scope = await this.getScope(scopeid);
    if (!scope) throw new Error('Scope not found');
    if (scope.status !== 'in_review') throw new Error(`Cannot approve scope in status: ${scope.status}`);

    const now = new Date();

    if (action === 'approve') {
      await db.update(projectspecifications).set({
        status: 'clarified',
        approvedat: now,
        updatedat: now,
      }).where(eq(projectspecifications.id, scopeid));

      await db.insert(companyauditlogs).values({
        companyid,
        action: 'scope_approved',
        changedby: actingUserid,
        newvalue: { scopeid, note: opts.note ?? null },
        description: `Scope ${scope.specnumber} approved (clarified)`,
      });

      logger.info({ scopeid }, 'Scope approved (clarified)');
    } else if (action === 'request_changes') {
      if (!opts.note) throw new Error('Note required for request_changes');
      await db.update(projectspecifications).set({ status: 'draft', updatedat: now }).where(eq(projectspecifications.id, scopeid));
      await db.insert(scopeconversations).values({
        scopeid,
        role: 'system',
        content: JSON.stringify({ type: 'changes_requested', note: opts.note }),
      });
      logger.info({ scopeid }, 'Scope sent back to draft (changes requested)');
    } else if (action === 'request_clarification') {
      if (!opts.note) throw new Error('Note required for request_clarification');
      if (opts.clarificationtype === 'meeting') {
        await db.update(projectspecifications).set({ status: 'pending_clarification', updatedat: now }).where(eq(projectspecifications.id, scopeid));
      }
      // For chat_note, status stays in_review; add to conversation
      await db.insert(scopeconversations).values({
        scopeid,
        role: 'system',
        content: JSON.stringify({ type: 'clarification_requested', note: opts.note, clarificationtype: opts.clarificationtype }),
      });
      logger.info({ scopeid, clarificationtype: opts.clarificationtype }, 'Scope clarification requested');
    }

    return this.getScope(scopeid) as Promise<ProjectScope>;
  }

  static async overrideStatus(
    scopeid: string,
    newStatus: ScopeStatus,
    reason: string,
    adminUserid: string,
    companyid: string
  ): Promise<ProjectScope> {
    const scope = await this.getScope(scopeid);
    if (!scope) throw new Error('Scope not found');

    await db.update(projectspecifications).set({
      status: newStatus,
      updatedat: new Date(),
    }).where(eq(projectspecifications.id, scopeid));

    await db.insert(companyauditlogs).values({
      companyid,
      action: 'scope_status_override',
      changedby: adminUserid,
      newvalue: { scopeid, from: scope.status, to: newStatus, reason },
      description: `ADMIN overrode scope ${scope.specnumber} status from ${scope.status} to ${newStatus}: ${reason}`,
    });

    logger.info({ scopeid, from: scope.status, to: newStatus }, 'ADMIN scope status override');
    return this.getScope(scopeid) as Promise<ProjectScope>;
  }

  /**
   * [SCOPE 098 / T002] Permanently delete a scope (projectspecifications row) and
   * its children. In a single transaction: delete the scope's tasks (projecttasks
   * are SET NULL on this FK, so we delete them explicitly rather than orphaning),
   * then the scope row — whose FK cascade removes its documents, spec-phases, scope
   * conversations, and test plans. Atomic (all-or-nothing) and project-scoped.
   *
   * Returns { deleted:false } when the project doesn't belong to the caller's
   * company OR the scope isn't found under that project — the route maps this to
   * 404. Irreversible; the on-disk specs/Project-Scope file is NOT touched.
   */
  static async deleteScope(
    projectid: string,
    scopeid: string,
    companyid: string,
    userid: string
  ): Promise<{ deleted: boolean; taskCount: number }> {
    // Verify the project belongs to the caller's company (mirror deleteProject).
    const [proj] = await db
      .select({ companyid: companyprojects.companyid })
      .from(companyprojects)
      .where(eq(companyprojects.id, projectid));
    if (!proj || proj.companyid !== companyid) return { deleted: false, taskCount: 0 };

    return db.transaction(async (tx) => {
      // Existence + project-scope check INSIDE the transaction (avoids TOCTOU with
      // a concurrent delete). Only a scope that both exists and belongs to this
      // project is deleted.
      const [scope] = await tx
        .select({ id: projectspecifications.id, specnumber: projectspecifications.specnumber })
        .from(projectspecifications)
        .where(and(eq(projectspecifications.id, scopeid), eq(projectspecifications.projectid, projectid)))
        .limit(1);
      if (!scope) return { deleted: false, taskCount: 0 };

      const deletedTasks = await tx
        .delete(projecttasks)
        .where(eq(projecttasks.specid, scopeid))
        .returning({ id: projecttasks.id });

      await tx
        .delete(projectspecifications)
        .where(and(eq(projectspecifications.id, scopeid), eq(projectspecifications.projectid, projectid)));

      await tx.insert(companyauditlogs).values({
        companyid,
        action: 'scope_deleted',
        changedby: userid,
        newvalue: { scopeid, projectid, specnumber: scope.specnumber, tasksDeleted: deletedTasks.length },
        description: `Deleted scope ${scope.specnumber} and ${deletedTasks.length} task(s)`,
      });

      logger.info({ scopeid, projectid, taskCount: deletedTasks.length }, 'Scope permanently deleted');
      return { deleted: true, taskCount: deletedTasks.length };
    });
  }

  // [SCOPE 103 / T002] BEGIN — non-destructive archive of a scope (reversible sibling of delete)
  // Sets status='archived' and records the prior status in a `scope_archived` audit row so
  // unarchive can restore it. No rows or files are deleted. Company/project-scoped and atomic.
  // Returns { archived:false } when the project isn't the caller's or the scope isn't found.
  static async archiveScope(
    projectid: string,
    scopeid: string,
    companyid: string,
    userid: string
  ): Promise<{ archived: boolean; fromStatus?: ScopeStatus }> {
    const [proj] = await db
      .select({ companyid: companyprojects.companyid })
      .from(companyprojects)
      .where(eq(companyprojects.id, projectid));
    if (!proj || proj.companyid !== companyid) return { archived: false };

    return db.transaction(async (tx) => {
      const [scope] = await tx
        .select({
          id: projectspecifications.id,
          specnumber: projectspecifications.specnumber,
          status: projectspecifications.status,
        })
        .from(projectspecifications)
        .where(and(eq(projectspecifications.id, scopeid), eq(projectspecifications.projectid, projectid)))
        .limit(1);
      if (!scope) return { archived: false };
      if (scope.status === 'archived') return { archived: true, fromStatus: 'archived' };

      const fromStatus = scope.status as ScopeStatus;
      await tx
        .update(projectspecifications)
        .set({ status: 'archived', updatedat: new Date() })
        .where(and(eq(projectspecifications.id, scopeid), eq(projectspecifications.projectid, projectid)));

      await tx.insert(companyauditlogs).values({
        companyid,
        action: 'scope_archived',
        changedby: userid,
        newvalue: { scopeid, projectid, specnumber: scope.specnumber, fromStatus },
        description: `Archived scope ${scope.specnumber} (was ${fromStatus})`,
      });

      logger.info({ scopeid, projectid, fromStatus }, 'Scope archived');
      return { archived: true, fromStatus };
    });
  }

  // Restore an archived scope to its prior status (from the most recent scope_archived audit
  // row; falls back to 'draft' if that row was pruned). Writes a `scope_unarchived` audit row.
  static async unarchiveScope(
    projectid: string,
    scopeid: string,
    companyid: string,
    userid: string
  ): Promise<{ unarchived: boolean; status?: ScopeStatus }> {
    const [proj] = await db
      .select({ companyid: companyprojects.companyid })
      .from(companyprojects)
      .where(eq(companyprojects.id, projectid));
    if (!proj || proj.companyid !== companyid) return { unarchived: false };

    return db.transaction(async (tx) => {
      const [scope] = await tx
        .select({
          id: projectspecifications.id,
          specnumber: projectspecifications.specnumber,
          status: projectspecifications.status,
        })
        .from(projectspecifications)
        .where(and(eq(projectspecifications.id, scopeid), eq(projectspecifications.projectid, projectid)))
        .limit(1);
      if (!scope) return { unarchived: false };
      if (scope.status !== 'archived') return { unarchived: false, status: scope.status as ScopeStatus };

      const [priorRow] = await tx
        .select({ newvalue: companyauditlogs.newvalue })
        .from(companyauditlogs)
        .where(
          and(
            eq(companyauditlogs.companyid, companyid),
            eq(companyauditlogs.action, 'scope_archived'),
            sql`${companyauditlogs.newvalue}->>'scopeid' = ${scopeid}`
          )
        )
        .orderBy(desc(companyauditlogs.timestamp))
        .limit(1);
      const priorStatus = (priorRow?.newvalue as { fromStatus?: string } | null | undefined)?.fromStatus;
      const restored: ScopeStatus = priorStatus && priorStatus !== 'archived' ? (priorStatus as ScopeStatus) : 'draft';

      await tx
        .update(projectspecifications)
        .set({ status: restored, updatedat: new Date() })
        .where(and(eq(projectspecifications.id, scopeid), eq(projectspecifications.projectid, projectid)));

      await tx.insert(companyauditlogs).values({
        companyid,
        action: 'scope_unarchived',
        changedby: userid,
        newvalue: { scopeid, projectid, specnumber: scope.specnumber, restoredTo: restored },
        description: `Unarchived scope ${scope.specnumber} → ${restored}`,
      });

      logger.info({ scopeid, projectid, restored }, 'Scope unarchived');
      return { unarchived: true, status: restored };
    });
  }
  // [SCOPE 103 / T002] END

  static async getScopeMatrix(projectid: string): Promise<{ scopes: ScopeMatrixRow[]; phases: string[] }> {
    const scopes = await this.getScopes(projectid);
    const phases = [...PHASE_ORDER];

    const rows: ScopeMatrixRow[] = scopes.map((scope) => {
      const phaseStatuses: Record<string, ScopeMatrixRow['phases'][string]> = {};
      for (const phase of phases) {
        phaseStatuses[phase] = this.deriveCellStatus(scope, phase);
      }
      return {
        id: scope.id,
        specnumber: scope.specnumber,
        title: scope.title,
        status: scope.status,
        isoptional: scope.isoptional,
        phases: phaseStatuses,
      };
    });

    return { scopes: rows, phases };
  }

  private static deriveCellStatus(
    scope: ProjectScope,
    phase: string
  ): ScopeMatrixRow['phases'][string] {
    if (scope.status === 'deferred') return 'deferred';
    if (scope.isoptional && !PHASE_STATUS_THRESHOLD[phase]?.includes(scope.status)) return 'deferred';

    const completedStatuses = PHASE_STATUS_THRESHOLD[phase] ?? [];
    if (completedStatuses.includes(scope.status)) return 'complete';

    const activeStatuses = PHASE_ACTIVE_STATUSES[phase] ?? [];
    if (activeStatuses.includes(scope.status)) return 'active';

    return 'pending';
  }

  private static async checkConflicts(scope: ProjectScope): Promise<ScopeConflict[]> {
    // Fetch sibling scopes for comparison
    const siblings = await db
      .select({ id: projectspecifications.id, specnumber: projectspecifications.specnumber, title: projectspecifications.title, content: projectspecifications.content })
      .from(projectspecifications)
      .where(and(eq(projectspecifications.projectid, scope.projectid)));

    const others = siblings.filter((s) => s.id !== scope.id);
    if (others.length === 0) return [];

    // Build a lightweight AI prompt for conflict detection
    const otherSummaries = others
      .map((s) => `${s.specnumber}-${s.title}: ${s.content.slice(0, 300)}`)
      .join('\n');

    // [SCOPE 099 / T004] Asks for an OBJECT envelope, not a bare array. OpenAI-style
    // JSON mode requires a top-level object, so the old "respond with a JSON array"
    // wording made gpt-oss improvise its own wrapper ({"type":"json_object",
    // "content":[…]}). Array.isArray then failed and the check fail-opened to "no
    // conflicts" — silently, forever. Verified: it had correctly found a real 099↔076
    // overlap and we would have thrown it away. Gemini's responseMimeType returns bare
    // arrays happily, which is why this never showed up before.
    const prompt = `You are reviewing scope "${scope.specnumber}-${scope.title}" for functional overlap with the following scopes:\n\n${otherSummaries}\n\nScope being reviewed:\n${scope.content.slice(0, 500)}\n\nRespond with a JSON object of the exact form {"conflicts": [...]}, where each element has fields: conflicttype (string), withscope (e.g. "002-billing"), description (string). If there are no conflicts, return {"conflicts": []}. Return only that JSON object.`;

    // [SCOPE 099 / T004] Routed through the shared provider instead of a hardcoded
    // Gemini endpoint. This DELETES a real defect rather than porting it: the old
    // code read `GEMINI_API_KEY ?? OPENAI_API_KEY` and posted the result to a GOOGLE
    // endpoint — an OpenAI key would have 400'd and fail-opened to "no conflicts"
    // forever, silently. It never fired in prod only because OPENAI_API_KEY is unset.
    // Root cause was CONTEXT.md's glossary claiming a Gemini→OpenAI fallback that has
    // never existed in code (fixed in T008).
    //
    // Fail-open is PRESERVED at every step — this is an advisory, not a gate. A
    // missing key now surfaces as LlmConfigError from resolveEndpoint and is caught
    // here, giving the same "warn and continue" behavior as the old key check.
    let text: string;
    try {
      // temperature 0: this is structured extraction, not authoring — the old code
      // inherited Gemini's chatty default, which is wrong for a classifier.
      text = await generateOnce(prompt, { jsonMode: true, temperature: 0 });
    } catch (err) {
      logger.warn(
        { err, scopeid: scope.id },
        'AI conflict check unavailable — proceeding fail-open',
      );
      return [];
    }

    // parseJsonLoose, not JSON.parse: reasoning models wrap JSON in prose or ```json
    // fences even under a JSON mode, which plain JSON.parse would reject.
    // Accept BOTH shapes on purpose — the envelope (OpenAI JSON mode, which cannot
    // return a bare array) and a bare array (Gemini's responseMimeType returns one).
    // The wire should not change whether a conflict gets reported.
    const parsed = parseJsonLoose<ScopeConflict[] | { conflicts?: ScopeConflict[] }>(text);
    const conflicts = Array.isArray(parsed) ? parsed : parsed?.conflicts;
    if (!Array.isArray(conflicts)) {
      logger.warn(
        { scopeid: scope.id, got: parsed === null ? 'unparseable' : Object.keys(parsed ?? {}) },
        'AI conflict check returned an unexpected shape — fail-open',
      );
      return [];
    }
    return conflicts;
  }
}
