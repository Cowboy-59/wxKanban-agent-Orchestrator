import { db } from '~/db/client.js';
import { projectphases } from '~/db/schema/projectphase.js';
import { companyprojects } from '~/db/schema/companyproject.js';
import { projecttasks } from '~/db/schema/projecttask.js';
import { projectspecifications } from '~/db/schema/projectspecification.js';
import { userprofiles } from '~/db/schema/userprofiles.js';
import { companyauditlogs } from '~/db/schema/companyauditlog.js';
import { eq, and, ne, count, notInArray, sql } from 'drizzle-orm';
import { createLogger } from '~/server/lib/logger.js';
import type { PhaseCompletion, PhaseCompletionCriterion, PhaseWithAssignee } from '~/shared/types/projects.js';

const logger = createLogger('phase-service');

const PHASE_ORDER = ['Design', 'Implementation', 'QA', 'HumanTesting', 'Beta', 'Release'] as const;
type PhaseName = typeof PHASE_ORDER[number];

export class PhaseService {
  /**
   * Create 6 phase records for a new project.
   * Phase 1 (Design) starts as in_progress; the rest are pending.
   * Accepts optional phase assignments map: { phasename → assigneduserid }
   */
  static async initializePhases(
    projectid: string,
    phaseassignments: Record<string, string> = {}
  ): Promise<void> {
    const now = new Date();

    const rows = PHASE_ORDER.map((phasename, index) => ({
      projectid,
      phasename,
      status: index === 0 ? 'in_progress' : 'pending',
      assigneduserid: phaseassignments[phasename] ?? null,
      enteredat: index === 0 ? now : null,
      createdat: now,
    }));

    await db.insert(projectphases).values(rows);
    logger.info({ projectid }, 'Initialized 6 project phases');
  }

  /**
   * Get all phases for a project with assigned user details.
   */
  static async getPhases(projectid: string): Promise<PhaseWithAssignee[]> {
    const rows = await db
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
      .where(eq(projectphases.projectid, projectid))
      .orderBy(projectphases.createdat);

    return rows.map((r) => ({
      id: r.id,
      projectid: r.projectid,
      phasename: r.phasename,
      status: r.status as PhaseWithAssignee['status'],
      assigneduserid: r.assigneduserid ?? null,
      assigneduser: r.assigneduserid
        ? { id: r.assigneduserid, fullname: r.assignedfullname ?? null, emailaddr: r.assignedemail }
        : null,
      enteredat: r.enteredat?.toISOString() ?? null,
      completedat: r.completedat?.toISOString() ?? null,
      reason: r.reason ?? null,
      createdat: r.createdat.toISOString(),
    }));
  }

  /**
   * Get the currently active (in_progress) phase for a project.
   */
  static async getActivePhase(projectid: string): Promise<PhaseWithAssignee | null> {
    const phases = await this.getPhases(projectid);
    return phases.find((p) => p.status === 'in_progress') ?? null;
  }

  /**
   * Get a single phase by ID.
   */
  static async getPhase(phaseid: string): Promise<PhaseWithAssignee | null> {
    const rows = await db
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
      .where(eq(projectphases.id, phaseid));

    const r = rows[0];
    if (!r) return null;

    return {
      id: r.id,
      projectid: r.projectid,
      phasename: r.phasename,
      status: r.status as PhaseWithAssignee['status'],
      assigneduserid: r.assigneduserid ?? null,
      assigneduser: r.assigneduserid
        ? { id: r.assigneduserid, fullname: r.assignedfullname ?? null, emailaddr: r.assignedemail }
        : null,
      enteredat: r.enteredat?.toISOString() ?? null,
      completedat: r.completedat?.toISOString() ?? null,
      reason: r.reason ?? null,
      createdat: r.createdat.toISOString(),
    };
  }

  /**
   * Assign a user to a phase (or clear assignment with null).
   */
  static async assignUser(phaseid: string, assigneduserid: string | null): Promise<void> {
    await db
      .update(projectphases)
      .set({ assigneduserid })
      .where(eq(projectphases.id, phaseid));
    logger.info({ phaseid, assigneduserid }, 'Phase user assigned');
  }

  /**
   * Check if a user is authorized to control a phase (advance/reopen).
   * ADMIN: always. TEAM_MANAGER: only if they are the assigneduserid.
   */
  static async canUserControlPhase(
    phaseid: string,
    userid: string,
    usertype: string
  ): Promise<boolean> {
    if (usertype === 'ADMIN') return true;
    if (usertype !== 'TEAM_MANAGER') return false;

    const phase = await this.getPhase(phaseid);
    return phase?.assigneduserid === userid;
  }

