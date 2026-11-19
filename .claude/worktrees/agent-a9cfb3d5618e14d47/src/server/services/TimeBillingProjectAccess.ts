import { db } from '~/db/client.js';
import { companyprojects } from '~/db/schema/companyproject.js';
import { customers } from '~/db/schema/customer.js';
import { projectbillings } from '~/db/schema/projectbilling.js';
import { and, asc, eq, isNull, sql, type SQL } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { NotFoundError } from '~/server/lib/errors.js';
import { createLogger } from '~/server/lib/logger.js';

const logger = createLogger('time-billing-access');

// [SCOPE 005 / T023] BEGIN — billable projects: own projects plus engaged client projects (FR-002, FR-014)
/**
 * A project the caller's company may put time on and bill. Own projects carry their billing
 * settings on companyprojects; an engaged client project carries the caller's settings on
 * projectbillings, so the client's row is never read for billing or written (FR-014).
 */
export interface BillableProject {
  id: string;
  name: string;
  /** True for a client company's project reached through an engagement. */
  engaged: boolean;
  /** The client company's name for an engaged project; null for an own project. */
  clientname: string | null;
  billed: boolean;
  customerid: string | null;
  customername: string | null;
  /** Developer rate override for this project; null = the company default. */
  hourlyrate: string | null;
  /** Resource rate override for this project; null = the company default. */
  resourcerate: string | null;
}

interface EngagedRow {
  id: string;
  name: string;
  clientcompanyid: string;
  clientname: string;
  billed: boolean | null;
  storedcustomerid: string | null;
  hourlyrate: string | null;
  resourcerate: string | null;
}

/**
 * The live-engagement test, shared by every query below. A client project counts while an
 * engagement between the two companies is not ended and has a live assignment on it.
 */
function engagedWhere(companyid: string, projectFilter: SQL | null): SQL {
  return sql`
    p.companyid <> ${companyid}
    AND EXISTS (
      SELECT 1
        FROM engagementassignments ea
        JOIN engagements e ON e.id = ea.engagementid
       WHERE ea.projectid = p.id
         AND ea.removedat IS NULL
         AND e.consultingcompanyid = ${companyid}
         AND e.clientcompanyid = p.companyid
         AND e.state <> 'ended'
    )
    ${projectFilter ? sql`AND ${projectFilter}` : sql``}`;
}

async function loadEngaged(companyid: string, projectid: string | null): Promise<EngagedRow[]> {
  const result = await db.execute(sql`
    SELECT p.id               AS id,
           p.name             AS name,
           p.companyid        AS clientcompanyid,
           oc.name            AS clientname,
           pb.billed          AS billed,
           pb.customerid      AS storedcustomerid,
           pb.hourlyrate::text   AS hourlyrate,
           pb.resourcerate::text AS resourcerate
      FROM companyprojects p
      JOIN companies oc ON oc.id = p.companyid
      LEFT JOIN projectbillings pb ON pb.projectid = p.id AND pb.companyid = ${companyid}
     WHERE ${engagedWhere(companyid, projectid ? sql`p.id = ${projectid}` : null)}
     ORDER BY p.name`);
  return (result.rows as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id),
    name: String(r.name),
    clientcompanyid: String(r.clientcompanyid),
    clientname: String(r.clientname),
    billed: typeof r.billed === 'boolean' ? r.billed : null,
    storedcustomerid: typeof r.storedcustomerid === 'string' ? r.storedcustomerid : null,
    hourlyrate: typeof r.hourlyrate === 'string' ? r.hourlyrate : null,
    resourcerate: typeof r.resourcerate === 'string' ? r.resourcerate : null,
  }));
}

/**
 * The caller's Customers, by id, and the default Customer per client company (the oldest
 * unarchived Customer linked to it through customers.clientcompanyid). Only the caller's own
 * Customers are ever returned, so a stored id of another company resolves to nothing.
 */
async function loadCustomers(
  companyid: string,
): Promise<{ byId: Map<string, string>; byClient: Map<string, string> }> {
  const rows = await db
    .select({ id: customers.id, name: customers.name, clientcompanyid: customers.clientcompanyid })
    .from(customers)
    .where(and(eq(customers.companyid, companyid), isNull(customers.archivedat)))
    .orderBy(asc(customers.createdat));
  const byId = new Map<string, string>();
  const byClient = new Map<string, string>();
  for (const c of rows) {
    byId.set(c.id, c.name);
    if (c.clientcompanyid && !byClient.has(c.clientcompanyid)) byClient.set(c.clientcompanyid, c.id);
  }
  return { byId, byClient };
}

function toEngaged(row: EngagedRow, cust: { byId: Map<string, string>; byClient: Map<string, string> }): BillableProject {
  const stored = row.storedcustomerid && cust.byId.has(row.storedcustomerid) ? row.storedcustomerid : null;
  const customerid = stored ?? cust.byClient.get(row.clientcompanyid) ?? null;
  return {
    id: row.id,
    name: row.name,
    engaged: true,
    clientname: row.clientname,
    billed: row.billed ?? false,
    customerid,
    customername: customerid ? cust.byId.get(customerid) ?? null : null,
    hourlyrate: row.hourlyrate,
    resourcerate: row.resourcerate,
  };
}

