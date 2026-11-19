/**
 * Time and Billing API — SPEC-005 (SCOPE-005 Amendments A and B).
 *
 * Mounted at /api/time-billing. Every route requires a signed-in ADMIN of a company on the
 * SMALL_BUSINESS plan or higher (FR-001; SOC 2 CC6.1, CC6.3) and acts only inside the caller's
 * company and the client projects it is engaged on (FR-014). Each state change writes one
 * audit row (FR-013, CC7.2); ACH rows record which fields changed, never their values (FR-012).
 */
import { Router, type NextFunction, type Response } from 'express';
import { z } from 'zod';
import { authenticateToken, requireAuth, type AuthRequest } from '~/server/middleware/auth.js';
import { requireTier } from '~/server/middleware/tier.js';
import { AppError, ValidationError } from '~/server/lib/errors.js';
import { createLogger } from '~/server/lib/logger.js';
import { logAuditEvent, type AuditAction, type ResourceType } from '~/server/services/AuditService.js';
import { AgentRunPullService } from '~/server/services/AgentRunPullService.js';
import { isAgentRunsAvailable } from '~/server/services/AgentRunSource.js';
import { TimeBillingCustomerService } from '~/server/services/TimeBillingCustomerService.js';
import { listEntries } from '~/server/services/TimeBillingEntryList.js';
import { TimeBillingEntryService } from '~/server/services/TimeBillingEntryService.js';
import { TimeBillingProjectAccess } from '~/server/services/TimeBillingProjectAccess.js';
import { currentWeekRange, setProjectBilled, TimeBillingService } from '~/server/services/TimeBillingService.js';
import { checkRate, TimeBillingSettingsService } from '~/server/services/TimeBillingSettingsService.js';
import { TimeBillingStatementService } from '~/server/services/TimeBillingStatementService.js';
import { renderStatementPdf } from '~/server/services/TimeBillingStatementPdf.js';
import { TimeBillingTimerService } from '~/server/services/TimeBillingTimerService.js';
import type { ProjectTimeEntry } from '~/db/schema/projecttimeentry.js';
import type { TimeBillingStatus } from '~/shared/types/timeBilling.js';

const router = Router();
const logger = createLogger('time-billing-routes');

// [SCOPE 005 / T012] BEGIN — guard, error mapping and audit helpers (FR-001, FR-013)
/** CC6.3: explicit role guard on every route, enforced on the server (FR-001). */
function requireCompanyAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
  if (req.usertype !== 'ADMIN' || !req.companyid || !req.userid) {
    logger.warn({ userid: req.userid, usertype: req.usertype }, 'Time and Billing refused: not a company ADMIN');
    res.status(403).json({ error: 'Only a company ADMIN can use Time & Billing', code: 'INSUFFICIENT_PERMISSIONS' });
    return;
  }
  next();
}

router.use(authenticateToken, requireAuth, requireTier('SMALL_BUSINESS'), requireCompanyAdmin);

interface Caller {
  companyid: string;
  userid: string;
}

function caller(req: AuthRequest): Caller {
  // requireCompanyAdmin has already refused a request without these.
  return { companyid: req.companyid ?? '', userid: req.userid ?? '' };
}

/**
 * Run a handler and turn the services' errors into responses. The services throw the
 * src/server/lib/errors.ts classes, which the global error handler does not recognize (it
 * knows only its own AppError), so without this every 400/404/409 would surface as a 500.
 */
function handle(fn: (req: AuthRequest, res: Response) => Promise<void>) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    fn(req, res).catch((err: unknown) => {
      if (err instanceof AppError) {
        res.status(err.statusCode).json({ error: err.message, code: err.code });
        return;
      }
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: err.issues });
        return;
      }
      if (err instanceof RangeError) {
        res.status(400).json({ error: err.message, code: 'VALIDATION_ERROR' });
        return;
      }
      next(err);
    });
  };
}

function audit(
  req: AuthRequest,
  action: AuditAction,
  resourceType: ResourceType,
  resourceId: string,
  details: Record<string, unknown>,
): void {
  const { companyid, userid } = caller(req);
  void logAuditEvent({
    companyId: companyid,
    userId: userid,
    action,
    resourceType,
    resourceId,
    details,
    ipAddress: req.ip,
    status: 'success',
  });
}

