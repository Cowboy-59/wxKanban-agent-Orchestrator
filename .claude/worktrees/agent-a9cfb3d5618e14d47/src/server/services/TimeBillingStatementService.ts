import { randomBytes } from 'crypto';
import { db } from '~/db/client.js';
import { customers } from '~/db/schema/customer.js';
import { projectinvoices, type ProjectInvoice } from '~/db/schema/projectinvoice.js';
import { projecttimeentries } from '~/db/schema/projecttimeentry.js';
import { and, desc, eq, gte, inArray, isNotNull, isNull, lte } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { ConflictError, NotFoundError, ValidationError } from '~/server/lib/errors.js';
import { createLogger } from '~/server/lib/logger.js';
import { amountCents, centsToAmount, minutesToHours, normalizeRate } from '~/server/lib/timeBilling.js';
import { TimeBillingProjectAccess } from '~/server/services/TimeBillingProjectAccess.js';
import { isIsoDate } from '~/server/services/TimeBillingService.js';
import type { TimeCategory } from '~/shared/types/timeBilling.js';

const logger = createLogger('time-billing-statements');

// [SCOPE 005 / T009] BEGIN — statement page 1: daily Senior Developer and Resource rows (FR-009)
/** The longest period one statement may cover. Bi-weekly is 14 days; a month leaves room. */
export const MAX_PERIOD_DAYS = 31;

/** One Time and Billing entry as the statement needs it. */
export interface StatementEntry {
  id: string;
  workdate: string;
  category: TimeCategory;
  userid: string;
  /** Minutes, a multiple of 15; negative for a correction (FR-011). */
  duration: number;
  /** Rate snapshotted on the entry when it was created (FR-008). */
  entryrate: string;
  /** Agents behind a Resource entry; NULL counts as 1 (a manual Resource entry). */
  resourcecount: number | null;
}

/**
 * One page-1 row: "N Senior Developers" or "N Resources" for one day at one rate.
 * Entries of one day normally share a rate; when a client's projects bill different rates
 * the day gets one row per rate, so every row still satisfies hours × rate = amount.
 */
export interface StatementRow {
  workdate: string;
  category: TimeCategory;
  /** Distinct people (Developer) or agents (Resource) in the row. */
  count: number;
  minutes: number;
  hours: string;
  rate: string;
  amountcents: number;
  amount: string;
}

export interface StatementPage1 {
  rows: StatementRow[];
  developerminutes: number;
  resourceminutes: number;
  totalcents: number;
  total: string;
}

/**
 * Build page 1 from the entries of one statement. Days with no time on a category have no
 * row, and a row whose corrections net to zero is dropped. Rows are ordered by day, then
 * Developer before Resource, then rate.
 */
export function buildStatementPage1(entries: readonly StatementEntry[]): StatementPage1 {
  interface Acc {
    workdate: string;
    category: TimeCategory;
    rate: string;
    minutes: number;
    people: Set<string>;
    agents: number;
  }
  const groups = new Map<string, Acc>();
  for (const e of entries) {
    const rate = normalizeRate(e.entryrate);
    const key = `${e.workdate}|${e.category}|${rate}`;
    let acc = groups.get(key);
    if (!acc) {
      acc = { workdate: e.workdate, category: e.category, rate, minutes: 0, people: new Set(), agents: 0 };
      groups.set(key, acc);
    }
    acc.minutes += e.duration;
    if (e.category === 'developer') acc.people.add(e.userid);
    else acc.agents += e.resourcecount ?? 1;
  }

  const order: Record<TimeCategory, number> = { developer: 0, resource: 1 };
  const rows: StatementRow[] = [...groups.values()]
    .filter((g) => g.minutes !== 0)
    .sort(
      (a, b) =>
        a.workdate.localeCompare(b.workdate) ||
        order[a.category] - order[b.category] ||
        Number(a.rate) - Number(b.rate),
    )
    .map((g) => {
      const cents = amountCents(g.minutes, g.rate);
      return {
        workdate: g.workdate,
        category: g.category,
        count: g.category === 'developer' ? g.people.size : g.agents,
        minutes: g.minutes,
        hours: minutesToHours(g.minutes),
        rate: g.rate,
        amountcents: cents,
        amount: centsToAmount(cents),
      };
    });

  const totalcents = rows.reduce((s, r) => s + r.amountcents, 0);
  const page1: StatementPage1 = {
    rows,
    developerminutes: rows.filter((r) => r.category === 'developer').reduce((s, r) => s + r.minutes, 0),
    resourceminutes: rows.filter((r) => r.category === 'resource').reduce((s, r) => s + r.minutes, 0),
    totalcents,
    total: centsToAmount(totalcents),
  };
  assertStatementAddsUp(page1);
  return page1;
}

