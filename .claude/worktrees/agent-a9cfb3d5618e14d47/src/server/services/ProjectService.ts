import { db } from '~/db/client.js';
import { companyprojects } from '~/db/schema/companyproject.js';
import { customers } from '~/db/schema/customer.js'; // [SCOPE 119 / T008]
import { projectphases } from '~/db/schema/projectphase.js';
import { projectspecifications } from '~/db/schema/projectspecification.js';
import { projecttasks } from '~/db/schema/projecttask.js';
import { projecttimeentries } from '~/db/schema/projecttimeentry.js';
import { userprofiles } from '~/db/schema/userprofiles.js';
import { projectusers } from '~/db/schema/projectuser.js';
import { engagements } from '~/db/schema/engagement.js';
import { engagementassignments } from '~/db/schema/engagementassignment.js';
import { companies } from '~/db/schema/company.js';
import { kitGenerationService } from './KitGenerationService.js';
import { eq, and, ne, count, sql, inArray, isNull } from 'drizzle-orm';
import { createLogger } from '~/server/lib/logger.js';
import { PhaseService } from './PhaseService.js';
import { AIScaffoldingService } from './AIScaffoldingService.js';
import * as AuditConfigService from './AuditConfigService.js';
import { ScopeStageService } from './ScopeStageService.js'; // [SCOPE 123 / T009] rollup stage
import type { ProjectCard, PhaseWithAssignee, ProjectStatus } from '~/shared/types/projects.js';

const SPEC_STATUS_TO_PHASE: Record<string, string> = {
  draft: 'Design', in_review: 'Design', pending_clarification: 'Design',
  clarified: 'Design', planned: 'Design', tasks_generated: 'Design',
  implementing: 'Implementation', implemented: 'Implementation',
  qa_passed: 'QA', human_tested: 'HumanTesting',
  beta_cleared: 'Beta', released: 'Release',
};

const logger = createLogger('project-service');

export class ProjectService {
  /**
   * Create a project, initialize 6 phases atomically, trigger async AI scaffolding.
   * Optionally generate AI-ready project kit.
   */
  /**
   * Returns true if a non-archived project with the same name (case-insensitive,
   * trimmed) already exists for the company. Used to flag duplicates at creation.
   */
  static async nameExistsForCompany(
    companyid: string,
    name: string
  ): Promise<boolean> {
    const [row] = await db
      .select({ id: companyprojects.id })
      .from(companyprojects)
      .where(
        and(
          eq(companyprojects.companyid, companyid),
          ne(companyprojects.currentphase, 'ARCHIVED'),
          sql`lower(trim(${companyprojects.name})) = lower(trim(${name}))`
        )
      )
      .limit(1);
    return !!row;
  }

  static async createProject(
    userid: string,
    companyid: string,
    name: string,
    description?: string,
    hourlyrate?: number,
    allocatedhours?: number,
    pmsystems?: string,
    securityclassification?: string,
    status?: string,
    phaseassignments: Record<string, string> = {},
    generateKit?: boolean,
    primaryAi?: string
  ): Promise<typeof companyprojects.$inferSelect> {
    const now = new Date();

    const [proj] = await db
      .insert(companyprojects)
      .values({
        userid,
        companyid,
        name,
        description: description ?? null,
        hourlyrate: hourlyrate != null ? String(hourlyrate) : null,
        allocatedhours: allocatedhours != null ? String(allocatedhours) : null,
        pmsystems: pmsystems ?? null,
        securityclassification: securityclassification ?? null,
        status: (status ?? 'ACTIVE') as 'ACTIVE' | 'ARCHIVE' | 'BRANCHED',
        currentphase: 'Design',
        createdat: now,
        updatedat: now,
      })
      .returning();

    logger.info({ projectid: proj.id, companyid }, 'Project created');

    await PhaseService.initializePhases(proj.id, phaseassignments);

    // SPEC-112 / FR-001 — inherit the company's compliance defaults. The company
    // row is a template for new projects; per-project settings diverge from here.
    // Fail-open and off the critical path: never block creation on this.
    setImmediate(() => {
      void AuditConfigService.seedProjectAuditConfigFromCompany(proj.id, companyid);
    });

    setImmediate(() => {
      AIScaffoldingService.scaffold(proj.id, name, description ?? null, userid);
    });

    if (generateKit) {
      setImmediate(() => {
        kitGenerationService.generateKit({
          projectId: proj.id,
          userId: userid,
          companyId: companyid,
          primaryAi: primaryAi || 'generic',
          importMode: false,
        });
      });
    }

    return proj;
  }

