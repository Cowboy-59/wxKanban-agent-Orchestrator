/**
 * Billing Service
 * Feature 002: Billing configuration, rate management, and invoice generation
 *
 * Handles rate hierarchy (user > project > company), invoice generation, and financial reporting
 */

import { db } from '../db/client.js';
import { projectinvoices, companyprojects, userprofiles, companies } from '../db/schema/index.js';
import { eq, and, gte, lte, sql } from 'drizzle-orm';
import { createLogger } from '../server/lib/logger.js';

const logger = createLogger('billing-service');

/**
 * Get billing rates at all tiers (company, project, user)
 */
export async function getBillingRates(companyid: string, options?: {
  projectid?: string;
  userid?: string;
}): Promise<{
  companyRate: number | null;
  projectRate: number | null;
  userRate: number | null;
  effectiveRate: number | null;
}> {
  try {
    // Get company rate
    const companyResult = await db
      .select({ rate: companies.hourlyrate })
      .from(companies)
      .where(eq(companies.id, companyid));

    const companyRate = companyResult[0]?.rate ? parseFloat(companyResult[0].rate) : null;

    let projectRate: number | null = null;
    let userRate: number | null = null;

    // Get project rate if projectid provided
    if (options?.projectid) {
      const projResult = await db
        .select({ rate: companyprojects.hourlyrate })
        .from(companyprojects)
        .where(eq(companyprojects.id, options.projectid));

      projectRate = projResult[0]?.rate ? parseFloat(projResult[0].rate?.toString() || '') : null;
    }

    // Get user rate if userid provided
    if (options?.userid) {
      const userResult = await db
        .select({ rate: userprofiles.payrate })
        .from(userprofiles)
        .where(eq(userprofiles.id, options.userid));

      userRate = userResult[0]?.rate ? parseFloat(userResult[0].rate) : null;
    }

    // Calculate effective rate (user > project > company)
    const effectiveRate = userRate || projectRate || companyRate;

    return {
      companyRate,
      projectRate,
      userRate,
      effectiveRate,
    };
  } catch (error) {
    logger.error({ error, companyid }, 'Failed to get billing rates');
    throw error;
  }
}

/**
 * Update billing rate at any tier (company/project/user)
 */
export async function updateBillingRate(data: {
  companyid: string;
  level: 'company' | 'project' | 'user';
  entityid?: string;
  hourlyrate: number;
}): Promise<{
  level: string;
  entityid?: string;
  hourlyrate: number;
}> {
  try {
    if (data.hourlyrate <= 0 || data.hourlyrate > 10000) {
      throw new Error('Hourly rate must be between 0 and 10000');
    }

    if (data.level === 'company') {
      await db
        .update(companies)
        .set({ hourlyrate: data.hourlyrate.toString() })
        .where(eq(companies.id, data.companyid));

      logger.info({ companyid: data.companyid, rate: data.hourlyrate }, 'Company rate updated');
    } else if (data.level === 'project' && data.entityid) {
      await db
        .update(companyprojects)
        .set({ hourlyrate: data.hourlyrate.toString() })
        .where(eq(companyprojects.id, data.entityid));

      logger.info({ companyid: data.companyid, projectid: data.entityid, rate: data.hourlyrate }, 'Project rate updated');
    } else if (data.level === 'user' && data.entityid) {
      await db
        .update(userprofiles)
        .set({ payrate: data.hourlyrate.toString() })
        .where(eq(userprofiles.id, data.entityid));

      logger.info({ companyid: data.companyid, userid: data.entityid, rate: data.hourlyrate }, 'User rate updated');
    } else {
      throw new Error('Invalid rate level or missing entity ID');
    }

    return {
      level: data.level,
      entityid: data.entityid,
      hourlyrate: data.hourlyrate,
    };
  } catch (error) {
    logger.error({ error, level: data.level }, 'Failed to update billing rate');
    throw error;
  }
}

/**
 * Generate unique invoice number per company
 */
export async function generateInvoiceNumber(companyid: string): Promise<string> {
  try {
    const year = new Date().getFullYear();

    // Query last invoice number for this year
    const lastInvoice = await db
      .select({ invoicenumber: projectinvoices.invoicenumber })
      .from(projectinvoices)
      .where(eq(projectinvoices.companyid, companyid))
      .orderBy(sql`${projectinvoices.invoicenumber} DESC`)
      .limit(1);

    let nextNum = 1;
    if (lastInvoice.length > 0) {
      const parts = lastInvoice[0].invoicenumber.split('-');
      if (parts.length === 3 && parts[1] === String(year)) {
        const lastNum = parseInt(parts[2], 10);
        nextNum = lastNum + 1;
      }
    }

    return `INV-${year}-${String(nextNum).padStart(4, '0')}`;
  } catch (error) {
    logger.error({ error, companyid }, 'Failed to generate invoice number');
    throw error;
  }
}

/**
 * Generate invoice for date range (simplified - summary only)
 */
