import { db } from '~/db/client.js';
import { companies } from '~/db/schema/company.js';
import { projectspecifications } from '~/db/schema/projectspecification.js';
import { projecttimeentries, type ProjectTimeEntry } from '~/db/schema/projecttimeentry.js';
import { userprofiles } from '~/db/schema/userprofiles.js';
import { and, eq, isNotNull, isNull, type SQL } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { ConflictError, NotFoundError, ValidationError } from '~/server/lib/errors.js';
import { createLogger } from '~/server/lib/logger.js';
import { resolveRates, roundUpToQuarterHour } from '~/server/lib/timeBilling.js';
import { TimeBillingProjectAccess } from '~/server/services/TimeBillingProjectAccess.js';
import { isIsoDate } from '~/server/services/TimeBillingService.js';
import type { TimeCategory, TimeLine } from '~/shared/types/timeBilling.js';

const logger = createLogger('time-billing-entries');

// [SCOPE 005 / T005] BEGIN — manual entry input and validation (FR-005, FR-011)
// MODIFIED-BY: [SCOPE 005 / T027] — DBA, Management and Meetings accept Developer entries only (Amendment D)
export interface ManualEntryInput {
  projectid: string;
  line: TimeLine;
  /** Required for a scope line; must be a scope of the project. NULL for project lines. */
  specid: string | null;
  category: TimeCategory;
  /** Developer entries: the person who did the work (a user of the company). */
  userid: string | null;
  /** Resource entries: the model that did the work (required). */
  model: string | null;
  workdate: string;
  /** Raw minutes as entered; rounded up to the next 15. Negative = a correction. */
  minutes: number;
  notes: string | null;
}

export interface ManualEntryUpdate {
  workdate?: string;
  minutes?: number;
  notes?: string | null;
  userid?: string;
  model?: string;
}

/**
 * The line × category pairs the page offers (FR-003). Processes are Resource-only; DBA,
 * Management and Meetings are Developer-only (Amendment D).
 */
const ALLOWED: ReadonlyArray<readonly [TimeLine, TimeCategory]> = [
  ['scope', 'developer'],
  ['scope', 'resource'],
  ['brainstorm', 'developer'],
  ['brainstorm', 'resource'],
  ['process', 'resource'],
  ['dba', 'developer'],
  ['management', 'developer'],
  ['meeting', 'developer'],
];

/**
 * Shape checks that need no database. Returns the rounded minutes and trimmed notes/model.
 * Mirrors the DDL CHECKs so the caller gets a 400 with a reason instead of a 23514.
 */
export function validateManualEntry(input: ManualEntryInput): {
  minutes: number;
  notes: string | null;
  model: string | null;
} {
  if (!ALLOWED.some(([l, c]) => l === input.line && c === input.category)) {
    throw new ValidationError(`A ${input.category} entry cannot go on the ${input.line} line`);
  }
  if (input.line === 'scope' && !input.specid) {
    throw new ValidationError('A scope entry needs its scope');
  }
  if (input.line !== 'scope' && input.specid) {
    throw new ValidationError('Only a scope entry names a scope');
  }
  const model = input.model?.trim() || null;
  if (input.category === 'resource' && !model) {
    throw new ValidationError('A Resource entry needs its model');
  }
  if (model && model.length > 100) {
    throw new ValidationError('Model name is longer than 100 characters');
  }
  if (input.category === 'developer' && !input.userid) {
    throw new ValidationError('A Developer entry needs the person who did the work');
  }
  if (!isIsoDate(input.workdate)) {
    throw new ValidationError('Date must be YYYY-MM-DD');
  }
  return { ...checkMinutesAndNotes(input.minutes, input.notes), model: input.category === 'resource' ? model : null };
}

function checkMinutesAndNotes(rawMinutes: number, rawNotes: string | null | undefined): {
  minutes: number;
  notes: string | null;
} {
  if (!Number.isFinite(rawMinutes) || rawMinutes === 0) {
    throw new ValidationError('Hours must be a non-zero number');
  }
  if (Math.abs(rawMinutes) > 24 * 60) {
    throw new ValidationError('One entry cannot exceed 24 hours');
  }
  const notes = rawNotes?.trim() || null;
  if (rawMinutes < 0 && !notes) {
    throw new ValidationError('A negative correction needs a note');
  }
  return { minutes: roundUpToQuarterHour(rawMinutes), notes };
}
// [SCOPE 005 / T005] END