  /**
   * List projects with visibility rules:
   * - ADMIN: all company projects
   * - Non-admin: projects where user is assigned via projectusers table OR is the phase lead
   */
  /**
   * Spec 037 FR-029 — return active project-level engagement grants where the
   * caller's company is on the Consulting side. Map: projectId → engagement info.
   * Only project-level grants (scopeid IS NULL AND taskid IS NULL) qualify here;
   * scope/task-level grants don't grant project-workspace access (Phase B).
   */
  private static async getEngagementProjectAccess(
    companyid: string,
  ): Promise<Map<string, { engagementId: string; clientCompanyName: string }>> {
    const rows = await db
      .select({
        projectid: engagementassignments.projectid,
        engagementid: engagements.id,
        clientcompanyname: companies.name,
      })
      .from(engagementassignments)
      .innerJoin(
        engagements,
        eq(engagements.id, engagementassignments.engagementid),
      )
      .innerJoin(companies, eq(companies.id, engagements.clientcompanyid))
      .where(
        and(
          eq(engagements.consultingcompanyid, companyid),
          inArray(engagements.state, ['active', 'paused', 'disabled']),
          isNull(engagementassignments.removedat),
          isNull(engagementassignments.scopeid),
          isNull(engagementassignments.taskid),
        ),
      );

    const map = new Map<
      string,
      { engagementId: string; clientCompanyName: string }
    >();
    for (const r of rows) {
      if (!map.has(r.projectid)) {
        map.set(r.projectid, {
          engagementId: r.engagementid,
          clientCompanyName: r.clientcompanyname,
        });
      }
    }
    return map;
  }

  /**
   * Tenant-isolation check for project sub-resources (SOC 2 CC6.1 / CC6.3, H-2).
   * Returns true only when the project exists AND is either owned by the caller's
   * company or reachable via an active consulting engagement. This is the
   * coarse cross-tenant gate (deliberately NOT the phase-lead gating that
   * getProject applies to the project page) so intra-company access is unchanged.
   */
  static async canAccessProjectTenant(
    projectid: string,
    companyid: string,
  ): Promise<boolean> {
    const [proj] = await db
      .select({ companyid: companyprojects.companyid })
      .from(companyprojects)
      .where(eq(companyprojects.id, projectid));
    if (!proj) return false;
    if (proj.companyid === companyid) return true;
    const access = await this.getEngagementProjectAccess(companyid);
    return access.has(projectid);
  }

