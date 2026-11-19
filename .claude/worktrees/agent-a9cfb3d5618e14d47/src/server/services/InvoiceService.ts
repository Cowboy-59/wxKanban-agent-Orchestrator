import { db } from '~/db/client.js';
import { projectinvoices } from '~/db/schema/projectinvoice.js';
import { projecttimeentries } from '~/db/schema/projecttimeentry.js';
import { eq, and, gte, lte } from 'drizzle-orm';
import { logger } from '~/server/lib/logger.js';
import { v7 as uuid } from 'uuid';

/**
 * Invoice Interface
 */
export interface Invoice {
  id: string;
  projectid?: string;
  companyid: string;
  clientemail?: string;
  invoicenumber: string;
  billedto?: string;
  generatedat: Date;
  totalamount: string;
  hoursworked: string;
  description?: string;
  downloadurl?: string;
  emailsent: boolean;
  sentat?: Date;
  createdat: Date;
}

/**
 * Create Invoice Request
 */
export interface CreateInvoiceRequest {
  companyid: string;
  projectid?: string;
  billedto?: string;
  clientemail?: string;
  startdate: Date;
  enddate: Date;
  hourlyRate: number;
  description?: string;
}

/**
 * Invoice Line Item
 */
export interface InvoiceLineItem {
  description: string;
  date: Date;
  hours: number;
  hourlyRate: number;
  subtotal: number;
}

/**
 * InvoiceService
 * Handles invoice generation and management
 */