// [SCOPE 005 / T005] BEGIN — TimeBillingEntryService: create, edit, delete manual entries
// MODIFIED-BY: [SCOPE 005 / T023] — the project resolves through TimeBillingProjectAccess: own or engaged client project, 404 otherwise (FR-014)
export class TimeBillingEntryService {
  /**
   * Create a manual entry for the caller's company. The project is one the caller may bill:
   * its own, or a client project it is engaged on (FR-014); the entry belongs to the caller's
   * company either way. The rate in force (project override, else company default) is
   * snapshotted onto the entry (FR-008). `enteredbyid` is the ADMIN; `userid` is who did the
   * work, or the ADMIN for a Resource entry.
   */
  static async create(companyid: string, actorid: string, input: ManualEntryInput): Promise<ProjectTimeEntry> {
    const checked = validateManualEntry(input);

    const project = await TimeBillingProjectAccess.resolve(companyid, input.projectid);

    if (input.specid) {
      const [spec] = await db
        .select({ id: projectspecifications.id })
        .from(projectspecifications)
        .where(and(eq(projectspecifications.id, input.specid), eq(projectspecifications.projectid, project.id)))
        .limit(1);
      if (!spec) throw new NotFoundError('Scope');
    }

    const workerid = input.category === 'developer' && input.userid ? input.userid : actorid;
    await assertCompanyUser(companyid, workerid);

    const [company] = await db
      .select({ hourlyrate: companies.hourlyrate, resourcerate: companies.resourcerate })
      .from(companies)
      .where(eq(companies.id, companyid))
      .limit(1);
    if (!company) throw new NotFoundError('Company');
    const rates = resolveRates(company, project);

    const [created] = await db
      .insert(projecttimeentries)
      .values({
        id: uuidv7(),
        taskid: null,
        projectid: project.id,
        userid: workerid,
        companyid,
        specid: input.specid,
        category: input.category,
        line: input.line,
        model: checked.model,
        enteredbyid: actorid,
        workdate: input.workdate,
        // starttime is NOT NULL and no-tz; local noon of the workdate keeps legacy views on the
        // right day. Time and Billing itself buckets by workdate only (constraint 6).
        starttime: new Date(`${input.workdate}T12:00:00`),
        endtime: new Date(`${input.workdate}T12:00:00`),
        duration: checked.minutes,
        billable: true,
        entryrate: input.category === 'developer' ? rates.developer : rates.resource,
        notes: checked.notes,
        source: 'manual',
        resourcecount: input.category === 'resource' ? 1 : null,
      })
      .returning();
    if (!created) throw new Error('Insert returned no row');

    logger.info(
      { companyid, entryid: created.id, line: created.line, category: created.category, minutes: created.duration },
      'Time and Billing entry created',
    );
    return created;
  }

  /** Edit an entry. Invoiced entries are read-only: 409 (FR-011). Rate snapshot is kept. */
  static async update(
    companyid: string,
    entryid: string,
    patch: ManualEntryUpdate,
  ): Promise<{ before: ProjectTimeEntry; after: ProjectTimeEntry }> {
    const before = await loadEditable(companyid, entryid);

    const set: Partial<typeof projecttimeentries.$inferInsert> = { updatedat: new Date() };
    if (patch.workdate !== undefined) {
      if (!isIsoDate(patch.workdate)) throw new ValidationError('Date must be YYYY-MM-DD');
      set.workdate = patch.workdate;
      set.starttime = new Date(`${patch.workdate}T12:00:00`);
      set.endtime = new Date(`${patch.workdate}T12:00:00`);
    }
    if (patch.minutes !== undefined || patch.notes !== undefined) {
      const checked = checkMinutesAndNotes(
        patch.minutes ?? before.duration ?? 0,
        patch.notes !== undefined ? patch.notes : before.notes,
      );
      set.duration = checked.minutes;
      set.notes = checked.notes;
    }
    if (patch.model !== undefined) {
      if (before.category !== 'resource') throw new ValidationError('Only a Resource entry has a model');
      const model = patch.model.trim();
      if (!model || model.length > 100) throw new ValidationError('A Resource entry needs its model');
      set.model = model;
    }
    if (patch.userid !== undefined) {
      if (before.category !== 'developer') throw new ValidationError('Only a Developer entry names a person');
      await assertCompanyUser(companyid, patch.userid);
      set.userid = patch.userid;
    }

    const [after] = await db
      .update(projecttimeentries)
      .set(set)
      .where(
        and(
          eq(projecttimeentries.id, entryid),
          eq(projecttimeentries.companyid, companyid),
          // Re-checked in the UPDATE so a statement generated between load and write still wins.
          isNullInvoice(),
        ),
      )
      .returning();
    if (!after) throw new ConflictError('This entry is on a statement and cannot be changed');

    logger.info({ companyid, entryid }, 'Time and Billing entry updated');
    return { before, after };
  }

  /** Delete an entry. Invoiced entries cannot be deleted: 409 (FR-011). */
  static async remove(companyid: string, entryid: string): Promise<ProjectTimeEntry> {
    const before = await loadEditable(companyid, entryid);
    const deleted = await db
      .delete(projecttimeentries)
      .where(
        and(eq(projecttimeentries.id, entryid), eq(projecttimeentries.companyid, companyid), isNullInvoice()),
      )
      .returning({ id: projecttimeentries.id });
    if (deleted.length === 0) throw new ConflictError('This entry is on a statement and cannot be deleted');

    logger.info({ companyid, entryid }, 'Time and Billing entry deleted');
    return before;
  }
}

/** Load a Time and Billing entry of this company; 404 if missing, 409 if invoiced. */
async function loadEditable(companyid: string, entryid: string): Promise<ProjectTimeEntry> {
  const [entry] = await db
    .select()
    .from(projecttimeentries)
    .where(
      and(
        eq(projecttimeentries.id, entryid),
        eq(projecttimeentries.companyid, companyid),
        isNotNull(projecttimeentries.category),
      ),
    )
    .limit(1);
  if (!entry) throw new NotFoundError('Time entry');
  if (entry.invoiceid) throw new ConflictError('This entry is on a statement and cannot be changed');
  return entry;
}

async function assertCompanyUser(companyid: string, userid: string): Promise<void> {
  const [user] = await db
    .select({ id: userprofiles.id })
    .from(userprofiles)
    .where(and(eq(userprofiles.id, userid), eq(userprofiles.companyid, companyid)))
    .limit(1);
  if (!user) throw new NotFoundError('User');
}

function isNullInvoice(): SQL {
  return isNull(projecttimeentries.invoiceid);
}
// [SCOPE 005 / T005] END