export class TimeBillingProjectAccess {
  /** Every project the caller's company may bill: its own, then engaged client projects. */
  static async list(companyid: string): Promise<BillableProject[]> {
    const cust = await loadCustomers(companyid);
    const own = await db
      .select({
        id: companyprojects.id,
        name: companyprojects.name,
        billed: companyprojects.billed,
        customerid: companyprojects.customerid,
        hourlyrate: companyprojects.hourlyrate,
        resourcerate: companyprojects.resourcerate,
      })
      .from(companyprojects)
      .where(eq(companyprojects.companyid, companyid))
      .orderBy(asc(companyprojects.name));
    const engaged = await loadEngaged(companyid, null);
    return [
      ...own.map((p) => ({
        id: p.id,
        name: p.name,
        engaged: false,
        clientname: null,
        billed: p.billed,
        customerid: p.customerid,
        customername: p.customerid ? cust.byId.get(p.customerid) ?? null : null,
        hourlyrate: p.hourlyrate,
        resourcerate: p.resourcerate,
      })),
      ...engaged.map((r) => toEngaged(r, cust)),
    ];
  }

  /**
   * One project the caller may bill. Anything else — another company's project with no live
   * engagement, or an id that does not exist — is 404, so ids reveal nothing (FR-002, FR-014).
   */
  static async resolve(companyid: string, projectid: string): Promise<BillableProject> {
    const [own] = await db
      .select({
        id: companyprojects.id,
        name: companyprojects.name,
        billed: companyprojects.billed,
        customerid: companyprojects.customerid,
        hourlyrate: companyprojects.hourlyrate,
        resourcerate: companyprojects.resourcerate,
      })
      .from(companyprojects)
      .where(and(eq(companyprojects.id, projectid), eq(companyprojects.companyid, companyid)))
      .limit(1);
    if (own) {
      return { ...own, engaged: false, clientname: null, customername: null };
    }
    const [row] = await loadEngaged(companyid, projectid);
    if (!row) throw new NotFoundError('Project');
    return toEngaged(row, await loadCustomers(companyid));
  }

  /**
   * Ids of the projects whose time goes on a statement for this Customer: own projects billed
   * to it, and engaged client projects the caller billed to it. The engagement need not still
   * be live — time already recorded is still billed (FR-014).
   */
  static async billedProjectIds(companyid: string, customerid: string): Promise<string[]> {
    const own = await db
      .select({ id: companyprojects.id })
      .from(companyprojects)
      .where(
        and(
          eq(companyprojects.companyid, companyid),
          eq(companyprojects.customerid, customerid),
          eq(companyprojects.billed, true),
        ),
      );
    const engaged = await db
      .select({ id: projectbillings.projectid })
      .from(projectbillings)
      .where(
        and(
          eq(projectbillings.companyid, companyid),
          eq(projectbillings.customerid, customerid),
          eq(projectbillings.billed, true),
        ),
      );
    return [...new Set([...own.map((p) => p.id), ...engaged.map((p) => p.id)])];
  }

  /**
   * Write the caller's billing settings for an engaged client project. Creates the row on first
   * use; when the box is ticked and no Customer is stored, the pre-filled Customer is stored so
   * the statement and the page agree. Never touches companyprojects.
   */
  static async upsertEngaged(
    companyid: string,
    actorid: string,
    project: BillableProject,
    patch: { billed?: boolean; customerid?: string | null; hourlyrate?: string | null; resourcerate?: string | null },
  ): Promise<void> {
    if (!project.engaged) throw new Error('upsertEngaged called for an own project');
    if (patch.customerid) {
      const [c] = await db
        .select({ id: customers.id })
        .from(customers)
        .where(and(eq(customers.id, patch.customerid), eq(customers.companyid, companyid), isNull(customers.archivedat)))
        .limit(1);
      if (!c) throw new NotFoundError('Customer');
    }
    const [existing] = await db
      .select({ id: projectbillings.id, customerid: projectbillings.customerid })
      .from(projectbillings)
      .where(and(eq(projectbillings.companyid, companyid), eq(projectbillings.projectid, project.id)))
      .limit(1);

    const set: Partial<typeof projectbillings.$inferInsert> = { updatedbyid: actorid, updatedat: new Date() };
    if (patch.billed !== undefined) set.billed = patch.billed;
    if (patch.customerid !== undefined) set.customerid = patch.customerid;
    if (patch.hourlyrate !== undefined) set.hourlyrate = patch.hourlyrate;
    if (patch.resourcerate !== undefined) set.resourcerate = patch.resourcerate;
    if (patch.billed === true && patch.customerid === undefined && !existing?.customerid && project.customerid) {
      set.customerid = project.customerid;
    }

    if (existing) {
      await db
        .update(projectbillings)
        .set(set)
        .where(and(eq(projectbillings.id, existing.id), eq(projectbillings.companyid, companyid)));
    } else {
      await db
        .insert(projectbillings)
        .values({ id: uuidv7(), companyid, projectid: project.id, ...set })
        .onConflictDoUpdate({ target: [projectbillings.companyid, projectbillings.projectid], set });
    }
    logger.info({ companyid, projectid: project.id, fields: Object.keys(patch) }, 'Engaged project billing updated');
  }

}
// [SCOPE 005 / T023] END
