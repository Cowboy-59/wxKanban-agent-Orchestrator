import { db } from '~/db/client.js';
import { projecttimeentries } from '~/db/schema/projecttimeentry.js';
import { userprofiles } from '~/db/schema/userprofiles.js';
import { and, asc, eq, gte, isNotNull, isNull, lte } from 'drizzle-orm';
import { ValidationError } from '~/server/lib/errors.js';
import { minutesToHours } from '~/server/lib/timeBilling.js';
import { TimeBillingProjectAccess } from '~/server/services/TimeBillingProjectAccess.js';
import { isIsoDate } from '~/server/services/TimeBillingService.js';
import type { TimeCategory, TimeEntryView, TimeLine } from '~/shared/types/timeBilling.js';

// [SCOPE 005 / T012] BEGIN — listEntries: one project's Time and Billing entries for edit and delete (FR-005, FR-011, FR-014)
/**
 * The caller's Time and Billing entries on one project it may bill (own or engaged; 404
 * otherwise) for [from, to] by workdate. Legacy task-timer entries (no category) and running
 * timers are left out; invoiced entries only with includeInvoiced (FR-004), marked read-only.
 */
export async function listEntries(
  companyid: string,
  projectid: string,
  range: { from: string; to: string; includeInvoiced: boolean },
): Promise<TimeEntryView[]> {
  if (!isIsoDate(range.from) || !isIsoDate(range.to) || range.from > range.to) {
    throw new ValidationError('from and to must be YYYY-MM-DD with from <= to');
  }
  await TimeBillingProjectAccess.resolve(companyid, projectid);

  const rows = await db
    .select({
      id: projecttimeentries.id,
      projectid: projecttimeentries.projectid,
      specid: projecttimeentries.specid,
      line: projecttimeentries.line,
      category: projecttimeentries.category,
      workdate: projecttimeentries.workdate,
      duration: projecttimeentries.duration,
      userid: projecttimeentries.userid,
      username: userprofiles.fullname,
      model: projecttimeentries.model,
      notes: projecttimeentries.notes,
      source: projecttimeentries.source,
      invoiceid: projecttimeentries.invoiceid,
    })
    .from(projecttimeentries)
    .leftJoin(
      userprofiles,
      and(eq(userprofiles.id, projecttimeentries.userid), eq(userprofiles.companyid, companyid)),
    )
    .where(
      and(
        eq(projecttimeentries.companyid, companyid),
        eq(projecttimeentries.projectid, projectid),
        isNotNull(projecttimeentries.category),
        isNotNull(projecttimeentries.endtime),
        gte(projecttimeentries.workdate, range.from),
        lte(projecttimeentries.workdate, range.to),
        range.includeInvoiced ? undefined : isNull(projecttimeentries.invoiceid),
      ),
    )
    .orderBy(asc(projecttimeentries.workdate), asc(projecttimeentries.createdat));

  return rows.flatMap((r): TimeEntryView[] => {
    if (!r.workdate || !isCategory(r.category) || !isLine(r.line)) return [];
    const minutes = r.duration ?? 0;
    return [
      {
        id: r.id,
        projectid: r.projectid,
        specid: r.specid,
        line: r.line,
        category: r.category,
        workdate: r.workdate,
        minutes,
        hours: minutesToHours(minutes),
        userid: r.userid,
        username: r.username,
        model: r.model,
        notes: r.notes,
        source: r.source,
        invoiced: r.invoiceid !== null,
      },
    ];
  });
}

function isCategory(v: string | null): v is TimeCategory {
  return v === 'developer' || v === 'resource';
}

// MODIFIED-BY: [SCOPE 005 / T027] — the Amendment D lines (dba, management, meeting) are listed too
function isLine(v: string | null): v is TimeLine {
  return (
    v === 'scope' || v === 'brainstorm' || v === 'process' || v === 'dba' || v === 'management' || v === 'meeting'
  );
}
// [SCOPE 005 / T012] END