/**
 * Success metric 3: every row's amount = hours × rate and the total = the sum of the rows,
 * checked at generation; a mismatch blocks the statement rather than printing it.
 */
export function assertStatementAddsUp(page1: StatementPage1): void {
  let sum = 0;
  for (const r of page1.rows) {
    if (r.amountcents !== amountCents(r.minutes, r.rate) || r.amount !== centsToAmount(r.amountcents)) {
      throw new Error(`Statement row ${r.workdate} ${r.category} does not equal hours × rate`);
    }
    sum += r.amountcents;
  }
  if (sum !== page1.totalcents || page1.total !== centsToAmount(sum)) {
    throw new Error('Statement total does not equal the sum of its rows');
  }
}

/** Validate a statement period: ISO dates, start ≤ end, at most MAX_PERIOD_DAYS long. */
export function checkPeriod(periodstart: string, periodend: string): void {
  if (!isIsoDate(periodstart) || !isIsoDate(periodend)) {
    throw new ValidationError('Period dates must be YYYY-MM-DD');
  }
  const days = daysBetween(periodstart, periodend) + 1;
  if (days < 1) throw new ValidationError('Period start must be on or before its end');
  if (days > MAX_PERIOD_DAYS) throw new ValidationError(`A statement covers at most ${MAX_PERIOD_DAYS} days`);
}

/**
 * The period the dialog pre-fills (FR-009): the day after the Customer's last statement,
 * for one billing cycle (7 days weekly, 14 bi-weekly). With no earlier statement, the last
 * full Monday–Sunday week before `today` (bi-weekly: the last two full weeks).
 */
export function suggestPeriod(
  billingcycle: string,
  lastperiodend: string | null,
  today: string,
): { periodstart: string; periodend: string } {
  const length = billingcycle === 'biweekly' ? 14 : 7;
  if (lastperiodend) {
    const periodstart = addDays(lastperiodend, 1);
    return { periodstart, periodend: addDays(periodstart, length - 1) };
  }
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  const lastSunday = addDays(today, dow === 0 ? -7 : -dow);
  return { periodstart: addDays(lastSunday, 1 - length), periodend: lastSunday };
}

/** Statement number in the INV-YYYY- form InvoiceService uses, with a random suffix. */
export function statementNumber(periodend: string): string {
  return `INV-${periodend.slice(0, 4)}-${randomBytes(4).toString('hex').toUpperCase()}`;
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}
// [SCOPE 005 / T009] END

// [SCOPE 005 / T009] BEGIN — TimeBillingStatementService: generate a statement and lock its entries (FR-009, FR-011)
// MODIFIED-BY: [SCOPE 005 / T023] — billed projects of the Customer come from TimeBillingProjectAccess: own plus engaged client projects (FR-014)
export interface GeneratedStatement {
  invoice: ProjectInvoice;
  page1: StatementPage1;
  entrycount: number;
}

const ENTRY_COLUMNS = {
  id: projecttimeentries.id,
  workdate: projecttimeentries.workdate,
  category: projecttimeentries.category,
  userid: projecttimeentries.userid,
  duration: projecttimeentries.duration,
  entryrate: projecttimeentries.entryrate,
  resourcecount: projecttimeentries.resourcecount,
};

export class TimeBillingStatementService {
  /** The period to pre-fill for a Customer (FR-009). */
  static async getSuggestedPeriod(
    companyid: string,
    customerid: string,
    today: string,
  ): Promise<{ periodstart: string; periodend: string }> {
    const customer = await loadCustomer(companyid, customerid);
    const [last] = await db
      .select({ periodend: projectinvoices.periodend })
      .from(projectinvoices)
      .where(
        and(
          eq(projectinvoices.companyid, companyid),
          eq(projectinvoices.customerid, customerid),
          isNotNull(projectinvoices.periodend),
        ),
      )
      .orderBy(desc(projectinvoices.periodend))
      .limit(1);
    return suggestPeriod(customer.billingcycle, last?.periodend ?? null, today);
  }

