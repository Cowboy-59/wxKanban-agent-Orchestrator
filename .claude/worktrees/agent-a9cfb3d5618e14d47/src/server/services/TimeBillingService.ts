import { db } from '~/db/client.js';
import { companyprojects } from '~/db/schema/companyproject.js';
import { projectspecifications } from '~/db/schema/projectspecification.js';
import { projecttimeentries } from '~/db/schema/projecttimeentry.js';
import { and, asc, eq, gte, inArray, isNotNull, isNull, lte, sql } from 'drizzle-orm';
import { NotFoundError } from '~/server/lib/errors.js';
import { createLogger } from '~/server/lib/logger.js';
import { serializeDbError } from '~/server/lib/dbError.js';
import { minutesToHours } from '~/server/lib/timeBilling.js';
import { TimeBillingProjectAccess } from '~/server/services/TimeBillingProjectAccess.js';
import { DEVELOPER_ONLY_LINES, isTimeLine } from '~/shared/types/timeBilling.js';
import type {
  DeveloperOnlyLine,
  ProjectLines,
  ProjectTimeSummary,
  ScopeTimeLine,
  TimeBillingProjectsResponse,
  TimeCategory,
  TimeLine,
} from '~/shared/types/timeBilling.js';

const logger = createLogger('time-billing');

// [SCOPE 005 / T004] BEGIN — date range helpers (FR-004)
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** True for a real calendar date written YYYY-MM-DD. */
export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/**
 * The default range: the current week, Monday to Sunday, of the given calendar day.
 * Works on the date string in UTC so no timezone can shift the day (constraint 6).
 */
export function currentWeekRange(today: string): { from: string; to: string } {
  if (!isIsoDate(today)) throw new RangeError('today must be YYYY-MM-DD');
  const d = new Date(`${today}T00:00:00Z`);
  const sinceMonday = (d.getUTCDay() + 6) % 7;
  const monday = new Date(d.getTime() - sinceMonday * 86_400_000);
  const sunday = new Date(monday.getTime() + 6 * 86_400_000);
  return { from: monday.toISOString().slice(0, 10), to: sunday.toISOString().slice(0, 10) };
}
// [SCOPE 005 / T004] END

// [SCOPE 005 / T004] BEGIN — buildProjectSummaries: pure assembly of lines and totals (FR-002, FR-003)
// MODIFIED-BY: [SCOPE 005 / T023] — carries engaged / clientname for engaged client projects (FR-014)
// MODIFIED-BY: [SCOPE 005 / T027] — totals for the DBA, Management and Meetings Developer-only lines (Amendment D)
export interface ProjectRow {
  id: string;
  name: string;
  billed: boolean;
  customerid: string | null;
  customername: string | null;
  /** A client company's project reached through an engagement (FR-014). */
  engaged?: boolean;
  clientname?: string | null;
}

export interface ScopeRow {
  id: string;
  projectid: string;
  specnumber: string;
  title: string;
  status: string;
}

export interface MinutesRow {
  projectid: string;
  specid: string | null;
  line: TimeLine;
  category: TimeCategory;
  minutes: number;
}

/**
 * Turn projects, their scopes and the period's summed minutes into the page's rows.
 * Every non-archived scope appears, with zero time if none; an archived or deleted scope
 * appears only when it still carries time, so no recorded minute drops out of a total.
 */