  static async getUserProjects(
    userid: string,
    companyid: string,
    usertype: string,
    showAll = false
  ): Promise<ProjectCard[]> {
    // Spec 037 FR-029 — engagement-assigned projects ALWAYS visible to anyone
    // in the consulting tenant (gated further at sub-assignment level by
    // EngagementVisibility). Fetch once and merge into the result set.
    const engagementAccess = await this.getEngagementProjectAccess(companyid);
    const engagementProjectIds = Array.from(engagementAccess.keys());
    const engagementRows =
      engagementProjectIds.length > 0
        ? await db
            .select()
            .from(companyprojects)
            .where(
              and(
                inArray(companyprojects.id, engagementProjectIds),
                ne(companyprojects.currentphase, 'ARCHIVED'),
              ),
            )
            .orderBy(sql`${companyprojects.updatedat} DESC`)
        : [];

    // ADMINs always see every company project; other users can opt in via showAll.
    if (usertype === 'ADMIN' || showAll) {
      const rows = await db
        .select()
        .from(companyprojects)
        .where(ne(companyprojects.currentphase, 'ARCHIVED'))
        .orderBy(sql`${companyprojects.updatedat} DESC`);

      const companyRows = rows.filter((p) => p.companyid === companyid);
      const owned = await this.buildProjectCards(companyRows);
      const consulting = await this.buildProjectCards(engagementRows);
      for (const c of consulting) {
        const info = engagementAccess.get(c.id)!;
        c.accessRole = 'consulting';
        c.engagementId = info.engagementId;
        c.clientCompanyName = info.clientCompanyName;
      }
      for (const o of owned) o.accessRole = 'owner';
      return [...owned, ...consulting];
    }

    const [projectUsersRows, phaseRows] = await Promise.all([
      db
        .selectDistinct({ project: companyprojects })
        .from(companyprojects)
        .innerJoin(
          projectusers,
          and(
            eq(projectusers.projectid, companyprojects.id),
            eq(projectusers.userid, userid),
            isNull(projectusers.removedat)
          )
        )
        .where(ne(companyprojects.currentphase, 'ARCHIVED'))
        .orderBy(sql`${companyprojects.updatedat} DESC`),

      db
        .selectDistinct({ project: companyprojects })
        .from(companyprojects)
        .innerJoin(
          projectphases,
          and(
            eq(projectphases.projectid, companyprojects.id),
            eq(projectphases.status, 'in_progress'),
            eq(projectphases.assigneduserid, userid)
          )
        )
        .where(ne(companyprojects.currentphase, 'ARCHIVED'))
        .orderBy(sql`${companyprojects.updatedat} DESC`)
    ]);

    const projectMap = new Map<string, typeof companyprojects.$inferSelect>();

    for (const row of projectUsersRows) {
      if (row.project.companyid === companyid) {
        projectMap.set(row.project.id, row.project);
      }
    }

    for (const row of phaseRows) {
      if (row.project.companyid === companyid) {
        projectMap.set(row.project.id, row.project);
      }
    }

    const companyRows = Array.from(projectMap.values());
    const owned = await this.buildProjectCards(companyRows);
    for (const o of owned) o.accessRole = 'owner';
    const consulting = await this.buildProjectCards(engagementRows);
    for (const c of consulting) {
      const info = engagementAccess.get(c.id)!;
      c.accessRole = 'consulting';
      c.engagementId = info.engagementId;
      c.clientCompanyName = info.clientCompanyName;
    }
    return [...owned, ...consulting];
  }