  /**
   * Generate a statement for one Customer and period. Only the caller's own Time and Billing
   * entries on the Customer's billed projects — own projects and engaged client projects
   * (FR-014) — that are finished (not a running timer) and on no statement yet are included.
   * In one transaction the statement row is written and every included entry records it
   * (invoiceid, plus invoiced/invoicedat for the legacy views); if any entry was locked by a
   * concurrent statement in between, nothing is written (409).
   */
  static async generate(
    companyid: string,
    customerid: string,
    periodstart: string,
    periodend: string,
  ): Promise<GeneratedStatement> {
    checkPeriod(periodstart, periodend);
    const customer = await loadCustomer(companyid, customerid);

    const projectids = await TimeBillingProjectAccess.billedProjectIds(companyid, customerid);
    if (projectids.length === 0) {
      throw new ValidationError('This client has no billed projects');
    }

    const rows = await db
      .select(ENTRY_COLUMNS)
      .from(projecttimeentries)
      .where(
        and(
          eq(projecttimeentries.companyid, companyid),
          inArray(projecttimeentries.projectid, projectids),
          isNotNull(projecttimeentries.category),
          isNull(projecttimeentries.invoiceid),
          isNotNull(projecttimeentries.endtime),
          eq(projecttimeentries.billable, true),
          gte(projecttimeentries.workdate, periodstart),
          lte(projecttimeentries.workdate, periodend),
        ),
      );
    const entries = rows.map(toStatementEntry);
    if (entries.length === 0) {
      throw new ValidationError('No unbilled time for this client in this period');
    }

    const page1 = buildStatementPage1(entries);
    const ids = entries.map((e) => e.id);
    const now = new Date();

    const invoice = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(projectinvoices)
        .values({
          id: uuidv7(),
          companyid,
          projectid: null,
          customerid,
          invoicenumber: statementNumber(periodend),
          billedto: customer.name,
          clientemail: customer.email,
          generatedat: now,
          periodstart,
          periodend,
          totalamount: page1.total,
          hoursworked: minutesToHours(page1.developerminutes + page1.resourceminutes),
          developerhours: minutesToHours(page1.developerminutes),
          resourcehours: minutesToHours(page1.resourceminutes),
          description: `Statement ${periodstart} to ${periodend}`,
          emailsent: false,
        })
        .returning();
      if (!created) throw new Error('Statement insert returned no row');

      const locked = await tx
        .update(projecttimeentries)
        .set({ invoiceid: created.id, invoiced: true, invoicedat: now, updatedat: now })
        .where(
          and(
            inArray(projecttimeentries.id, ids),
            eq(projecttimeentries.companyid, companyid),
            isNull(projecttimeentries.invoiceid),
          ),
        )
        .returning({ id: projecttimeentries.id });
      if (locked.length !== ids.length) {
        // Throwing rolls the transaction back: the statement row and every lock are undone.
        throw new ConflictError('Some of this time was put on another statement just now; generate again');
      }
      return created;
    });

    logger.info(
      { companyid, customerid, invoiceid: invoice.id, periodstart, periodend, entries: ids.length, totalcents: page1.totalcents },
      'Statement generated',
    );
    return { invoice, page1, entrycount: ids.length };
  }

  /** Reload a generated statement's page 1 from the entries locked to it (for the PDF). */
  static async load(companyid: string, invoiceid: string): Promise<{ invoice: ProjectInvoice; page1: StatementPage1 }> {
    const [invoice] = await db
      .select()
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
      .select(ENTRY_COLUMNS)
      .from(projecttimeentries)
      .where(and(eq(projecttimeentries.invoiceid, invoiceid), eq(projecttimeentries.companyid, companyid)));
    const page1 = buildStatementPage1(rows.map(toStatementEntry));
    if (page1.total !== centsToAmount(Math.round(Number(invoice.totalamount) * 100))) {
      throw new Error('Statement entries no longer add up to the generated total');
    }
    return { invoice, page1 };
  }
}

async function loadCustomer(
  companyid: string,
  customerid: string,
): Promise<{ id: string; name: string; email: string | null; billingcycle: string }> {
  const [customer] = await db
    .select({ id: customers.id, name: customers.name, email: customers.email, billingcycle: customers.billingcycle })
    .from(customers)
    .where(and(eq(customers.id, customerid), eq(customers.companyid, companyid)))
    .limit(1);
  if (!customer) throw new NotFoundError('Customer');
  return customer;
}

function toStatementEntry(r: {
  id: string;
  workdate: string | null;
  category: string | null;
  userid: string;
  duration: number | null;
  entryrate: string | null;
  resourcecount: number | null;
}): StatementEntry {
  if (!r.workdate || (r.category !== 'developer' && r.category !== 'resource') || r.entryrate === null) {
    // The query filters legacy rows out; a row without these is a data defect, not input.
    throw new Error(`Time entry ${r.id} is missing its workdate, category or rate`);
  }
  return {
    id: r.id,
    workdate: r.workdate,
    category: r.category,
    userid: r.userid,
    duration: r.duration ?? 0,
    entryrate: r.entryrate,
    resourcecount: r.resourcecount,
  };
}
// [SCOPE 005 / T009] END
