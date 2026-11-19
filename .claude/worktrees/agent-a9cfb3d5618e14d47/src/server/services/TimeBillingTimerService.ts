import { db } from '~/db/client.js';
import { companies } from '~/db/schema/company.js';
import { projectspecifications } from '~/db/schema/projectspecification.js';
import { projecttimeentries, type ProjectTimeEntry } from '~/db/schema/projecttimeentry.js';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { ConflictError, NotFoundError, ValidationError } from '~/server/lib/errors.js';
import { createLogger } from '~/server/lib/logger.js';
import { resolveRates, roundUpToQuarterHour } from '~/server/lib/timeBilling.js';
import { formatRunNoteLine, isAgentRunsAvailable, listRunNoteLines } from '~/server/services/AgentRunSource.js';
import { TimeBillingProjectAccess } from '~/server/services/TimeBillingProjectAccess.js';
import { isIsoDate } from '~/server/services/TimeBillingService.js';
import type { TimeLine } from '~/shared/types/timeBilling.js';

const logger = createLogger('time-billing-timer');

// [SCOPE 005 / T006] BEGIN — timer inputs and results (FR-006)
// MODIFIED-BY: [SCOPE 005 / T029] — RunningTimer carries `paused`; elapsedSeconds is ACTIVE time (Amendment F)
export interface TimerStartInput {
  projectid: string;
  line: TimeLine;
  /** Required for a scope line; must be a scope of the project. NULL for brainstorm. */
  specid: string | null;
  /** The user's local day (YYYY-MM-DD); defaults to the server's UTC day. */
  workdate?: string;
}

export interface RunningTimer {
  entry: ProjectTimeEntry;
  /** Active seconds: elapsed minus every paused stretch, frozen while paused. */
  elapsedSeconds: number;
  /** True while the timer is paused (Amendment F). */
  paused: boolean;
}

export interface TimerNotes {
  available: boolean;
  lines: string[];
}
// [SCOPE 005 / T006] END

// [SCOPE 005 / T029] BEGIN — active time of a timer entry (FR-006 Amendment F)
/**
 * Seconds the timer has been running, not counting paused time: from start to `at`, minus the
 * paused total, minus a pause still open at `at`. Never negative.
 */
export function activeSeconds(entry: Pick<ProjectTimeEntry, 'starttime' | 'pausedat' | 'pausedseconds'>, at: Date): number {
  const openPause = entry.pausedat ? Math.max(0, at.getTime() - entry.pausedat.getTime()) : 0;
  const ms = at.getTime() - entry.starttime.getTime() - (entry.pausedseconds ?? 0) * 1000 - openPause;
  return Math.max(0, Math.floor(ms / 1000));
}
// [SCOPE 005 / T029] END

// [SCOPE 005 / T006] BEGIN — TimeBillingTimerService: database-backed side timer (FR-006)
// MODIFIED-BY: [SCOPE 005 / T023] — the project resolves through TimeBillingProjectAccess: own or engaged client project, 404 otherwise (FR-014)
// MODIFIED-BY: [SCOPE 005 / T029] — pause, resume; stop bills active time only, rounded once (Amendment F)
export class TimeBillingTimerService {
  /**
   * Start a timer on a line of a project the caller may bill (own or engaged, FR-014). One
   * running timer per user; a second start is 409.
   */
  static async start(companyid: string, userid: string, input: TimerStartInput): Promise<ProjectTimeEntry> {
    if (input.line === 'process') {
      throw new ValidationError('A process line is Resource-only; the timer records Developer time');
    }
    if (input.line === 'scope' && !input.specid) throw new ValidationError('A scope timer needs its scope');
    // [SCOPE 005 / T027] Amendment D: brainstorm, dba, management and meeting are project lines — no scope.
    if (input.line !== 'scope' && input.specid) throw new ValidationError('Only a scope timer names a scope');
    if (input.workdate !== undefined && !isIsoDate(input.workdate)) {
      throw new ValidationError('Date must be YYYY-MM-DD');
    }

    if (await findRunning(companyid, userid)) {
      throw new ConflictError('A timer is already running; stop it first');
    }

    const project = await TimeBillingProjectAccess.resolve(companyid, input.projectid);

    if (input.specid) {
      const [spec] = await db
        .select({ id: projectspecifications.id })
        .from(projectspecifications)
        .where(and(eq(projectspecifications.id, input.specid), eq(projectspecifications.projectid, project.id)))
        .limit(1);
      if (!spec) throw new NotFoundError('Scope');
    }

    const [company] = await db
      .select({ hourlyrate: companies.hourlyrate, resourcerate: companies.resourcerate })
      .from(companies)
      .where(eq(companies.id, companyid))
      .limit(1);
    if (!company) throw new NotFoundError('Company');
    const rates = resolveRates(company, project);

    const now = new Date();
    const [created] = await db
      .insert(projecttimeentries)
      .values({
        id: uuidv7(),
        taskid: null,
        projectid: project.id,
        userid,
        companyid,
        specid: input.specid,
        category: 'developer',
        line: input.line,
        model: null,
        enteredbyid: userid,
        workdate: input.workdate ?? now.toISOString().slice(0, 10),
        starttime: now,
        endtime: null,
        duration: null,
        billable: true,
        entryrate: rates.developer,
        notes: null,
        source: 'timer',
        resourcecount: null,
        pausedat: null,
        pausedseconds: 0,
      })
      .returning();
    if (!created) throw new Error('Insert returned no row');

    logger.info({ companyid, userid, entryid: created.id, projectid: project.id, line: created.line }, 'Timer started');
    return created;
  }