export async function generateInvoice(data: {
  companyid: string;
  projectid?: string;
  startDate: Date;
  endDate: Date;
  billedto?: string;
  description?: string;
}): Promise<{
  invoiceid: string;
  invoicenumber: string;
  totalamount: string;
  hoursworked: string;
}> {
  try {
    // Validate date range
    if (data.startDate >= data.endDate) {
      throw new Error('Start date must be before end date');
    }

    if (data.endDate > new Date()) {
      throw new Error('End date cannot be in the future');
    }

    // Generate invoice number
    const invoicenumber = await generateInvoiceNumber(data.companyid);

    // For now, create invoice with placeholder values
    // In production, would query time entries and calculate actual totals
    const newInvoice = await db
      .insert(projectinvoices)
      .values({
        companyid: data.companyid,
        projectid: data.projectid,
        invoicenumber,
        billedto: data.billedto,
        description: data.description,
        hoursworked: '0.00',
        totalamount: '0.00',
        generatedat: new Date(),
        emailsent: false,
      })
      .returning();

    if (!newInvoice.length) {
      throw new Error('Failed to create invoice');
    }

    const invoiceRecord = newInvoice[0];

    logger.info(
      { invoiceid: invoiceRecord.id, invoicenumber },
      'Invoice generated'
    );

    return {
      invoiceid: invoiceRecord.id,
      invoicenumber,
      totalamount: invoiceRecord.totalamount.toString(),
      hoursworked: invoiceRecord.hoursworked.toString(),
    };
  } catch (error) {
    logger.error({ error, companyid: data.companyid }, 'Failed to generate invoice');
    throw error;
  }
}

/**
 * Get invoices for company with pagination
 */
export async function getInvoices(companyid: string, options?: {
  limit?: number;
  offset?: number;
}): Promise<{
  invoices: Array<{
    invoiceid: string;
    invoicenumber: string;
    totalamount: string;
    hoursworked: string;
    generatedat: Date;
    emailsent: boolean;
  }>;
  total: number;
}> {
  try {
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;

    const invoices = await db
      .select()
      .from(projectinvoices)
      .where(eq(projectinvoices.companyid, companyid))
      .orderBy(sql`${projectinvoices.generatedat} DESC`)
      .limit(limit)
      .offset(offset);

    // Get total count
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(projectinvoices)
      .where(eq(projectinvoices.companyid, companyid));

    const total = Number(countResult[0]?.count) || 0;

    return {
      invoices: invoices.map(inv => ({
        invoiceid: inv.id,
        invoicenumber: inv.invoicenumber,
        totalamount: inv.totalamount.toString(),
        hoursworked: inv.hoursworked.toString(),
        generatedat: inv.generatedat,
        emailsent: inv.emailsent,
      })),
      total,
    };
  } catch (error) {
    logger.error({ error, companyid }, 'Failed to get invoices');
    throw error;
  }
}

/**
 * Generate financial report for date range (summary metrics)
 */
export async function generateFinancialReport(companyid: string, options?: {
  startDate?: Date;
  endDate?: Date;
}): Promise<{
  period: {
    startDate: Date;
    endDate: Date;
  };
  metrics: {
    invoiceCount: number;
    totalAmount: string;
    averageAmount: string;
    emailedCount: number;
  };
}> {
  try {
    const endDate = options?.endDate || new Date();
    const startDate = options?.startDate || new Date(endDate.getFullYear(), endDate.getMonth(), 1);

    // Query invoice metrics
    const invoices = await db
      .select()
      .from(projectinvoices)
      .where(and(
        eq(projectinvoices.companyid, companyid),
        gte(projectinvoices.generatedat, startDate),
        lte(projectinvoices.generatedat, endDate)
      ));

    const invoiceCount = invoices.length;
    const emailedCount = invoices.filter(inv => inv.emailsent).length;

    // Calculate totals (converting from numeric string)
    let totalAmount = 0;
    invoices.forEach(inv => {
      totalAmount += parseFloat(inv.totalamount);
    });

    const averageAmount = invoiceCount > 0 ? (totalAmount / invoiceCount).toFixed(2) : '0.00';

    return {
      period: { startDate, endDate },
      metrics: {
        invoiceCount,
        totalAmount: totalAmount.toFixed(2),
        averageAmount,
        emailedCount,
      },
    };
  } catch (error) {
    logger.error({ error, companyid }, 'Failed to generate financial report');
    throw error;
  }
}

/**
 * Mark invoice as sent via email
 */
export async function markInvoiceAsSent(invoiceid: string, companyid: string): Promise<void> {
  try {
    await db
      .update(projectinvoices)
      .set({ emailsent: true, sentat: new Date() })
      .where(and(
        eq(projectinvoices.id, invoiceid),
        eq(projectinvoices.companyid, companyid)
      ));

    logger.info({ invoiceid }, 'Invoice marked as sent');
  } catch (error) {
    logger.error({ error, invoiceid }, 'Failed to mark invoice as sent');
    throw error;
  }
}