  private static async buildProjectCards(
    projectRows: Array<typeof companyprojects.$inferSelect>
  ): Promise<ProjectCard[]> {
    if (projectRows.length === 0) return [];

    const projectIds = projectRows.map((p) => p.id);

    const phaseRows = await db
      .select({
        id: projectphases.id,
        projectid: projectphases.projectid,
        phasename: projectphases.phasename,
        status: projectphases.status,
        assigneduserid: projectphases.assigneduserid,
        enteredat: projectphases.enteredat,
        completedat: projectphases.completedat,
        reason: projectphases.reason,
        createdat: projectphases.createdat,
        assignedfullname: userprofiles.fullname,
        assignedemail: userprofiles.emailaddr,
      })
      .from(projectphases)
      .leftJoin(userprofiles, sql`${projectphases.assigneduserid}::uuid = ${userprofiles.id}`)
      .where(eq(projectphases.status, 'in_progress'));

    const activePhaseMap = new Map<string, PhaseWithAssignee>();
    for (const r of phaseRows) {
      if (projectIds.includes(r.projectid)) {
        activePhaseMap.set(r.projectid, {
          id: r.id,
          projectid: r.projectid,
          phasename: r.phasename,
          status: 'in_progress',
          assigneduserid: r.assigneduserid ?? null,
          assigneduser: r.assigneduserid
            ? { id: r.assigneduserid, fullname: r.assignedfullname ?? null, emailaddr: r.assignedemail }
            : null,
          enteredat: r.enteredat?.toISOString() ?? null,
          completedat: null,
          reason: r.reason ?? null,
          createdat: r.createdat.toISOString(),
        });
      }
    }

    const taskCounts = await db
      .select({
        projectid: projecttasks.projectid,
        cnt: count(),
      })
      .from(projecttasks)
      .where(eq(projecttasks.status, 'open'))
      .groupBy(projecttasks.projectid);

    const taskCountMap = new Map(taskCounts.map((t) => [t.projectid, Number(t.cnt)]));

    const specStatusRows = await db
      .select({ projectid: projectspecifications.projectid, status: projectspecifications.status })
      .from(projectspecifications)
      .where(inArray(projectspecifications.projectid, projectIds));

    const activePhasesMap = new Map<string, Set<string>>();
    for (const row of specStatusRows) {
      if (row.status === 'deferred') continue;
      const phase = SPEC_STATUS_TO_PHASE[row.status];
      if (!phase) continue;
      if (!activePhasesMap.has(row.projectid)) activePhasesMap.set(row.projectid, new Set());
      activePhasesMap.get(row.projectid)!.add(phase);
    }

    const phaseTaskStats = await db
      .select({
        projectid: projecttasks.projectid,
        phasename: projectphases.phasename,
        total: count(),
        completed: sql<number>`COUNT(*) FILTER (WHERE ${projecttasks.status} = 'completed')`,
      })
      .from(projecttasks)
      .innerJoin(projectphases, eq(projecttasks.phaseid, projectphases.id))
      .where(inArray(projecttasks.projectid, projectIds))
      .groupBy(projecttasks.projectid, projectphases.phasename);

    const phaseStatMap = new Map<string, { total: number; completed: number }>();
    for (const s of phaseTaskStats) {
      phaseStatMap.set(`${s.projectid}:${s.phasename}`, {
        total: Number(s.total),
        completed: Number(s.completed),
      });
    }

    // [SCOPE 112 / T006] Framework set replaces the single `audittype` value. One
    // batched query rather than one per row.
    const frameworkMap = await AuditConfigService.getEnabledFrameworksByProjects(projectIds);

    // [SCOPE 123 / T009] The displayed project stage is a ROLLUP: the lowest stage among the
    // project's active scopes (FR-006). companyprojects.currentphase is set to 'Design' at creation
    // and never advanced, so it described no scope; only its 'ARCHIVED' marker is still read.
    const rollupMap = await ScopeStageService.projectRollupStages(projectIds);

    return projectRows.map((p) => {
      const displayphase = p.currentphase === 'ARCHIVED' ? p.currentphase : rollupMap.get(p.id) ?? p.currentphase;
      const currentPhaseStats = phaseStatMap.get(`${p.id}:${displayphase}`) ?? { total: 0, completed: 0 };
      return {
        id: p.id,
        name: p.name,
        description: p.description ?? null,
        status: (p.status ?? 'ACTIVE') as ProjectStatus,
        hourlyrate: p.hourlyrate ?? null,
        allocatedhours: p.allocatedhours ?? null,
        pmsystems: p.pmsystems ?? null,
        securityclassification: p.securityclassification ?? null,
        activeframeworks: frameworkMap.get(p.id) ?? [],
        currentphase: displayphase,
        activephase: activePhaseMap.get(p.id) ?? null,
        opentaskcount: taskCountMap.get(p.id) ?? 0,
        currentphasetotal: currentPhaseStats.total,
        currentphasecompleted: currentPhaseStats.completed,
        createdat: p.createdat.toISOString(),
        updatedat: p.updatedat.toISOString(),
        activePhases: [...(activePhasesMap.get(p.id) ?? new Set())],
      };
    });
  }

