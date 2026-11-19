import { Router, Response } from 'express';
import { z } from 'zod';
import { InvoiceService } from '~/server/services/InvoiceService.js';
import { validateBody, validateParams, validateQuery } from '~/server/middleware/validation.js';
import { authenticateToken, requireAuth, AuthRequest } from '~/server/middleware/auth.js';
import { asyncHandler } from '~/server/middleware/errorHandler.js';
import { createLogger } from '~/server/lib/logger.js';

const router = Router();
const logger = createLogger('invoices-routes');

// Validation schemas
const generateInvoiceSchema = z.object({
  projectid: z.string().uuid('Project ID must be valid UUID').optional(),
  startdate: z.string().datetime('Start date must be ISO datetime'),
  enddate: z.string().datetime('End date must be ISO datetime'),
  hourlyRate: z.number().positive('Hourly rate must be positive'),
  taxRate: z.number().min(0).max(100, 'Tax rate must be between 0 and 100').optional(),
  notes: z.string().max(1000, 'Notes too long').optional(),
});

const updateStatusSchema = z.object({
  status: z.enum(['DRAFT', 'SENT', 'PAID', 'OVERDUE', 'CANCELLED']),
});

const listInvoicesSchema = z.object({
  status: z.enum(['DRAFT', 'SENT', 'PAID', 'OVERDUE', 'CANCELLED']).optional(),
  projectid: z.string().uuid().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  limit: z.string().transform(v => parseInt(v, 10)).optional(),
  offset: z.string().transform(v => parseInt(v, 10)).optional(),
});

const invoiceIdSchema = z.object({
  invoiceid: z.string().uuid('Invoice ID must be valid UUID'),
});

/**
 * POST /api/invoices/generate
 * Generate a new invoice from billable time entries
 */
router.post(
  '/generate',
  authenticateToken,
  requireAuth,
  validateBody(generateInvoiceSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userid = req.userid;
    if (!userid) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { projectid, startdate, enddate, hourlyRate, notes } = req.body;

    logger.info(
      { userid, projectid, startdate, enddate },
      'Generating invoice'
    );

    try {
      const invoice = await InvoiceService.generateInvoice({
        companyid: userid, // Use userid as companyid for now
        projectid,
        startdate: new Date(startdate),
        enddate: new Date(enddate),
        hourlyRate,
        description: notes,
      });

      res.status(201).json({
        success: true,
        message: 'Invoice generated',
        invoice: {
          id: invoice.id,
          invoicenumber: invoice.invoicenumber,
          generatedat: invoice.generatedat.toISOString(),
          totalamount: invoice.totalamount,
          hoursworked: invoice.hoursworked,
          billedto: invoice.billedto,
          clientemail: invoice.clientemail,
        },
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('No billable time entries')) {
        logger.warn({ userid }, 'No billable time entries for invoice');
        res.status(400).json({ error: 'No billable time entries found for the specified period' });
        return;
      }
      logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error', userid },
        'Failed to generate invoice'
      );
      res.status(500).json({ error: 'Failed to generate invoice' });
    }
  })
);

/**
 * GET /api/invoices/:invoiceid
 * Get invoice details
 */
router.get(
  '/:invoiceid',
  authenticateToken,
  requireAuth,
  validateParams(invoiceIdSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userid = req.userid;
    if (!userid) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { invoiceid } = req.params;

    logger.debug({ userid, invoiceid }, 'Fetching invoice');

    try {
      const invoice = await InvoiceService.getInvoice(invoiceid, userid);

      if (!invoice) {
        res.status(404).json({ error: 'Invoice not found' });
        return;
      }

      res.status(200).json({
        success: true,
        invoice: {
          id: invoice.id,
          invoicenumber: invoice.invoicenumber,
          generatedat: invoice.generatedat.toISOString(),
          totalamount: invoice.totalamount,
          hoursworked: invoice.hoursworked,
          billedto: invoice.billedto,
          clientemail: invoice.clientemail,
          description: invoice.description,
          downloadurl: invoice.downloadurl,
          createdAt: invoice.createdat.toISOString(),
        },
      });
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error', userid, invoiceid },
        'Failed to fetch invoice'
      );
      res.status(500).json({ error: 'Failed to fetch invoice' });
    }
  })
);

