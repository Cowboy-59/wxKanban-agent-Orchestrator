import { db } from '~/db/client.js';
import { companyprojects } from '~/db/schema/companyproject.js';
import { feedbacksubmissions } from '~/db/schema/feedbacksubmissions.js';
import { projectinvoices } from '~/db/schema/projectinvoice.js';
import { projectspecifications } from '~/db/schema/projectspecification.js';
import { projecttasks } from '~/db/schema/projecttask.js';
import { projecttimeentries } from '~/db/schema/projecttimeentry.js';
import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { NotFoundError } from '~/server/lib/errors.js';
import { createLogger } from '~/server/lib/logger.js';
import { minutesToHours } from '~/server/lib/timeBilling.js';

const logger = createLogger('time-billing-summary');

// [SCOPE 005 / T010] BEGIN — statement page 2: Items Done, grouped and fitted to a page (FR-010)
// MODIFIED-BY: [SCOPE 005 / T027] — DBA, Management and Meetings groups, one item per project (Amendment D)
/** Most item lines page 2 shows across all groups; the rest collapse into "+N more". */
export const MAX_SUMMARY_LINES = 18;
/** Every group keeps at least this many of its top items when trimming. */
export const MIN_LINES_PER_GROUP = 2;
const MAX_NAME_LENGTH = 80;

export type SummaryGroupKey = 'scopes' | 'bugs' | 'processes' | 'brainstorms' | 'dba' | 'management' | 'meetings';

/** Amendment D: the Developer-only line each group collects, and its item label. */
const PROJECT_LINE_GROUPS: ReadonlyArray<{ line: string; group: SummaryGroupKey; label: string }> = [
  { line: 'brainstorm', group: 'brainstorms', label: 'Brainstorming' },
  { line: 'dba', group: 'dba', label: 'DBA' },
  { line: 'management', group: 'management', label: 'Management' },
  { line: 'meeting', group: 'meetings', label: 'Meetings' },
];

export interface SummaryItem {
  name: string;
  /** Minutes; null for a resolved feedback report (no hours, shown as "—"). */
  minutes: number | null;
  hours: string | null;
}

export interface SummaryGroup {
  key: SummaryGroupKey;
  /** The visible lines, highest hours first. */
  items: SummaryItem[];
  /** Includes the items folded into `more`. */
  minutes: number;
  hours: string;
  /** Items trimmed to fit the page, rendered as "+N more (X.XX hrs)". */
  more: { count: number; minutes: number; hours: string } | null;
}

export interface StatementSummary {
  groups: SummaryGroup[];
  totalminutes: number;
  totalhours: string;
}

/** One time entry locked to the statement, with the names its item needs. */
export interface SummaryEntry {
  /** Minutes, a multiple of 15; negative for a correction. */
  duration: number;
  line: string | null;
  taskid: string | null;
  issuetype: string | null;
  taskname: string | null;
  specid: string | null;
  specnumber: string | null;
  spectitle: string | null;
  projectid: string;
  projectname: string | null;
}

/** A feedback report resolved in the period on one of the statement's projects. */
export interface SummaryFeedback {
  id: string;
  title: string;
}

const GROUP_ORDER: readonly SummaryGroupKey[] = [
  'scopes',
  'bugs',
  'processes',
  'brainstorms',
  'dba',
  'management',
  'meetings',
];

/** Item names are labels only: no control characters, no line breaks, one line of at most 80. */
export function sanitizeName(raw: string): string {
  const clean = raw
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return clean.length > MAX_NAME_LENGTH ? `${clean.slice(0, MAX_NAME_LENGTH - 1).trimEnd()}…` : clean;
}

interface Acc {
  name: string;
  minutes: number;
  timed: boolean;
}

/**
 * Build page 2 from the entries of one statement. Each entry counts in exactly one item, so
 * the page-2 hours equal the page-1 hours: a bug task first, else the spec (scope line), else
 * the project's Brainstorming, DBA, Management or Meetings item, else its Processes item. Items
 * netting to zero are dropped. Notes are never read. Resolved feedback adds untimed bug lines.
 * Throws if the groups do not add up to the entries.
 */