/** The audit view of an entry: what it is and how long, never its note text. */
function entryAudit(e: ProjectTimeEntry): Record<string, unknown> {
  return {
    projectid: e.projectid,
    specid: e.specid,
    line: e.line,
    category: e.category,
    workdate: e.workdate,
    minutes: e.duration,
    userid: e.userid,
    model: e.model,
    entryrate: e.entryrate,
    source: e.source,
    hasnotes: e.notes !== null && e.notes.length > 0,
  };
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Dates are YYYY-MM-DD');
const bool = z.enum(['true', 'false']).transform((v) => v === 'true');
const idParams = z.object({ id: z.uuid() });
const rate = z.string().max(20);
// [SCOPE 005 / T012] END

// [SCOPE 143 / T027] BEGIN — automatic agent-run pull before the page range and a statement (SPEC-005 Amendment E, SPEC-143 FR-014)
/**
 * D4: agent time reaches the page without a manual pull. Before GET /projects (the page loading
 * its date range) every day in that range with runs billed to the caller's company is pulled;
 * before POST /statements the statement period is pulled, so the statement carries the agent
 * time. Repeat-safe (idx_projecttimeentries_agentpull); entries already on a statement are
 * left alone. A failed pull never blocks the page (it is logged); it does block a statement,
 * which must not be generated without its agent time.
 */
const autoPullRange = z.object({ from: isoDate, to: isoDate });

async function autoPullAgentRuns(req: AuthRequest, _res: Response, next: NextFunction): Promise<void> {
  const isPage = req.method === 'GET' && req.path === '/projects';
  const isStatement = req.method === 'POST' && req.path === '/statements';
  if (!isPage && !isStatement) {
    next();
    return;
  }
  const week = currentWeekRange(todayUtc());
  const range = isPage
    ? autoPullRange.safeParse({ from: req.query.from ?? week.from, to: req.query.to ?? week.to })
    : autoPullRange.safeParse({ from: req.body?.periodstart, to: req.body?.periodend });
  if (!range.success) {
    next(); // the route's own validation answers 400
    return;
  }
  const { companyid, userid } = caller(req);
  try {
    const result = await AgentRunPullService.pullRange(companyid, userid, range.data.from, range.data.to);
    if (result.available && result.upserted > 0) {
      audit(req, 'TIMEBILLING_AGENT_TIME_PULLED', 'timeentry', `${range.data.from}..${range.data.to}`, { ...result, automatic: true });
    }
    next();
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : 'unknown', isStatement }, 'Automatic agent-run pull failed');
    if (isStatement) next(err);
    else next();
  }
}

router.use((req: AuthRequest, res: Response, next: NextFunction) => {
  void autoPullAgentRuns(req, res, next);
});
// [SCOPE 143 / T027] END

// [SCOPE 005 / T012] BEGIN — status and projects: list, billed flag, Customer, rate overrides (FR-002, FR-007, FR-008, FR-014)
router.get(
  '/status',
  handle(async (_req, res) => {
    const body: TimeBillingStatus = { agentRunsAvailable: await isAgentRunsAvailable() };
    res.json(body);
  }),
);

const rangeQuery = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  includeInvoiced: bool.optional(),
});

router.get(
  '/projects',
  handle(async (req, res) => {
    const q = rangeQuery.parse(req.query);
    const week = currentWeekRange(todayUtc());
    const result = await TimeBillingService.getProjects(caller(req).companyid, {
      from: q.from ?? week.from,
      to: q.to ?? week.to,
      includeInvoiced: q.includeInvoiced ?? false,
    });
    res.json(result);
  }),
);

router.patch(
  '/projects/:id/billed',
  handle(async (req, res) => {
    const { id } = idParams.parse(req.params);
    const { billed } = z.strictObject({ billed: z.boolean() }).parse(req.body);
    const { companyid, userid } = caller(req);
    const project = await TimeBillingProjectAccess.resolve(companyid, id);
    let before: boolean;
    if (project.engaged) {
      before = project.billed;
      await TimeBillingProjectAccess.upsertEngaged(companyid, userid, project, { billed });
    } else {
      before = (await setProjectBilled(companyid, id, billed)).before;
    }
    audit(req, 'TIMEBILLING_PROJECT_BILLED_CHANGED', 'project', id, {
      engaged: project.engaged,
      before: { billed: before },
      after: { billed },
    });
    res.json({ projectid: id, billed });
  }),
);