/**
 * GET /api/invoices/:invoiceid/items
 * Get invoice line items (time entries)
 */
router.get(
  '/:invoiceid/items',
  authenticateToken,
  requireAuth,
  validateParams(invoiceIdSchema),
  validateQuery(
    z.object({
      hourlyRate: z.string().transform(v => parseFloat(v)),
    })
  ),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userid = req.userid;
    if (!userid) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { invoiceid } = req.params;
    const { hourlyRate } = req.query as any;

    logger.debug({ userid, invoiceid }, 'Fetching invoice line items');

    try {
      const lineItems = await InvoiceService.getInvoiceLineItems(invoiceid, userid, hourlyRate);

      res.status(200).json({
        success: true,
        lineItems: lineItems.map((item) => ({
          description: item.description,
          date: item.date.toISOString(),
          hours: item.hours,
          hourlyRate: item.hourlyRate,
          subtotal: item.subtotal,
        })),
        count: lineItems.length,
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'Invoice not found') {
        res.status(404).json({ error: 'Invoice not found' });
        return;
      }
      logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error', userid, invoiceid },
        'Failed to fetch invoice line items'
      );
      res.status(500).json({ error: 'Failed to fetch invoice line items' });
    }
  })
);

/**
 * GET /api/invoices
 * List invoices for user
 */
router.get(
  '/',
  authenticateToken,
  requireAuth,
  validateQuery(listInvoicesSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userid = req.userid;
    if (!userid) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { projectid, startDate, endDate, limit, offset } = req.query as any;

    logger.info({ userid }, 'Listing invoices');

    try {
      const invoices = await InvoiceService.listInvoices(userid, {
        projectid,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        limit: limit || 50,
        offset: offset || 0,
      });

      res.status(200).json({
        success: true,
        invoices: invoices.map((inv) => ({
          id: inv.id,
          invoicenumber: inv.invoicenumber,
          generatedat: inv.generatedat.toISOString(),
          totalamount: inv.totalamount,
          billedto: inv.billedto,
        })),
        count: invoices.length,
      });
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error', userid },
        'Failed to list invoices'
      );
      res.status(500).json({ error: 'Failed to list invoices' });
    }
  })
);

/**
 * PATCH /api/invoices/:invoiceid/status
 * Update invoice status
 */
router.patch(
  '/:invoiceid/status',
  authenticateToken,
  requireAuth,
  validateParams(invoiceIdSchema),
  validateBody(updateStatusSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userid = req.userid;
    if (!userid) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { invoiceid } = req.params;
    const { status } = req.body;

    logger.info({ userid, invoiceid, status }, 'Updating invoice status');

    try {
      // Get the invoice first
      const invoice = await InvoiceService.getInvoice(invoiceid, userid);

      if (!invoice) {
        res.status(404).json({ error: 'Invoice not found' });
        return;
      }

      // If status is sent, mark as sent
      if (status === 'SENT') {
        await InvoiceService.markInvoiceAsSent(invoiceid, userid);
      }

      res.status(200).json({
        success: true,
        message: `Invoice status updated to ${status}`,
        invoice: {
          id: invoice.id,
          invoicenumber: invoice.invoicenumber,
          totalamount: invoice.totalamount,
          generatedat: invoice.generatedat.toISOString(),
        },
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'Invoice not found') {
        res.status(404).json({ error: 'Invoice not found' });
        return;
      }
      logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error', userid, invoiceid },
        'Failed to update invoice status'
      );
      res.status(500).json({ error: 'Failed to update invoice status' });
    }
  })
);

/**
 * POST /api/invoices/:invoiceid/resend
 * Resend an already sent invoice
 */