export function buildStatementSummary(
  entries: readonly SummaryEntry[],
  feedback: readonly SummaryFeedback[],
): StatementSummary {
  const buckets: Record<SummaryGroupKey, Map<string, Acc>> = {
    scopes: new Map(),
    bugs: new Map(),
    processes: new Map(),
    brainstorms: new Map(),
    dba: new Map(),
    management: new Map(),
    meetings: new Map(),
  };
  const add = (group: SummaryGroupKey, key: string, name: string, minutes: number): void => {
    const map = buckets[group];
    const acc = map.get(key);
    if (acc) acc.minutes += minutes;
    else map.set(key, { name, minutes, timed: true });
  };

  let entryMinutes = 0;
  for (const e of entries) {
    entryMinutes += e.duration;
    const project = e.projectname ?? 'Project';
    const projectLine = PROJECT_LINE_GROUPS.find((g) => g.line === e.line);
    if (e.taskid && e.issuetype === 'bug') {
      add('bugs', `t:${e.taskid}`, sanitizeName(e.taskname ?? 'Bug'), e.duration);
    } else if (e.line === 'scope' && e.specid) {
      add('scopes', `s:${e.specid}`, sanitizeName(`${e.specnumber ?? ''} ${e.spectitle ?? ''}`), e.duration);
    } else if (projectLine) {
      add(projectLine.group, `p:${e.projectid}`, sanitizeName(`${projectLine.label} – ${project}`), e.duration);
    } else {
      // A process entry, or a scope line with no spec (should not happen): the project's processes.
      add('processes', `p:${e.projectid}`, sanitizeName(`Processes – ${project}`), e.duration);
    }
  }

  const seenFeedback = new Set<string>();
  for (const f of feedback) {
    if (seenFeedback.has(f.id)) continue;
    seenFeedback.add(f.id);
    buckets.bugs.set(`f:${f.id}`, { name: sanitizeName(f.title), minutes: 0, timed: false });
  }

  interface Built {
    key: SummaryGroupKey;
    all: SummaryItem[];
    visible: number;
  }
  const built: Built[] = [];
  for (const key of GROUP_ORDER) {
    const all: SummaryItem[] = [...buckets[key].values()]
      .filter((a) => !a.timed || a.minutes !== 0)
      .sort((a, b) => Number(b.timed) - Number(a.timed) || b.minutes - a.minutes || a.name.localeCompare(b.name))
      .map((a) => ({
        name: a.name,
        minutes: a.timed ? a.minutes : null,
        hours: a.timed ? minutesToHours(a.minutes) : null,
      }));
    if (all.length > 0) built.push({ key, all, visible: all.length });
  }

  // Fit to a page: take the last line off the largest group until the total fits.
  let visibleTotal = built.reduce((s, g) => s + g.visible, 0);
  while (visibleTotal > MAX_SUMMARY_LINES) {
    let target: Built | null = null;
    for (const g of built) {
      if (g.visible > MIN_LINES_PER_GROUP && (!target || g.visible > target.visible)) target = g;
    }
    if (!target) break; // every group is at its minimum; the page runs a little over
    target.visible -= 1;
    visibleTotal -= 1;
  }

  const groups: SummaryGroup[] = built.map((g) => {
    const hidden = g.all.slice(g.visible);
    const hiddenMinutes = hidden.reduce((s, i) => s + (i.minutes ?? 0), 0);
    const minutes = g.all.reduce((s, i) => s + (i.minutes ?? 0), 0);
    return {
      key: g.key,
      items: g.all.slice(0, g.visible),
      minutes,
      hours: minutesToHours(minutes),
      more: hidden.length > 0 ? { count: hidden.length, minutes: hiddenMinutes, hours: minutesToHours(hiddenMinutes) } : null,
    };
  });

  const totalminutes = groups.reduce((s, g) => s + g.minutes, 0);
  if (totalminutes !== entryMinutes) {
    throw new Error('Statement summary does not add up to the statement entries');
  }
  return { groups, totalminutes, totalhours: minutesToHours(totalminutes) };
}
// [SCOPE 005 / T010] END

// [SCOPE 005 / T010] BEGIN — TimeBillingSummaryService: load page 2 for a generated statement (FR-010)
export class TimeBillingSummaryService {
  /** Page 2 of a generated statement, rebuilt from the entries locked to it. */
  static async load(companyid: string, invoiceid: string): Promise<StatementSummary> {
    const [invoice] = await db
      .select({
        id: projectinvoices.id,
        periodstart: projectinvoices.periodstart,
        periodend: projectinvoices.periodend,
      })
      .from(projectinvoices)
      .where(
        and(
          eq(projectinvoices.id, invoiceid),
          eq(projectinvoices.companyid, companyid),
          isNotNull(projectinvoices.customerid),
        ),
      )
      .limit(1);
    if (!invoice) throw new NotFoundError('Statement');

    const rows = await db
      .select({
        duration: projecttimeentries.duration,
        line: projecttimeentries.line,
        taskid: projecttimeentries.taskid,
        issuetype: projecttasks.issuetype,
        taskname: projecttasks.name,
        specid: projecttimeentries.specid,
        specnumber: projectspecifications.specnumber,
        spectitle: projectspecifications.title,
        projectid: projecttimeentries.projectid,
        projectname: companyprojects.name,
      })
      .from(projecttimeentries)
      .leftJoin(projecttasks, eq(projecttasks.id, projecttimeentries.taskid))
      .leftJoin(projectspecifications, eq(projectspecifications.id, projecttimeentries.specid))
      .leftJoin(companyprojects, eq(companyprojects.id, projecttimeentries.projectid))
      .where(and(eq(projecttimeentries.invoiceid, invoiceid), eq(projecttimeentries.companyid, companyid)));
    const entries: SummaryEntry[] = rows.map((r) => ({ ...r, duration: r.duration ?? 0 }));

    const projectids = [...new Set(entries.map((e) => e.projectid))];
    let feedback: SummaryFeedback[] = [];
    if (projectids.length > 0 && invoice.periodstart && invoice.periodend) {
      feedback = await db
        .select({ id: feedbacksubmissions.id, title: feedbacksubmissions.title })
        .from(feedbacksubmissions)
        .innerJoin(companyprojects, eq(companyprojects.id, feedbacksubmissions.projectid))
        .where(
          and(
            inArray(feedbacksubmissions.projectid, projectids),
            eq(companyprojects.companyid, companyid),
            eq(feedbacksubmissions.status, 'resolved'),
            sql`${feedbacksubmissions.updatedat}::date BETWEEN ${invoice.periodstart}::date AND ${invoice.periodend}::date`,
          ),
        );
    }

    const summary = buildStatementSummary(entries, feedback);
    logger.info({ companyid, invoiceid, entries: entries.length, feedback: feedback.length }, 'Statement summary built');
    return summary;
  }
}
// [SCOPE 005 / T010] END