export function buildProjectSummaries(
  projects: ProjectRow[],
  scopes: ScopeRow[],
  minutes: MinutesRow[],
): { projects: ProjectTimeSummary[]; billedTotalMinutes: number } {
  const summaries = projects.map((p): ProjectTimeSummary => {
    const own = minutes.filter((m) => m.projectid === p.id);
    const scopeMinutes = (specid: string | null, category: TimeCategory): number =>
      own
        .filter((m) => m.line === 'scope' && m.specid === specid && m.category === category)
        .reduce((a, m) => a + m.minutes, 0);
    const lineMinutes = (line: TimeLine, category: TimeCategory): number =>
      own.filter((m) => m.line === line && m.category === category).reduce((a, m) => a + m.minutes, 0);

    const toLine = (specid: string | null, specnumber: string | null, title: string, archived: boolean): ScopeTimeLine => {
      const developerMinutes = scopeMinutes(specid, 'developer');
      const resourceMinutes = scopeMinutes(specid, 'resource');
      return {
        specid,
        specnumber,
        title,
        archived,
        developerMinutes,
        resourceMinutes,
        developerHours: minutesToHours(developerMinutes),
        resourceHours: minutesToHours(resourceMinutes),
      };
    };

    const scopeLines: ScopeTimeLine[] = scopes
      .filter((s) => s.projectid === p.id)
      .map((s) => toLine(s.id, s.specnumber, s.title, s.status === 'archived'))
      .filter((l) => !l.archived || l.developerMinutes !== 0 || l.resourceMinutes !== 0);

    if (own.some((m) => m.line === 'scope' && m.specid === null)) {
      scopeLines.push(toLine(null, null, 'Deleted scope', false));
    }

    // Amendment D: Developer-only lines. Every minute counts, whatever the category, so a total
    // never drops a recorded minute even if a row was written outside the page's rules.
    const developerOnly = Object.fromEntries(
      DEVELOPER_ONLY_LINES.map((line) => {
        const m = own.filter((x) => x.line === line).reduce((a, x) => a + x.minutes, 0);
        return [line, { minutes: m, hours: minutesToHours(m) }];
      }),
    ) as Record<DeveloperOnlyLine, { minutes: number; hours: string }>;

    const lines: ProjectLines = {
      brainstormDeveloperMinutes: lineMinutes('brainstorm', 'developer'),
      brainstormResourceMinutes: lineMinutes('brainstorm', 'resource'),
      processResourceMinutes: lineMinutes('process', 'resource'),
      brainstormDeveloperHours: '',
      brainstormResourceHours: '',
      processResourceHours: '',
      developerOnly,
    };
    lines.brainstormDeveloperHours = minutesToHours(lines.brainstormDeveloperMinutes);
    lines.brainstormResourceHours = minutesToHours(lines.brainstormResourceMinutes);
    lines.processResourceHours = minutesToHours(lines.processResourceMinutes);

    const totalMinutes = own.reduce((a, m) => a + m.minutes, 0);
    return {
      projectid: p.id,
      name: p.name,
      billed: p.billed,
      customerid: p.customerid,
      customername: p.customername,
      needsClient: p.billed && p.customerid === null,
      engaged: p.engaged ?? false,
      clientname: p.clientname ?? null,
      scopes: scopeLines,
      lines,
      totalMinutes,
      totalHours: minutesToHours(totalMinutes),
    };
  });

  const billedTotalMinutes = summaries.filter((s) => s.billed).reduce((a, s) => a + s.totalMinutes, 0);
  return { projects: summaries, billedTotalMinutes };
}
// [SCOPE 005 / T004] END