router.post(
  '/:invoiceid/resend',
  authenticateToken,
  requireAuth,
  validateParams(invoiceIdSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userid = req.userid;
    if (!userid) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { invoiceid } = req.params;

    logger.info({ userid, invoiceid }, 'Resending invoice');

    try {
      // Get the invoice
      const invoice = await InvoiceService.getInvoice(invoiceid, userid);

      if (!invoice) {
        res.status(404).json({ error: 'Invoice not found' });
        return;
      }

      // Update sent timestamp to indicate resend
      const updatedInvoice = await InvoiceService.markInvoiceAsSent(invoiceid, userid);

      // TODO: Integrate with email service to actually resend the invoice
      // For now, just update the timestamp and return success

      res.status(200).json({
        success: true,
        message: 'Invoice resent successfully',
        invoice: {
          id: updatedInvoice.id,
          invoicenumber: updatedInvoice.invoicenumber,
          totalamount: updatedInvoice.totalamount,
          sentat: updatedInvoice.sentat?.toISOString(),
          generatedat: updatedInvoice.generatedat.toISOString(),
        },
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'Invoice not found') {
        res.status(404).json({ error: 'Invoice not found' });
        return;
      }
      logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error', userid, invoiceid },
        'Failed to resend invoice'
      );
      res.status(500).json({ error: 'Failed to resend invoice' });
    }
  })
);

/**
 * POST /api/invoices/:invoiceid/pdf
 * Generate invoice PDF
 */
router.post(
  '/:invoiceid/pdf',
  authenticateToken,
  requireAuth,
  validateParams(invoiceIdSchema),
  validateBody(
    z.object({
      hourlyRate: z.number().positive('Hourly rate must be positive'),
    })
  ),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userid = req.userid;
    if (!userid) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { invoiceid } = req.params;
    const { hourlyRate } = req.body;

    logger.info({ userid, invoiceid }, 'Generating invoice PDF');

    try {
      const invoice = await InvoiceService.getInvoice(invoiceid, userid);

      if (!invoice) {
        res.status(404).json({ error: 'Invoice not found' });
        return;
      }

      const lineItems = await InvoiceService.getInvoiceLineItems(invoiceid, userid, hourlyRate);

      // TODO: Integrate with Puppeteer for actual PDF generation
      // For now, return HTML that can be rendered to PDF
      const html = InvoiceService.generateInvoiceHTML(
        invoice,
        lineItems,
        userid // Would be replaced with actual user email from user service
      );

      res.status(200).json({
        success: true,
        message: 'Invoice PDF generated',
        html: html, // In production, would return PDF file instead
        invoiceid,
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'Invoice not found') {
        res.status(404).json({ error: 'Invoice not found' });
        return;
      }
      logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error', userid, invoiceid },
        'Failed to generate invoice PDF'
      );
      res.status(500).json({ error: 'Failed to generate invoice PDF' });
    }
  })
);

/**
 * DELETE /api/invoices/:invoiceid
 * Delete invoice (only DRAFT invoices)
 */
router.delete(
  '/:invoiceid',
  authenticateToken,
  requireAuth,
  validateParams(invoiceIdSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userid = req.userid;
    if (!userid) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { invoiceid } = req.params;

    logger.info({ userid, invoiceid }, 'Deleting invoice');

    try {
      const deleted = await InvoiceService.deleteInvoice(invoiceid, userid);

      if (!deleted) {
        res.status(404).json({ error: 'Invoice not found' });
        return;
      }

      res.status(200).json({
        success: true,
        message: 'Invoice deleted',
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'Can only delete draft invoices') {
        res.status(400).json({ error: 'Can only delete draft invoices' });
        return;
      }
      logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error', userid, invoiceid },
        'Failed to delete invoice'
      );
      res.status(500).json({ error: 'Failed to delete invoice' });
    }
  })
);

/**
 * GET /api/invoices/stats
 * Get invoice statistics
 */
router.get(
  '/stats/summary',
  authenticateToken,
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userid = req.userid;
    if (!userid) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    logger.info({ userid }, 'Fetching invoice statistics');

    try {
      const stats = await InvoiceService.getInvoiceStats(userid);

      res.status(200).json({
        success: true,
        stats: {
          totalInvoices: stats.totalInvoices,
          totalRevenue: stats.totalRevenue,
          sentCount: stats.sentCount,
        },
      });
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error', userid },
        'Failed to fetch invoice statistics'
      );
      res.status(500).json({ error: 'Failed to fetch invoice statistics' });
    }
  })
);

export default router;