  static async getProject(
    projectid: string,
    userid: string,
    companyid: string,
    usertype: string
  ): Promise<{ project: ProjectCard; phases: PhaseWithAssignee[] } | null> {
    const [proj] = await db
      .select()
      .from(companyprojects)
      .where(and(eq(companyprojects.id, projectid)));

    if (!proj) return null;

    // Spec 037 FR-029 — non-owners may still access via project-level engagement grant.
    let engagementInfo: { engagementId: string; clientCompanyName: string } | null = null;
    let accessRole: 'owner' | 'consulting' = 'owner';
    if (proj.companyid !== companyid) {
      const access = await this.getEngagementProjectAccess(companyid);
      const info = access.get(projectid);
      if (!info) return null;
      engagementInfo = info;
      accessRole = 'consulting';
    }

    const phases = await PhaseService.getPhases(projectid);

    // ADMIN of either side bypasses phase-lead gating. Consulting accessRole
    // also bypasses (engagement granted access; specific member visibility is
    // governed at sub-assignment / task level, not at the project page level).
    if (usertype !== 'ADMIN' && accessRole === 'owner') {
      const activePhase = phases.find((p) => p.status === 'in_progress');
      if (activePhase?.assigneduserid !== userid) {
        return null;
      }
    }

    const [taskRow] = await db
      .select({ cnt: count() })
      .from(projecttasks)
      .where(and(eq(projecttasks.projectid, projectid), eq(projecttasks.status, 'open')));

    const activePhase = phases.find((p) => p.status === 'in_progress') ?? null;

    const projectCard: ProjectCard = {
      id: proj.id,
      name: proj.name,
      description: proj.description ?? null,
      status: (proj.status ?? 'ACTIVE') as ProjectStatus,
      hourlyrate: proj.hourlyrate ?? null,
      allocatedhours: proj.allocatedhours ?? null,
      pmsystems: proj.pmsystems ?? null,
      securityclassification: proj.securityclassification ?? null,
      // [SCOPE 112 / T006] Framework set replaces the single `audittype` value.
      activeframeworks: await AuditConfigService.getEnabledFrameworksByProject(proj.id),
      // [SCOPE 123 / T009] rollup of the project's scope stages; see buildProjectCards
      currentphase:
        proj.currentphase === 'ARCHIVED'
          ? proj.currentphase
          : (await ScopeStageService.projectRollupStages([proj.id])).get(proj.id) ?? proj.currentphase,
      activephase: activePhase,
      opentaskcount: Number(taskRow?.cnt ?? 0),
      currentphasetotal: 0,
      currentphasecompleted: 0,
      createdat: proj.createdat.toISOString(),
      updatedat: proj.updatedat.toISOString(),
      accessRole,
      ...(engagementInfo && {
        engagementId: engagementInfo.engagementId,
        clientCompanyName: engagementInfo.clientCompanyName,
      }),
    };

    return { project: projectCard, phases };
  }

  static async updateProject(
    projectid: string,
    companyid: string,
    updates: {
      name?: string;
      description?: string;
      hourlyrate?: number;
      allocatedhours?: number;
      pmsystems?: string;
      securityclassification?: string;
      // [SCOPE 119 / T008] null clears the association (SPEC-119 FR-006)
      customerid?: string | null;
    }
  ): Promise<typeof companyprojects.$inferSelect | null> {
    const [proj] = await db.select().from(companyprojects).where(eq(companyprojects.id, projectid));
    if (!proj || proj.companyid !== companyid) return null;

    // [SCOPE 119 / T008] The customer must belong to the same company, and must not
    // be archived (SPEC-119 FR-003 — an archived customer cannot take new work).
    // Checked here rather than left to the foreign key, because the FK would accept
    // an archived row and a cross-company one alike.
    if (updates.customerid !== undefined && updates.customerid !== null) {
      const [cust] = await db
        .select({ id: customers.id, archivedat: customers.archivedat, companyid: customers.companyid })
        .from(customers)
        .where(eq(customers.id, updates.customerid));
      if (!cust || cust.companyid !== companyid) return null;
      if (cust.archivedat !== null) return null;
    }

    const set: Record<string, unknown> = { updatedat: new Date() };
    if (updates.name !== undefined) set.name = updates.name;
    if (updates.description !== undefined) set.description = updates.description;
    if (updates.hourlyrate !== undefined) set.hourlyrate = String(updates.hourlyrate);
    if (updates.allocatedhours !== undefined) set.allocatedhours = String(updates.allocatedhours);
    if (updates.pmsystems !== undefined) set.pmsystems = updates.pmsystems;
    if (updates.securityclassification !== undefined) set.securityclassification = updates.securityclassification;
    // [SCOPE 119 / T008] Explicit null clears the association, so `!== undefined`
    // is the right guard — `if (updates.customerid)` would silently ignore a clear.
    if (updates.customerid !== undefined) set.customerid = updates.customerid;
    // [SCOPE 112 / T006] `audittype` is no longer writable here — see PUT /api/audit/config.

    const [updated] = await db
      .update(companyprojects)
      .set(set)
      .where(eq(companyprojects.id, projectid))
      .returning();

    logger.info({ projectid }, 'Project updated');
    return updated;
  }