  /** The caller's running timer with its active seconds, or null. Lives in the database, so it survives a reload. */
  static async getRunning(companyid: string, userid: string): Promise<RunningTimer | null> {
    const entry = await findRunning(companyid, userid);
    if (!entry) return null;
    return { entry, elapsedSeconds: activeSeconds(entry, new Date()), paused: entry.pausedat !== null };
  }

  /** Pause the running timer: the clock holds and nothing is saved. A paused timer is 409. */
  static async pause(companyid: string, userid: string): Promise<RunningTimer> {
    const entry = await findRunning(companyid, userid);
    if (!entry) throw new NotFoundError('Running timer');
    if (entry.pausedat) throw new ConflictError('The timer is already paused');
    const now = new Date();
    const [paused] = await db
      .update(projecttimeentries)
      .set({ pausedat: now, updatedat: now })
      .where(
        and(
          eq(projecttimeentries.id, entry.id),
          eq(projecttimeentries.companyid, companyid),
          isNull(projecttimeentries.endtime),
          isNull(projecttimeentries.pausedat),
        ),
      )
      .returning();
    if (!paused) throw new ConflictError('The timer is already paused or stopped');
    logger.info({ companyid, userid, entryid: paused.id }, 'Timer paused');
    return { entry: paused, elapsedSeconds: activeSeconds(paused, now), paused: true };
  }

  /** Resume a paused timer: the paused stretch is added to pausedseconds. A running timer is 409. */
  static async resume(companyid: string, userid: string): Promise<RunningTimer> {
    const entry = await findRunning(companyid, userid);
    if (!entry) throw new NotFoundError('Running timer');
    if (!entry.pausedat) throw new ConflictError('The timer is not paused');
    const now = new Date();
    const stretch = Math.max(0, Math.floor((now.getTime() - entry.pausedat.getTime()) / 1000));
    const [resumed] = await db
      .update(projecttimeentries)
      .set({ pausedat: null, pausedseconds: (entry.pausedseconds ?? 0) + stretch, updatedat: now })
      .where(
        and(
          eq(projecttimeentries.id, entry.id),
          eq(projecttimeentries.companyid, companyid),
          isNull(projecttimeentries.endtime),
          isNotNull(projecttimeentries.pausedat),
        ),
      )
      .returning();
    if (!resumed) throw new ConflictError('The timer is not paused or was stopped');
    logger.info({ companyid, userid, entryid: resumed.id, pausedseconds: resumed.pausedseconds }, 'Timer resumed');
    return { entry: resumed, elapsedSeconds: activeSeconds(resumed, now), paused: false };
  }

  /** Automatic note lines for the running timer's window. `available:false` when agentruns is not deployed. */
  static async notes(companyid: string, userid: string): Promise<TimerNotes> {
    const entry = await findRunning(companyid, userid);
    if (!entry) throw new NotFoundError('Running timer');
    return automaticNotes(entry, new Date());
  }

  /**
   * Stop the running timer (paused or not): its ACTIVE minutes — elapsed minus every paused
   * stretch — round UP to the next 15 once (FR-005, Amendment F); notes are the automatic run
   * lines then the manual notes.
   */
  static async stop(
    companyid: string,
    userid: string,
    input: { manualNotes?: string | null } = {},
  ): Promise<ProjectTimeEntry> {
    const entry = await findRunning(companyid, userid);
    if (!entry) throw new NotFoundError('Running timer');

    const now = new Date();
    const openPause = entry.pausedat ? Math.max(0, Math.floor((now.getTime() - entry.pausedat.getTime()) / 1000)) : 0;
    const elapsedMinutes = Math.max(1, Math.ceil(activeSeconds(entry, now) / 60));
    const minutes = roundUpToQuarterHour(elapsedMinutes);

    const auto = await automaticNotes(entry, now);
    const manual = input.manualNotes?.trim() ?? '';
    const autoText = auto.lines.join('\n');
    const notes = [autoText, manual].filter((p) => p.length > 0).join('\n\n') || null;

    const [stopped] = await db
      .update(projecttimeentries)
      .set({
        endtime: now,
        duration: minutes,
        notes,
        pausedat: null,
        pausedseconds: (entry.pausedseconds ?? 0) + openPause,
        updatedat: now,
      })
      .where(
        and(
          eq(projecttimeentries.id, entry.id),
          eq(projecttimeentries.companyid, companyid),
          isNull(projecttimeentries.endtime),
        ),
      )
      .returning();
    if (!stopped) throw new ConflictError('This timer was already stopped');

    // Ids and counts only; note text is never logged.
    logger.info(
      { companyid, userid, entryid: stopped.id, line: stopped.line, minutes, pausedseconds: stopped.pausedseconds, autolines: auto.lines.length },
      'Timer stopped',
    );
    return stopped;
  }
}

async function findRunning(companyid: string, userid: string): Promise<ProjectTimeEntry | null> {
  const [entry] = await db
    .select()
    .from(projecttimeentries)
    .where(
      and(
        eq(projecttimeentries.companyid, companyid),
        eq(projecttimeentries.userid, userid),
        eq(projecttimeentries.source, 'timer'),
        eq(projecttimeentries.category, 'developer'),
        isNull(projecttimeentries.endtime),
      ),
    )
    .limit(1);
  return entry ?? null;
}

async function automaticNotes(entry: ProjectTimeEntry, until: Date): Promise<TimerNotes> {
  if (!(await isAgentRunsAvailable())) return { available: false, lines: [] };
  const runs = await listRunNoteLines(entry.projectid, entry.companyid, entry.starttime, until); // [SCOPE 143 / T027] company's runs only
  return { available: true, lines: runs.map(formatRunNoteLine) };
}
// [SCOPE 005 / T006] END