router.patch(
  '/projects/:id/customer',
  handle(async (req, res) => {
    const { id } = idParams.parse(req.params);
    const { customerid } = z.strictObject({ customerid: z.uuid().nullable() }).parse(req.body);
    const { companyid, userid } = caller(req);
    const project = await TimeBillingProjectAccess.resolve(companyid, id);
    if (!project.engaged) {
      throw new ValidationError("An own project's Customer is set on the project itself");
    }
    await TimeBillingProjectAccess.upsertEngaged(companyid, userid, project, { customerid });
    audit(req, 'TIMEBILLING_PROJECT_CUSTOMER_CHANGED', 'project', id, {
      engaged: true,
      before: { customerid: project.customerid },
      after: { customerid },
    });
    res.json({ projectid: id, customerid });
  }),
);

router.patch(
  '/projects/:id/rates',
  handle(async (req, res) => {
    const { id } = idParams.parse(req.params);
    const body = z
      .strictObject({ developerRate: rate.nullable().optional(), resourceRate: rate.nullable().optional() })
      .parse(req.body);
    const { companyid, userid } = caller(req);
    const project = await TimeBillingProjectAccess.resolve(companyid, id);
    let before: { developerRate: string | null; resourceRate: string | null };
    let after: { developerRate: string | null; resourceRate: string | null };
    if (project.engaged) {
      if (body.developerRate === undefined && body.resourceRate === undefined) {
        throw new ValidationError('Nothing to update');
      }
      before = { developerRate: project.hourlyrate, resourceRate: project.resourcerate };
      const hourlyrate =
        body.developerRate === undefined ? undefined : body.developerRate === null ? null : checkRate(body.developerRate, 'Developer rate');
      const resourcerate =
        body.resourceRate === undefined ? undefined : body.resourceRate === null ? null : checkRate(body.resourceRate, 'Resource rate');
      await TimeBillingProjectAccess.upsertEngaged(companyid, userid, project, { hourlyrate, resourcerate });
      after = {
        developerRate: hourlyrate === undefined ? before.developerRate : hourlyrate,
        resourceRate: resourcerate === undefined ? before.resourceRate : resourcerate,
      };
    } else {
      const r = await TimeBillingSettingsService.updateProjectRates(companyid, id, body);
      before = { developerRate: r.before.developerRate, resourceRate: r.before.resourceRate };
      after = { developerRate: r.after.developerRate, resourceRate: r.after.resourceRate };
    }
    audit(req, 'TIMEBILLING_RATES_CHANGED', 'project', id, { engaged: project.engaged, before, after });
    res.json({ projectid: id, ...after });
  }),
);
// [SCOPE 005 / T012] END

// [SCOPE 005 / T012] BEGIN — entries: list, create, edit, delete with 409 on invoiced (FR-005, FR-011)
router.get(
  '/entries',
  handle(async (req, res) => {
    const q = rangeQuery.extend({ projectid: z.uuid() }).parse(req.query);
    const week = currentWeekRange(todayUtc());
    const entries = await listEntries(caller(req).companyid, q.projectid, {
      from: q.from ?? week.from,
      to: q.to ?? week.to,
      includeInvoiced: q.includeInvoiced ?? false,
    });
    res.json({ entries });
  }),
);

const entryBody = z.strictObject({
  projectid: z.uuid(),
  // [SCOPE 005 / T027] Amendment D: dba, management and meeting (Developer-only; the service enforces the category).
  line: z.enum(['scope', 'brainstorm', 'process', 'dba', 'management', 'meeting']),
  specid: z.uuid().nullable(),
  category: z.enum(['developer', 'resource']),
  userid: z.uuid().nullable(),
  model: z.string().max(100).nullable(),
  workdate: isoDate,
  minutes: z.number().int(),
  notes: z.string().max(4000).nullable(),
});