  static async archiveProject(
    projectid: string,
    companyid: string
  ): Promise<typeof companyprojects.$inferSelect | null> {
    const [proj] = await db.select().from(companyprojects).where(eq(companyprojects.id, projectid));
    if (!proj || proj.companyid !== companyid) return null;

    const [archived] = await db
      .update(companyprojects)
      .set({ currentphase: 'ARCHIVED', updatedat: new Date() })
      .where(eq(companyprojects.id, projectid))
      .returning();

    logger.info({ projectid }, 'Project archived');
    return archived;
  }

  /**
   * Permanently delete a project and all dependent records. Child tables (tasks,
   * phases, specs, documents, time entries, etc.) cascade via FK ON DELETE CASCADE;
   * any linked proposal has its projectid set to null. Irreversible.
   * Returns false if the project does not exist or belongs to another company.
   */
  static async deleteProject(
    projectid: string,
    companyid: string
  ): Promise<boolean> {
    const [proj] = await db.select().from(companyprojects).where(eq(companyprojects.id, projectid));
    if (!proj || proj.companyid !== companyid) return false;

    await db.delete(companyprojects).where(eq(companyprojects.id, projectid));

    logger.info({ projectid }, 'Project permanently deleted');
    return true;
  }

  static async getProjectHoursSummary(
    projectid: string,
    companyid: string
  ): Promise<{
    totalHours: number;
    billableHours: number;
    nonBillableHours: number;
    allocatedHours: number;
    remainingHours: number;
    budgetPercentage: number;
    hourlyRate: number;
    projectedTotal: number;
  }> {
    const [proj] = await db.select().from(companyprojects).where(eq(companyprojects.id, projectid));
    if (!proj || proj.companyid !== companyid) throw new Error('Project not found');

    const entries = await db
      .select()
      .from(projecttimeentries)
      .where(eq(projecttimeentries.projectid, projectid));

    const billableMinutes = entries.filter((e) => e.billable).reduce((s, e) => s + (e.duration ?? 0), 0);
    const nonBillableMinutes = entries.filter((e) => !e.billable).reduce((s, e) => s + (e.duration ?? 0), 0);
    const billableHours = Math.round((billableMinutes / 60) * 100) / 100;
    const nonBillableHours = Math.round((nonBillableMinutes / 60) * 100) / 100;
    const totalHours = billableHours + nonBillableHours;
    const allocatedHours = proj.allocatedhours ? Number(proj.allocatedhours) : 0;
    const remainingHours = Math.max(0, allocatedHours - totalHours);
    const budgetPercentage = allocatedHours > 0 ? Math.round((totalHours / allocatedHours) * 100) : 0;
    const hourlyRate = proj.hourlyrate ? Number(proj.hourlyrate) : 0;
    const projectedTotal = billableHours * hourlyRate;

    return { totalHours, billableHours, nonBillableHours, allocatedHours, remainingHours, budgetPercentage, hourlyRate, projectedTotal };
  }
}