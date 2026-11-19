import { db } from '~/db/client.js';
import { companies } from '~/db/schema/company.js';
import { eq, sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { createLogger } from '~/server/lib/logger.js';
import { ValidationError } from '~/server/lib/errors.js';
import { resolveRates, roundSecondsUpToQuarterHour } from '~/server/lib/timeBilling.js';
import { isAgentRunsAvailable } from '~/server/services/AgentRunSource.js';
import { TimeBillingProjectAccess } from '~/server/services/TimeBillingProjectAccess.js';
import { isIsoDate } from '~/server/services/TimeBillingService.js';
import type { TimeLine } from '~/shared/types/timeBilling.js';

const logger = createLogger('time-billing-agent-pull');

// [SCOPE 005 / T007] BEGIN — aggregateRuns: one Resource bucket per project, line, scope and model (FR-007, FR-009)
/** One agent run of the day, as read from agentruns (no prompt text, code or file contents exist there). */
export interface DayRun {
  projectid: string;
  /** The scope of the run's task, if the run was tied to a task. */
  specid: string | null;
  command: string | null;
  /** 'session' | 'subagent' | 'command' */
  kind: string;
  aispecsessionid: string | null;
  model: string;
  activeseconds: number | null;
}

export interface ResourceBucket {
  projectid: string;
  line: TimeLine;
  specid: string | null;
  model: string;
  activeseconds: number;
  /** Rounded once for the whole bucket (FR-007). */
  minutes: number;
  /** FR-009: each subagent run is 1 Resource; the main session (session/command turns) is 1. */
  resourcecount: number;
}

/** Which line a run lands on: its task's scope, else Brainstorming for a brainstorm, else Processes. */
export function lineForRun(run: Pick<DayRun, 'specid' | 'command'>): TimeLine {
  if (run.specid) return 'scope';
  if (run.command && /brainstorm/i.test(run.command)) return 'brainstorm';
  return 'process';
}

/**
 * Sum active seconds per (project, line, scope, model) and round each sum up to 15 minutes
 * ONCE: 40 runs totalling 1 h 32 m give 105 minutes, not 40 × 15. Waiting time is never read.
 * Buckets with no active time are dropped.
 */
export function aggregateRuns(runs: readonly DayRun[]): ResourceBucket[] {
  interface Acc {
    bucket: Omit<ResourceBucket, 'minutes' | 'resourcecount'>;
    subagents: number;
    mainSessions: Set<string>;
  }
  const byKey = new Map<string, Acc>();
  for (const run of runs) {
    const line = lineForRun(run);
    const specid = line === 'scope' ? run.specid : null;
    const key = [run.projectid, line, specid ?? '', run.model].join('|');
    let acc = byKey.get(key);
    if (!acc) {
      acc = {
        bucket: { projectid: run.projectid, line, specid, model: run.model, activeseconds: 0 },
        subagents: 0,
        mainSessions: new Set<string>(),
      };
      byKey.set(key, acc);
    }
    acc.bucket.activeseconds += Math.max(0, run.activeseconds ?? 0);
    if (run.kind === 'subagent') acc.subagents += 1;
    else acc.mainSessions.add(run.aispecsessionid ?? 'main');
  }
  return [...byKey.values()]
    .map((a) => ({
      ...a.bucket,
      minutes: roundSecondsUpToQuarterHour(a.bucket.activeseconds),
      resourcecount: a.subagents + a.mainSessions.size,
    }))
    .filter((b) => b.minutes > 0);
}
// [SCOPE 005 / T007] END

// [SCOPE 005 / T007] BEGIN — AgentRunPullService.pullDay: idempotent daily pull into Resource lines (FR-007)
// MODIFIED-BY: [SCOPE 143 / T027] — runs taken by agentruns.companyid (engaged projects included), rates via TimeBillingProjectAccess, company in the conflict key, pullRange for the automatic pull
export interface PullResult {
  /** False while agentruns is not in production: the page runs manual-only and says so. */
  available: boolean;
  workdate: string;
  /** Buckets written or refreshed. */
  upserted: number;
  /** Buckets whose entry is already on a statement, left untouched (FR-011). */
  lockedSkipped: number;
}

/** The automatic pull over a date range (SPEC-005 Amendment E, SPEC-143 FR-014). */
export interface RangePullResult {
  available: boolean;
  /** Days in the range that had runs and were pulled. */
  days: number;
  upserted: number;
  lockedSkipped: number;
}

export class AgentRunPullService {
  /**
   * Pull one day's agent runs billed to the caller's company into Resource entries. The runs are
   * the ones whose agentruns.companyid is the caller's company (set by the server from the
   * sending credential, SPEC-143 FR-017): the caller's own projects and the client projects it is
   * engaged on. A client company's own runs on that project stay the client's.
   *
   * One entry per (company, project, line, scope, day, model), keyed by
   * idx_projecttimeentries_agentpull (migration 0076), so a re-run refreshes the same rows and
   * never duplicates them. An entry already on a statement is never changed. Comparison runs
   * (neverbilled) are excluded. The Resource rate in force is snapshotted when the entry is
   * first created and kept on refresh.
   *
   * The day is the run's stored starttime date. Every run in a day must be on the same clock as
   * the writer recorded it; the date is compared in SQL, never converted in this process.
   */
  static async pullDay(companyid: string, actorid: string, workdate: string): Promise<PullResult> {
    if (!isIsoDate(workdate)) throw new ValidationError('Date must be YYYY-MM-DD');
    if (!(await isAgentRunsAvailable())) {
      return { available: false, workdate, upserted: 0, lockedSkipped: 0 };
    }

    const result = await db.execute(sql`
      SELECT r.projectid        AS projectid,
             t.specid           AS specid,
             r.command          AS command,
             r.kind             AS kind,
             r.aispecsessionid  AS aispecsessionid,
             r.model            AS model,
             r.activeseconds    AS activeseconds
        FROM agentruns r
        LEFT JOIN projecttasks t ON t.id = r.taskid
       WHERE r.companyid = ${companyid}
         AND r.neverbilled = false
         AND r.starttime >= ${workdate}::date
         AND r.starttime <  (${workdate}::date + 1)
    `);
    const runs = (result.rows as Array<Record<string, unknown>>).map(toDayRun);
    const buckets = aggregateRuns(runs);
    if (buckets.length === 0) {
      return { available: true, workdate, upserted: 0, lockedSkipped: 0 };
    }

    const [company] = await db
      .select({ hourlyrate: companies.hourlyrate, resourcerate: companies.resourcerate })
      .from(companies)
      .where(eq(companies.id, companyid))
      .limit(1);
    // Own projects carry their rate overrides on companyprojects, engaged ones on projectbillings
    // (FR-014). A project the company can no longer bill (engagement ended) uses the company rate.
    const billable = await TimeBillingProjectAccess.list(companyid);
    const companyRates = company ?? { hourlyrate: null, resourcerate: null };

    let upserted = 0;
    let lockedSkipped = 0;
    for (const b of buckets) {
      const project = billable.find((p) => p.id === b.projectid) ?? null;
      const rate = resolveRates(companyRates, project).resource;
      const written = await db.execute(sql`
        INSERT INTO projecttimeentries
          (id, taskid, projectid, userid, companyid, specid, category, line, model, enteredbyid,
           workdate, starttime, endtime, duration, billable, entryrate, notes, source, resourcecount)
        VALUES
          (${uuidv7()}, NULL, ${b.projectid}, ${actorid}, ${companyid}, ${b.specid}, 'resource', ${b.line},
           ${b.model}, ${actorid}, ${workdate}::date, ${workdate}::date + time '12:00',
           ${workdate}::date + time '12:00', ${b.minutes}, true, ${rate}, NULL, 'agentrun', ${b.resourcecount})
        ON CONFLICT (companyid, projectid, line, COALESCE(specid, '00000000-0000-0000-0000-000000000000'::uuid), workdate, model)
          WHERE source = 'agentrun'
        DO UPDATE SET duration = EXCLUDED.duration,
                      resourcecount = EXCLUDED.resourcecount,
                      updatedat = now()
          WHERE projecttimeentries.invoiceid IS NULL
        RETURNING id
      `);
      if (written.rows.length > 0) upserted += 1;
      else lockedSkipped += 1;
    }

    logger.info({ companyid, workdate, buckets: buckets.length, upserted, lockedSkipped }, 'Agent-run pull done');
    return { available: true, workdate, upserted, lockedSkipped };
  }

  /**
   * The automatic pull (SPEC-005 Amendment E): every day in [from, to] that holds a run billed to
   * the caller's company is pulled with pullDay, so the page and the statement always show the
   * agent time without a manual pull. Days with no runs are not visited. Repeat-safe: a second
   * call refreshes the same entries and leaves locked ones alone.
   */
  static async pullRange(companyid: string, actorid: string, from: string, to: string): Promise<RangePullResult> {
    if (!isIsoDate(from) || !isIsoDate(to)) throw new ValidationError('Dates must be YYYY-MM-DD');
    if (!(await isAgentRunsAvailable())) return { available: false, days: 0, upserted: 0, lockedSkipped: 0 };

    const result = await db.execute(sql`
      SELECT DISTINCT to_char(r.starttime::date, 'YYYY-MM-DD') AS workdate
        FROM agentruns r
       WHERE r.companyid = ${companyid}
         AND r.neverbilled = false
         AND r.starttime >= ${from}::date
         AND r.starttime <  (${to}::date + 1)
       ORDER BY 1
    `);
    const days = (result.rows as Array<Record<string, unknown>>).map((r) => String(r.workdate));
    let upserted = 0;
    let lockedSkipped = 0;
    for (const day of days) {
      const r = await AgentRunPullService.pullDay(companyid, actorid, day);
      upserted += r.upserted;
      lockedSkipped += r.lockedSkipped;
    }
    return { available: true, days: days.length, upserted, lockedSkipped };
  }
}

function toDayRun(r: Record<string, unknown>): DayRun {
  return {
    projectid: String(r.projectid),
    specid: typeof r.specid === 'string' ? r.specid : null,
    command: typeof r.command === 'string' ? r.command : null,
    kind: String(r.kind),
    aispecsessionid: typeof r.aispecsessionid === 'string' ? r.aispecsessionid : null,
    model: String(r.model),
    activeseconds: r.activeseconds === null || r.activeseconds === undefined ? null : Number(r.activeseconds),
  };
}
// [SCOPE 005 / T007] END