router.post(
  '/entries',
  handle(async (req, res) => {
    const input = entryBody.parse(req.body);
    const { companyid, userid } = caller(req);
    const created = await TimeBillingEntryService.create(companyid, userid, input);
    audit(req, 'TIMEBILLING_ENTRY_CREATED', 'timeentry', created.id, { after: entryAudit(created) });
    res.status(201).json({ entry: created });
  }),
);

const entryPatch = z.strictObject({
  workdate: isoDate.optional(),
  minutes: z.number().int().optional(),
  notes: z.string().max(4000).nullable().optional(),
  userid: z.uuid().optional(),
  model: z.string().max(100).optional(),
});

router.patch(
  '/entries/:id',
  handle(async (req, res) => {
    const { id } = idParams.parse(req.params);
    const patch = entryPatch.parse(req.body);
    const { before, after } = await TimeBillingEntryService.update(caller(req).companyid, id, patch);
    audit(req, 'TIMEBILLING_ENTRY_UPDATED', 'timeentry', id, { before: entryAudit(before), after: entryAudit(after) });
    res.json({ entry: after });
  }),
);

router.delete(
  '/entries/:id',
  handle(async (req, res) => {
    const { id } = idParams.parse(req.params);
    const before = await TimeBillingEntryService.remove(caller(req).companyid, id);
    audit(req, 'TIMEBILLING_ENTRY_DELETED', 'timeentry', id, { before: entryAudit(before) });
    res.status(204).end();
  }),
);
// [SCOPE 005 / T012] END

// [SCOPE 005 / T012] BEGIN — side timer and agent-run pull (FR-006, FR-007)
router.get(
  '/timer',
  handle(async (req, res) => {
    const { companyid, userid } = caller(req);
    res.json({ timer: await TimeBillingTimerService.getRunning(companyid, userid) });
  }),
);

router.post(
  '/timer/start',
  handle(async (req, res) => {
    const input = z
      .strictObject({
        projectid: z.uuid(),
        // [SCOPE 005 / T027] Amendment D lines; the timer service still refuses 'process'.
        line: z.enum(['scope', 'brainstorm', 'process', 'dba', 'management', 'meeting']),
        specid: z.uuid().nullable(),
        workdate: isoDate.optional(),
      })
      .parse(req.body);
    const { companyid, userid } = caller(req);
    const entry = await TimeBillingTimerService.start(companyid, userid, input);
    res.status(201).json({ entry });
  }),
);

router.get(
  '/timer/notes',
  handle(async (req, res) => {
    const { companyid, userid } = caller(req);
    res.json(await TimeBillingTimerService.notes(companyid, userid));
  }),
);

// [SCOPE 005 / T029] Pause and Resume continue ONE entry (Amendment F). Like start, they write no
// audit row: Stop stays the entry's one creation record. A wrong state is 409, no timer is 404.
router.post(
  '/timer/pause',
  handle(async (req, res) => {
    const { companyid, userid } = caller(req);
    res.json({ timer: await TimeBillingTimerService.pause(companyid, userid) });
  }),
);

router.post(
  '/timer/resume',
  handle(async (req, res) => {
    const { companyid, userid } = caller(req);
    res.json({ timer: await TimeBillingTimerService.resume(companyid, userid) });
  }),
);

router.post(
  '/timer/stop',
  handle(async (req, res) => {
    const { manualNotes } = z.strictObject({ manualNotes: z.string().max(4000).nullable().optional() }).parse(req.body ?? {});
    const { companyid, userid } = caller(req);
    const entry = await TimeBillingTimerService.stop(companyid, userid, { manualNotes });
    // The entry becomes billable time when the timer stops; that is its one creation record.
    audit(req, 'TIMEBILLING_ENTRY_CREATED', 'timeentry', entry.id, { after: entryAudit(entry) });
    res.json({ entry });
  }),
);

router.post(
  '/agent-pull',
  handle(async (req, res) => {
    const { date } = z.object({ date: isoDate }).parse(req.query);
    const { companyid, userid } = caller(req);
    const result = await AgentRunPullService.pullDay(companyid, userid, date);
    if (result.available && result.upserted > 0) {
      audit(req, 'TIMEBILLING_AGENT_TIME_PULLED', 'timeentry', date, { ...result });
    }
    res.json(result);
  }),
);
// [SCOPE 005 / T012] END