export class InvoiceService {
  /**
   * Generate invoice from time entries
   */
  static async generateInvoice(request: CreateInvoiceRequest): Promise<Invoice> {
    const invoiceid = uuid();
    const invoicenumber = `INV-${new Date().getFullYear()}-${String(uuid()).substring(0, 8).toUpperCase()}`;
    const now = new Date();

    logger.info(
      { companyid: request.companyid, startdate: request.startdate, enddate: request.enddate },
      'Generating invoice'
    );

    try {
      // Get billable time entries
      const timeEntries = await db
        .select()
        .from(projecttimeentries)
        .where(
          and(
            eq(projecttimeentries.billable, true),
            eq(projecttimeentries.invoiced, false),
            gte(projecttimeentries.starttime, request.startdate),
            lte(projecttimeentries.starttime, request.enddate),
            request.projectid ? eq(projecttimeentries.projectid, request.projectid) : undefined,
          )
        );

      if (timeEntries.length === 0) {
        logger.warn({ companyid: request.companyid }, 'No billable time entries found for invoice');
        throw new Error('No billable time entries found for the specified period');
      }

      // Calculate totals (duration is in minutes in the schema comment says "in minutes")
      const totalMinutes = timeEntries.reduce((sum, entry) => sum + (entry.duration || 0), 0);
      const totalHours = totalMinutes / 60;
      const totalAmount = totalHours * request.hourlyRate;

      // Create invoice record
      const [newInvoice] = await db
        .insert(projectinvoices)
        .values({
          id: invoiceid,
          companyid: request.companyid,
          projectid: request.projectid || null,
          invoicenumber,
          billedto: request.billedto || null,
          clientemail: request.clientemail || null,
          totalamount: totalAmount.toString(),
          hoursworked: totalHours.toString(),
          description: request.description || null,
          generatedat: now,
          emailsent: false,
          createdat: now,
        })
        .returning();

      logger.info(
        { invoiceid, companyid: request.companyid, totalamount: totalAmount },
        'Invoice generated'
      );

      return newInvoice as Invoice;
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error', request },
        'Failed to generate invoice'
      );
      throw error;
    }
  }

  /**
   * Get invoice by ID
   */
  static async getInvoice(invoiceid: string, companyid: string): Promise<Invoice | null> {
    try {
      const inv = await db
        .select()
        .from(projectinvoices)
        .where(and(eq(projectinvoices.id, invoiceid), eq(projectinvoices.companyid, companyid)))
        .then((rows) => rows[0]);

      return inv as Invoice | null;
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error', invoiceid },
        'Failed to fetch invoice'
      );
      throw error;
    }
  }

  /**
   * List invoices for company
   */
  static async listInvoices(
    companyid: string,
    filters?: {
      projectid?: string;
      startDate?: Date;
      endDate?: Date;
      limit?: number;
      offset?: number;
    }
  ): Promise<Invoice[]> {
    try {
      const results = await db
        .select()
        .from(projectinvoices)
        .where(
          and(
            eq(projectinvoices.companyid, companyid),
            filters?.projectid ? eq(projectinvoices.projectid, filters.projectid) : undefined,
            filters?.startDate ? gte(projectinvoices.generatedat, filters.startDate) : undefined,
            filters?.endDate ? lte(projectinvoices.generatedat, filters.endDate) : undefined,
          )
        );

      // Apply pagination
      let result = results as Invoice[];
      if (filters?.offset) {
        result = result.slice(filters.offset);
      }
      if (filters?.limit) {
        result = result.slice(0, filters.limit);
      }

      return result;
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error', companyid },
        'Failed to fetch invoices'
      );
      throw error;
    }
  }

  /**
   * Get invoice line items (time entries)
   */
  static async getInvoiceLineItems(
    invoiceid: string,
    companyid: string,
    hourlyRate: number
  ): Promise<InvoiceLineItem[]> {
    try {
      const inv = await this.getInvoice(invoiceid, companyid);

      if (!inv) {
        throw new Error('Invoice not found');
      }

      // Get time entries for this invoice period (note: duration is in minutes)
      const entries = await db
        .select()
        .from(projecttimeentries)
        .where(
          and(
            eq(projecttimeentries.billable, true),
            gte(projecttimeentries.starttime, new Date(inv.createdat.getTime() - 30 * 24 * 60 * 60 * 1000)), // Approximate period
            lte(projecttimeentries.starttime, inv.createdat)
          )
        );

      if (inv.projectid) {
        return entries
          .filter((e) => e.projectid === inv.projectid)
          .map((entry) => ({
            description: entry.notes || 'Time entry',
            date: entry.starttime,
            hours: (entry.duration || 0) / 60, // duration is in minutes
            hourlyRate,
            subtotal: Math.round(((entry.duration || 0) / 60) * hourlyRate * 100) / 100,
          }));
      }

      return entries.map((entry) => ({
        description: entry.notes || 'Time entry',
        date: entry.starttime,
        hours: (entry.duration || 0) / 60, // duration is in minutes
        hourlyRate,
        subtotal: Math.round(((entry.duration || 0) / 60) * hourlyRate * 100) / 100,
      }));
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error', invoiceid },
        'Failed to fetch invoice line items'
      );
      throw error;
    }
  }

  /**
   * Update invoice (mark as sent)
   */
  static async markInvoiceAsSent(
    invoiceid: string,
    companyid: string
  ): Promise<Invoice> {
    const now = new Date();

    logger.info({ invoiceid, companyid }, 'Marking invoice as sent');

    try {
      const inv = await this.getInvoice(invoiceid, companyid);

      if (!inv) {
        throw new Error('Invoice not found');
      }

      const [updated] = await db
        .update(projectinvoices)
        .set({
          emailsent: true,
          sentat: now,
        })
        .where(eq(projectinvoices.id, invoiceid))
        .returning();

      logger.info({ invoiceid, companyid }, 'Invoice marked as sent');
      return updated as Invoice;
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error', invoiceid },
        'Failed to update invoice'
      );
      throw error;
    }
  }

  /**
   * Mark time entries as invoiced
   */
  static async markTimeEntriesAsInvoiced(
    invoiceid: string,
    companyid: string
  ): Promise<number> {
    const now = new Date();

    logger.info({ invoiceid, companyid }, 'Marking time entries as invoiced');

    try {
      const inv = await this.getInvoice(invoiceid, companyid);

      if (!inv) {
        throw new Error('Invoice not found');
      }

      // Update time entries that fall within invoice date range
      await db
        .update(projecttimeentries)
        .set({
          invoiced: true,
          invoicedat: now,
          updatedat: now,
        })
        .where(
          and(
            eq(projecttimeentries.billable, true),
            gte(projecttimeentries.starttime, new Date(inv.createdat.getTime() - 30 * 24 * 60 * 60 * 1000)),
            lte(projecttimeentries.starttime, inv.createdat)
          )
        );

      logger.info({ invoiceid, companyid }, 'Time entries marked as invoiced');
      return 1;
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error', invoiceid },
        'Failed to mark time entries as invoiced'
      );
      throw error;
    }
  }

  /**
   * Delete invoice
   */
  static async deleteInvoice(invoiceid: string, companyid: string): Promise<boolean> {
    logger.info({ invoiceid, companyid }, 'Deleting invoice');

    try {
      const inv = await this.getInvoice(invoiceid, companyid);

      if (!inv) {
        logger.warn({ invoiceid }, 'Invoice not found');
        return false;
      }

      if (inv.emailsent) {
        logger.warn({ invoiceid }, 'Cannot delete sent invoice');
        throw new Error('Can only delete unsent invoices');
      }

      await db.delete(projectinvoices).where(eq(projectinvoices.id, invoiceid));

      logger.info({ invoiceid, companyid }, 'Invoice deleted');
      return true;
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error', invoiceid },
        'Failed to delete invoice'
      );
      throw error;
    }
  }

  /**
   * Get invoice statistics
   */
  static async getInvoiceStats(companyid: string): Promise<{
    totalInvoices: number;
    totalRevenue: number;
    sentCount: number;
  }> {
    try {
      const results = await this.listInvoices(companyid);

      const stats = {
        totalInvoices: results.length,
        totalRevenue: results.reduce((sum, inv) => sum + parseFloat(inv.totalamount || '0'), 0),
        sentCount: results.filter((inv) => inv.emailsent).length,
      };

      return stats;
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error', companyid },
        'Failed to get invoice stats'
      );
      throw error;
    }
  }

  /**
   * Generate invoice PDF (prepared for Puppeteer integration)
   * Returns HTML that can be rendered to PDF
   */
  static generateInvoiceHTML(
    invoiceData: Invoice,
    lineItems: InvoiceLineItem[],
    userEmail: string
  ): string {
    const formatCurrency = (amount: number) => {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
      }).format(amount);
    };

    const formatDate = (date: Date) => {
      return new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }).format(date);
    };

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invoice ${invoiceData.invoicenumber}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; color: #333; line-height: 1.6; }
    .container { max-width: 900px; margin: 0 auto; padding: 40px; }
    header { display: flex; justify-content: space-between; margin-bottom: 40px; }
    .logo { font-size: 28px; font-weight: bold; color: #1e40af; }
    .header-right { text-align: right; }
    .invoice-title { font-size: 24px; font-weight: bold; margin-bottom: 10px; }
    .invoice-number { color: #666; font-size: 14px; }
    .invoice-details { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-bottom: 40px; }
    .details-section h4 { font-size: 12px; font-weight: 600; color: #999; text-transform: uppercase; margin-bottom: 8px; }
    .details-section p { font-size: 14px; margin-bottom: 4px; }
    .line-items { margin-bottom: 40px; }
    table { width: 100%; border-collapse: collapse; }
    thead { background: #f5f5f5; border-top: 2px solid #1e40af; border-bottom: 2px solid #1e40af; }
    th { padding: 12px; text-align: left; font-size: 12px; font-weight: 600; text-transform: uppercase; color: #666; }
    td { padding: 12px; border-bottom: 1px solid #eee; font-size: 14px; }
    tr:last-child td { border-bottom: none; }
    .amount { text-align: right; }
    .summary { display: flex; justify-content: flex-end; margin-bottom: 40px; }
    .summary-box { width: 250px; }
    .summary-row { display: flex; justify-content: space-between; padding: 8px 0; font-size: 14px; }
    .summary-row.total { font-size: 16px; font-weight: bold; color: #1e40af; border-top: 2px solid #1e40af; padding-top: 12px; margin-top: 12px; }
    .notes { background: #f9f9f9; padding: 20px; border-radius: 4px; margin-bottom: 40px; font-size: 13px; color: #666; }
    footer { border-top: 1px solid #ddd; padding-top: 20px; text-align: center; color: #999; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="logo">wxKanban</div>
      <div class="header-right">
        <div class="invoice-title">Invoice</div>
        <div class="invoice-number">${invoiceData.invoicenumber}</div>
      </div>
    </header>

    <div class="invoice-details">
      <div>
        <div class="details-section">
          <h4>From</h4>
          <p>wxKanban</p>
          <p>${userEmail}</p>
        </div>
        <div class="details-section" style="margin-top: 30px;">
          <h4>Invoice Details</h4>
          <p><strong>Generated:</strong> ${formatDate(invoiceData.generatedat)}</p>
          <p><strong>Billed To:</strong> ${invoiceData.billedto || 'N/A'}</p>
        </div>
      </div>
      <div>
        <div class="details-section">
          <h4>Invoice Information</h4>
          <p><strong>Invoice Number:</strong> ${invoiceData.invoicenumber}</p>
          <p><strong>Hours Worked:</strong> ${invoiceData.hoursworked}</p>
        </div>
      </div>
    </div>

    <div class="line-items">
      <table>
        <thead>
          <tr>
            <th>Description</th>
            <th style="text-align: right;">Date</th>
            <th style="text-align: right;">Hours</th>
            <th style="text-align: right;">Rate</th>
            <th style="text-align: right;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${lineItems
            .map(
              (item) => `
            <tr>
              <td>${item.description}</td>
              <td class="amount">${formatDate(item.date)}</td>
              <td class="amount">${item.hours.toFixed(2)}</td>
              <td class="amount">${formatCurrency(item.hourlyRate)}</td>
              <td class="amount"><strong>${formatCurrency(item.subtotal)}</strong></td>
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>
    </div>

    <div class="summary">
      <div class="summary-box">
        <div class="summary-row total">
          <span>Total Amount</span>
          <span>${formatCurrency(parseFloat(invoiceData.totalamount))}</span>
        </div>
      </div>
    </div>

    ${invoiceData.description
      ? `
    <div class="notes">
      <strong>Notes:</strong><br>
      ${invoiceData.description.replace(/\n/g, '<br>')}
    </div>
    `
      : ''}

    <footer>
      <p>Thank you for your business!</p>
      <p>wxKanban • Time Tracking & Invoice Management</p>
    </footer>
  </div>
</body>
</html>
    `;
  }
}