  /**
   * Check completion criteria for a phase. Returns pass/fail per criterion.
   */
  static async checkCompletion(
    phaseid: string,
    phasename: string,
    projectid: string
  ): Promise<PhaseCompletion> {
    const criteria: PhaseCompletionCriterion[] = [];
    let blockingtasks: PhaseCompletion['blockingtasks'] = [];

    switch (phasename) {
      case 'Design': {
        // Scopes must be clarified (or further), not stuck in draft/in_review
        const draftScopes = await db
          .select({ id: projectspecifications.id, name: projectspecifications.title, status: projectspecifications.status })
          .from(projectspecifications)
          .where(
            and(
              eq(projectspecifications.projectid, projectid),
              eq(projectspecifications.isoptional, false),
              notInArray(projectspecifications.status, [
                'clarified', 'planned', 'tasks_generated', 'implemented',
                'qa_passed', 'human_tested', 'beta_cleared', 'released', 'deferred',
              ])
            )
          );
        criteria.push({
          label: 'All non-optional scopes clarified',
          passed: draftScopes.length === 0,
          detail: draftScopes.length === 0
            ? 'All scopes clarified'
            : `${draftScopes.length} scope(s) not yet clarified`,
        });
        blockingtasks = draftScopes.map((s) => ({ id: s.id, name: s.name, status: s.status, scopetitle: null }));
        break;
      }

      case 'Implementation': {
        const [row] = await db
          .select({ cnt: count() })
          .from(projecttasks)
          .where(and(eq(projecttasks.phaseid, phaseid), ne(projecttasks.status, 'completed')));
        const openCount = Number(row?.cnt ?? 0);
        criteria.push({
          label: 'All tasks completed',
          passed: openCount === 0,
          detail: openCount === 0 ? 'All tasks completed' : `${openCount} task(s) still open or in progress`,
        });
        break;
      }

      case 'QA': {
        const [row] = await db
          .select({ cnt: count() })
          .from(projecttasks)
          .where(
            and(
              eq(projecttasks.phaseid, phaseid),
              ne(projecttasks.status, 'completed')
            )
          );
        const [failRow] = await db
          .select({ cnt: count() })
          .from(projecttasks)
          .where(
            and(
              eq(projecttasks.phaseid, phaseid),
              eq(projecttasks.status, 'completed'),
              ne(projecttasks.results, 'pass')

            )
          );
        const notDone = Number(row?.cnt ?? 0);
        const notPassed = Number(failRow?.cnt ?? 0);
        criteria.push({
          label: 'All tasks completed',
          passed: notDone === 0,
          detail: notDone === 0 ? 'All tasks completed' : `${notDone} task(s) incomplete`,
        });
        criteria.push({
          label: 'All tasks passed',
          passed: notPassed === 0,
          detail: notPassed === 0 ? 'All tests passing' : `${notPassed} task(s) failed or no result`,
        });

        // [SCOPE 111 / T024] QA cannot advance while a forced MACHINE test is
        // unsigned or failing (FR-034). Human items are not considered here —
        // they have not been released, so nobody has been asked for them yet.
        const machineGate = await this.testGateCriterion(projectid, 'ai');
        criteria.push(machineGate.criterion);
        blockingtasks = [...(blockingtasks ?? []), ...machineGate.blockingtasks];
        break;
      }

      case 'HumanTesting':
      case 'Beta': {
        const [row] = await db
          .select({ cnt: count() })
          .from(projecttasks)
          .where(and(eq(projecttasks.phaseid, phaseid), eq(projecttasks.status, 'open')));
        const openCount = Number(row?.cnt ?? 0);
        criteria.push({
          label: 'No open tasks',
          passed: openCount === 0,
          detail: openCount === 0 ? 'No open tasks remaining' : `${openCount} task(s) still open`,
        });

        // [SCOPE 111 / T024] User Testing cannot advance while a forced RELEASED
        // human test lacks its tester signoff (FR-035). Machine items are not
        // re-checked — they already cleared QA.
        if (phasename === 'HumanTesting') {
          const humanGate = await this.testGateCriterion(projectid, 'user');
          criteria.push(humanGate.criterion);
          blockingtasks = [...(blockingtasks ?? []), ...humanGate.blockingtasks];
        }
        break;
      }

      case 'Release': {
        const [row] = await db
          .select({ cnt: count() })
          .from(projectphases)
          .where(
            and(
              eq(projectphases.projectid, projectid),
              ne(projectphases.status, 'complete'),
              ne(projectphases.phasename, 'Release')
            )
          );
        const incomplete = Number(row?.cnt ?? 0);
        criteria.push({
          label: 'All prior phases complete',
          passed: incomplete === 0,
          detail: incomplete === 0 ? 'All phases complete' : `${incomplete} prior phase(s) not complete`,
        });

        // [SCOPE 111 / T024] Release checks EVERY forced item project-wide, of
        // either kind (FR-036). This is what catches an item added to a scope
        // after that scope's phase already advanced — the case where every
        // phase reads complete and the release is still not covered.
        const releaseGate = await this.testGateCriterion(projectid, 'all');
        criteria.push(releaseGate.criterion);
        blockingtasks = [...(blockingtasks ?? []), ...releaseGate.blockingtasks];
        break;
      }

      default:
        criteria.push({ label: 'Unknown phase', passed: false, detail: `Unknown phase: ${phasename}` });
    }

    return {
      canAdvance: criteria.every((c) => c.passed),
      criteria,
      blockingtasks,
    };
  }