// [SCOPE 005 / T012] BEGIN — settings: company rates and ACH details (FR-008, FR-012)
router.get(
  '/settings',
  handle(async (req, res) => {
    res.json(await TimeBillingSettingsService.get(caller(req).companyid));
  }),
);

const achValue = z.string().max(200).nullable().optional();

router.put(
  '/settings',
  handle(async (req, res) => {
    const patch = z
      .strictObject({
        developerRate: rate.optional(),
        resourceRate: rate.optional(),
        ach: z
          .strictObject({ bankname: achValue, routingnumber: achValue, accountnumber: achValue, accountname: achValue })
          .optional(),
      })
      .parse(req.body);
    const { companyid } = caller(req);
    const { before, after, changed } = await TimeBillingSettingsService.update(companyid, patch);

    const rateFields = changed.filter((c) => !c.startsWith('ach.'));
    const achFields = changed.filter((c) => c.startsWith('ach.')).map((c) => c.slice(4));
    if (rateFields.length > 0) {
      audit(req, 'TIMEBILLING_RATES_CHANGED', 'company', companyid, {
        before: { developerRate: before.developerRate, resourceRate: before.resourceRate },
        after: { developerRate: after.developerRate, resourceRate: after.resourceRate },
      });
    }
    if (achFields.length > 0) {
      // FR-012 / FR-013: which fields changed, never their values.
      audit(req, 'TIMEBILLING_ACH_CHANGED', 'company', companyid, { changed: achFields });
    }
    res.json(after);
  }),
);
// [SCOPE 005 / T012] END

// [SCOPE 005 / T012] BEGIN — Customers and statements (FR-009)
router.get(
  '/customers',
  handle(async (req, res) => {
    res.json({ customers: await TimeBillingCustomerService.list(caller(req).companyid) });
  }),
);

router.patch(
  '/customers/:id/billingcycle',
  handle(async (req, res) => {
    const { id } = idParams.parse(req.params);
    const { billingcycle } = z.strictObject({ billingcycle: z.string() }).parse(req.body);
    const r = await TimeBillingCustomerService.setBillingCycle(caller(req).companyid, id, billingcycle);
    audit(req, 'TIMEBILLING_BILLINGCYCLE_CHANGED', 'customer', id, {
      before: { billingcycle: r.before },
      after: { billingcycle: r.after },
    });
    res.json({ customerid: id, billingcycle: r.after });
  }),
);

router.get(
  '/statements/period',
  handle(async (req, res) => {
    const q = z.object({ customerid: z.uuid(), today: isoDate.optional() }).parse(req.query);
    res.json(await TimeBillingStatementService.getSuggestedPeriod(caller(req).companyid, q.customerid, q.today ?? todayUtc()));
  }),
);

router.post(
  '/statements',
  handle(async (req, res) => {
    const body = z.strictObject({ customerid: z.uuid(), periodstart: isoDate, periodend: isoDate }).parse(req.body);
    const r = await TimeBillingStatementService.generate(caller(req).companyid, body.customerid, body.periodstart, body.periodend);
    audit(req, 'TIMEBILLING_STATEMENT_GENERATED', 'statement', r.invoice.id, {
      customerid: body.customerid,
      periodstart: body.periodstart,
      periodend: body.periodend,
      entries: r.entrycount,
      total: r.page1.total,
    });
    res.status(201).json({
      statementid: r.invoice.id,
      invoicenumber: r.invoice.invoicenumber,
      total: r.page1.total,
      entrycount: r.entrycount,
    });
  }),
);
// [SCOPE 005 / T012] END

// [SCOPE 005 / T011] BEGIN — statement PDF download (FR-009)
router.get(
  '/statements/:id/pdf',
  handle(async (req, res) => {
    const { id } = idParams.parse(req.params);
    const { filename, pdf } = await renderStatementPdf(caller(req).companyid, id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename.replace(/[^A-Za-z0-9._-]/g, '')}"`);
    res.setHeader('Cache-Control', 'no-store'); // carries full ACH details (FR-012)
    res.send(pdf);
  }),
);
// [SCOPE 005 / T011] END

export default router;
