import { db } from '~/db/client.js';
import { customers } from '~/db/schema/customer.js';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { NotFoundError, ValidationError } from '~/server/lib/errors.js';
import { createLogger } from '~/server/lib/logger.js';
import { TimeBillingProjectAccess } from '~/server/services/TimeBillingProjectAccess.js';
import type { TimeBillingCustomer } from '~/shared/types/timeBilling.js';

const logger = createLogger('time-billing-customers');

// [SCOPE 005 / T013] BEGIN — Customer billing cycle: weekly by default, bi-weekly if negotiated (FR-009)
export const BILLING_CYCLES = ['weekly', 'biweekly'] as const;
export type BillingCycle = (typeof BILLING_CYCLES)[number];

export function isBillingCycle(v: unknown): v is BillingCycle {
  return typeof v === 'string' && (BILLING_CYCLES as readonly string[]).includes(v);
}

export class TimeBillingCustomerService {
  /** The caller's unarchived Customers by name, each with its billing cycle and billed-project count. */
  static async list(companyid: string): Promise<TimeBillingCustomer[]> {
    const rows = await db
      .select({ id: customers.id, name: customers.name, billingcycle: customers.billingcycle })
      .from(customers)
      .where(and(eq(customers.companyid, companyid), isNull(customers.archivedat)))
      .orderBy(asc(customers.name));
    const projects = await TimeBillingProjectAccess.list(companyid);
    return rows.map((c) => ({
      id: c.id,
      name: c.name,
      billingcycle: isBillingCycle(c.billingcycle) ? c.billingcycle : 'weekly',
      billedProjects: projects.filter((p) => p.billed === true && p.customerid === c.id).length,
    }));
  }

  /** Change a Customer's billing cycle; returns before/after for the audit record. */
  static async setBillingCycle(
    companyid: string,
    customerid: string,
    billingcycle: string,
  ): Promise<{ before: BillingCycle; after: BillingCycle; name: string }> {
    if (!isBillingCycle(billingcycle)) {
      throw new ValidationError('Billing cycle must be weekly or biweekly');
    }
    const scope = and(eq(customers.id, customerid), eq(customers.companyid, companyid), isNull(customers.archivedat));
    const [row] = await db
      .select({ name: customers.name, billingcycle: customers.billingcycle })
      .from(customers)
      .where(scope)
      .limit(1);
    if (!row) throw new NotFoundError('Customer');
    const before: BillingCycle = isBillingCycle(row.billingcycle) ? row.billingcycle : 'weekly';
    await db.update(customers).set({ billingcycle, updatedat: new Date() }).where(scope);
    logger.info({ companyid, customerid, before, after: billingcycle }, 'Customer billing cycle changed');
    return { before, after: billingcycle, name: row.name };
  }
}
// [SCOPE 005 / T013] END