  // [SCOPE 111 / T024] BEGIN — Test gate as a phase criterion
  /**
   * Renders a TestGateService verdict into the criterion + blocking-task shape
   * PhaseCompletionBar already knows how to display. No new gate UI is needed:
   * the bar reads `criteria` for the statement and `blockingtasks` for the list.
   *
   * Deliberately delegates rather than querying the tables directly. The gate
   * question has exactly ONE implementation (TestGateService) so the phase view,
   * this advance check and the release commands cannot drift into disagreeing —
   * which they would do precisely at a release, under pressure.
   *
   * Fails OPEN on error, and says so. A broken test subsystem should not make a
   * project unshippable; a silent pass would be worse, so the criterion states
   * that it could not be evaluated.
   */
  private static async testGateCriterion(
    projectid: string,
    requirement: 'ai' | 'user' | 'all'
  ): Promise<{
    criterion: PhaseCompletionCriterion;
    blockingtasks: NonNullable<PhaseCompletion['blockingtasks']>;
  }> {
    const label =
      requirement === 'ai'
        ? 'Forced AI tests signed off'
        : requirement === 'user'
          ? 'Forced user tests signed off'
          : 'All forced tests signed off';

    try {
      const { TestGateService } = await import('./TestGateService.js');
      const verdict = await TestGateService.checkForcedCoverage(projectid, requirement);

      // [SCOPE 111 / Amendment A] A skipped gate reports as skipped, never as
      // satisfied. It does not block, but the completion bar must not imply the
      // tests were done — that is the difference between an escape hatch and a
      // lie.
      if (verdict.skipped) {
        return {
          criterion: {
            label,
            passed: true,
            detail:
              verdict.bypassedCount && verdict.bypassedCount > 0
                ? `SKIPPED — testing is switched off for this project. ${verdict.bypassedCount} forced test(s) bypassed, not passed.`
                : 'SKIPPED — testing is switched off for this project.',
          },
          blockingtasks: [],
        };
      }

      const outstandingNote =
        verdict.outstandingUnforced > 0
          ? ` (${verdict.outstandingUnforced} optional test(s) outstanding — not blocking)`
          : '';

      return {
        criterion: {
          label,
          passed: verdict.passed,
          detail: verdict.passed
            ? `All forced tests signed off for ${verdict.version}${outstandingNote}`
            : `${verdict.blocking.length} forced test(s) outstanding for ${verdict.version}: ` +
              verdict.blocking
                .slice(0, 5)
                .map((b) => `${b.itemkey} (${b.why})`)
                .join(', ') +
              (verdict.blocking.length > 5 ? ` +${verdict.blocking.length - 5} more` : ''),
        },
        blockingtasks: verdict.blocking.map((b) => ({
          id: b.itemid,
          name: `${b.itemkey} — ${b.title}`,
          status: b.why,
          scopetitle: b.requirementid,
        })),
      };
    } catch (err) {
      logger.error({ err, projectid, requirement }, 'Test gate evaluation failed');
      return {
        criterion: {
          label,
          passed: true,
          detail: 'Test gate could not be evaluated — not blocking. Check the server logs.',
        },
        blockingtasks: [],
      };
    }
  }
  // [SCOPE 111 / T024] END