// [SCOPE 005 / T004] BEGIN — TimeBillingService.getProjects: projects, lines and totals for a range
// MODIFIED-BY: [SCOPE 005 / T023] — the project list comes from TimeBillingProjectAccess: own projects plus engaged client projects (FR-002, FR-014)
// MODIFIED-BY: [SCOPE 005 / T027] — accepts the Amendment D line values through the shared isTimeLine
export class TimeBillingService {
  /**
   * Every project the caller's company may bill — its own and, for a consulting company, the
   * client projects it is engaged on (FR-014) — with its scope and project lines and totals
   * for [from, to] (inclusive, by workdate). Only Time and Billing entries count (category
   * set); legacy task-timer entries are excluded (constraint 3). Invoiced entries are left out
   * unless includeInvoiced (FR-004). Only the caller's own entries are counted
   * (projecttimeentries.companyid), so a client's own time on an engaged project never shows.
   */
  static async getProjects(
    companyid: string,
    range: { from: string; to: string; includeInvoiced: boolean },
  ): Promise<TimeBillingProjectsResponse> {
    if (!isIsoDate(range.from) || !isIsoDate(range.to) || range.from > range.to) {
      throw new RangeError('from and to must be YYYY-MM-DD with from <= to');
    }

    try {
      const projects: ProjectRow[] = (await TimeBillingProjectAccess.list(companyid)).map((p) => ({
        id: p.id,
        name: p.name,
        billed: p.billed,
        customerid: p.customerid,
        customername: p.customername,
        engaged: p.engaged,
        clientname: p.clientname,
      }));

      if (projects.length === 0) {
        return { ...range, projects: [], billedTotalMinutes: 0, billedTotalHours: minutesToHours(0) };
      }
      const projectIds = projects.map((p) => p.id);

      const scopes: ScopeRow[] = await db
        .select({
          id: projectspecifications.id,
          projectid: projectspecifications.projectid,
          specnumber: projectspecifications.specnumber,
          title: projectspecifications.title,
          status: projectspecifications.status,
        })
        .from(projectspecifications)
        .where(inArray(projectspecifications.projectid, projectIds))
        .orderBy(asc(projectspecifications.specnumber));

      const minutesRows = await db
        .select({
          projectid: projecttimeentries.projectid,
          specid: projecttimeentries.specid,
          line: projecttimeentries.line,
          category: projecttimeentries.category,
          minutes: sql<number>`COALESCE(SUM(${projecttimeentries.duration}), 0)::int`,
        })
        .from(projecttimeentries)
        .where(
          and(
            eq(projecttimeentries.companyid, companyid),
            inArray(projecttimeentries.projectid, projectIds),
            isNotNull(projecttimeentries.category),
            isNotNull(projecttimeentries.line),
            gte(projecttimeentries.workdate, range.from),
            lte(projecttimeentries.workdate, range.to),
            range.includeInvoiced ? undefined : isNull(projecttimeentries.invoiceid),
          ),
        )
        .groupBy(
          projecttimeentries.projectid,
          projecttimeentries.specid,
          projecttimeentries.line,
          projecttimeentries.category,
        );

      const minutes: MinutesRow[] = minutesRows.flatMap((r) =>
        isCategory(r.category) && isTimeLine(r.line)
          ? [{ projectid: r.projectid, specid: r.specid, line: r.line, category: r.category, minutes: Number(r.minutes) }]
          : [],
      );

      const built = buildProjectSummaries(projects, scopes, minutes);
      return {
        ...range,
        projects: built.projects,
        billedTotalMinutes: built.billedTotalMinutes,
        billedTotalHours: minutesToHours(built.billedTotalMinutes),
      };
    } catch (error) {
      logger.error({ error: serializeDbError(error), companyid }, 'Failed to load Time and Billing projects');
      throw error;
    }
  }
}

function isCategory(v: string | null): v is TimeCategory {
  return v === 'developer' || v === 'resource';
}
// [SCOPE 005 / T004] END

// [SCOPE 005 / T012] BEGIN — setProjectBilled: toggle "Bill this project" inside the caller's company (FR-002)
/**
 * Set a project's billed flag. A project of another company is reported as not found (404),
 * never as forbidden, so ids from other tenants reveal nothing. Returns before/after for the
 * audit record (FR-013). Own projects only: an engaged client project's flag lives on
 * projectbillings (TimeBillingProjectAccess.upsertEngaged, FR-014).
 */
export async function setProjectBilled(
  companyid: string,
  projectid: string,
  billed: boolean,
): Promise<{ before: boolean; after: boolean; name: string }> {
  const [current] = await db
    .select({ billed: companyprojects.billed, name: companyprojects.name })
    .from(companyprojects)
    .where(and(eq(companyprojects.id, projectid), eq(companyprojects.companyid, companyid)))
    .limit(1);
  if (!current) throw new NotFoundError('Project');

  const [updated] = await db
    .update(companyprojects)
    .set({ billed })
    .where(and(eq(companyprojects.id, projectid), eq(companyprojects.companyid, companyid)))
    .returning({ billed: companyprojects.billed });
  if (!updated) throw new NotFoundError('Project');

  logger.info({ companyid, projectid, billed: updated.billed }, 'Project billed flag set');
  return { before: current.billed, after: updated.billed, name: current.name };
}
// [SCOPE 005 / T012] END