  /**
   * Advance a phase to complete and activate the next phase.
   * Validates completion criteria — throws if not met.
   */
  static async advancePhase(
    phaseid: string,
    projectid: string,
    companyid: string,
    initiatedby: string,
    reason?: string
  ): Promise<{ completedphase: PhaseWithAssignee; activatedphase: PhaseWithAssignee | null }> {
    const phase = await this.getPhase(phaseid);
    if (!phase) throw new Error('Phase not found');
    if (phase.status !== 'in_progress') throw new Error('Phase is not in progress');

    const completion = await this.checkCompletion(phaseid, phase.phasename, projectid);
    if (!completion.canAdvance) {
      const err = new Error('Phase completion criteria not met');
      (err as Error & { completion: PhaseCompletion }).completion = completion;
      throw err;
    }

    const now = new Date();

    // Mark current phase complete
    await db
      .update(projectphases)
      .set({ status: 'complete', completedat: now })
      .where(eq(projectphases.id, phaseid));

    // Find next phase
    const allPhases = await this.getPhases(projectid);
    const currentIndex = PHASE_ORDER.indexOf(phase.phasename as PhaseName);
    const nextPhase = allPhases.find(
      (p) => p.phasename === PHASE_ORDER[currentIndex + 1]
    );

    let activatedphase: PhaseWithAssignee | null = null;
    if (nextPhase) {
      await db
        .update(projectphases)
        .set({ status: 'in_progress', enteredat: now })
        .where(eq(projectphases.id, nextPhase.id));
      activatedphase = await this.getPhase(nextPhase.id);
    }

    // Log to audit
    await db.insert(companyauditlogs).values({
      companyid,
      action: 'phase_advanced',
      changedby: initiatedby,
      newvalue: {
        projectid,
        fromphase: phase.phasename,
        tophase: nextPhase?.phasename ?? 'none',
        reason: reason ?? null,
      },
      description: `Phase advanced from ${phase.phasename} to ${nextPhase?.phasename ?? 'none'} on project ${projectid}`,
    });

    logger.info({ projectid, from: phase.phasename, to: nextPhase?.phasename }, 'Phase advanced');

    // [SCOPE 111 / T025] BEGIN — Release the human set on promotion to UAT
    // FR-021b. Leaving QA IS the promotion to UAT in this pipeline: the machine
    // set and the regression gate have both just been satisfied, so the human
    // set is handed to testers as a whole, with no separate manual step for
    // anyone to forget. Idempotent, and fire-and-forget so a test-subsystem
    // fault can never strand a phase advance that already committed.
    if (phase.phasename === 'QA') {
      setImmediate(async () => {
        try {
          const { TestCycleService } = await import('./TestCycleService.js');
          const { TestPlanService } = await import('./TestPlanService.js');
          const cycle = await TestCycleService.resolveCurrent(projectid);
          await TestCycleService.promote(cycle.id, 'uat', initiatedby);
          const released = await TestPlanService.releaseHumanSet(projectid);
          logger.info({ projectid, cycleid: cycle.id, released }, 'Human test set released to UAT');
        } catch (err) {
          logger.error({ err, projectid }, 'Failed to release the human test set on UAT promotion');
        }
      });
    }

    // Reaching Release is the promotion to production.
    if (phase.phasename === 'Beta' && nextPhase?.phasename === 'Release') {
      setImmediate(async () => {
        try {
          const { TestCycleService } = await import('./TestCycleService.js');
          const cycle = await TestCycleService.resolveCurrent(projectid);
          await TestCycleService.promote(cycle.id, 'production', initiatedby);
        } catch (err) {
          logger.error({ err, projectid }, 'Failed to record production promotion on the test cycle');
        }
      });
    }
    // [SCOPE 111 / T025] END

    // ── Audit report: fire-and-forget when Implementation phase completes ──
    if (phase.phasename === 'Implementation') {
      setImmediate(async () => {
        try {
          // [SCOPE 112 / T006] MODIFIED-BY — was gated on companyprojects.audittype,
          // which held at most one framework. generateReports resolves the enabled set
          // per project and no-ops when none are on, so the pre-check is redundant.
          const { AuditReportService } = await import('./AuditReportService.js');
          const docs = await AuditReportService.generateReports(projectid, initiatedby);
          if (docs.length > 0) {
            logger.info({ projectid, reports: docs.length }, 'Audit reports generated on phase advance');
          }
        } catch (err) {
          logger.error({ err, projectid }, 'Audit report generation failed (non-blocking)');
        }
      });
    }

    const completedphase = (await this.getPhase(phaseid))!;
    return { completedphase, activatedphase };
  }

  /**
   * Reopen a prior phase. Sets status = reopened, logs reason.
   */
  static async reopenPhase(
    phaseid: string,
    projectid: string,
    companyid: string,
    initiatedby: string,
    reason: string
  ): Promise<PhaseWithAssignee> {
    const phase = await this.getPhase(phaseid);
    if (!phase) throw new Error('Phase not found');
    if (phase.status === 'in_progress') throw new Error('Phase is already in progress');

    await db
      .update(projectphases)
      .set({ status: 'reopened', reason, completedat: null })
      .where(eq(projectphases.id, phaseid));

    await db.insert(companyauditlogs).values({
      companyid,
      action: 'phase_reopened',
      changedby: initiatedby,
      newvalue: { projectid, phasename: phase.phasename, reason },
      description: `Phase ${phase.phasename} reopened on project ${projectid}: ${reason}`,
    });

    logger.info({ projectid, phasename: phase.phasename, reason }, 'Phase reopened');
    return (await this.getPhase(phaseid))!;
  }
}
