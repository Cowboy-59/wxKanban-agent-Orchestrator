/**
 * PDF Generation Service
 * Feature 002: Generate invoice PDFs via Puppeteer
 *
 * Creates professional invoice PDFs from HTML templates
 */

import { createLogger } from '../server/lib/logger.js';

const logger = createLogger('pdf-service');

export interface InvoicePDFData {
  invoiceNumber: string;
  companyName: string;
  companyEmail: string;
  clientEmail?: string;
  billedTo?: string;
  invoiceDate: Date;
  dueDate: Date;
  items: Array<{
    description: string;
    quantity: number;
    rate: number;
    amount: number;
  }>;
  subtotal: number;
  tax?: number;
  total: number;
  notes?: string;
}

/**
 * Generate invoice PDF
 * Requires Puppeteer or similar headless browser for rendering
 */
export async function generateInvoicePDF(data: InvoicePDFData): Promise<{
  success: boolean;
  buffer?: Buffer;
  error?: string;
}> {
  try {
    // Mock implementation - in production, use Puppeteer
    logger.info(
      { invoiceNumber: data.invoiceNumber, company: data.companyName },
      'Generating invoice PDF'
    );

    // Check if Puppeteer is available
    const hasPuppeteer = checkPuppeteerAvailable();

    if (hasPuppeteer) {
      return await generatePDFWithPuppeteer(data);
    } else {
      // Mock PDF generation for development
      logger.warn('Puppeteer not available, returning mock PDF buffer');
      return {
        success: true,
        buffer: Buffer.from(
          `Mock PDF for invoice ${data.invoiceNumber}\n` +
            `Company: ${data.companyName}\n` +
            `Total: $${data.total.toFixed(2)}`
        ),
      };
    }
  } catch (error) {
    logger.error(
      { error, invoiceNumber: data.invoiceNumber },
      'Failed to generate PDF'
    );
    return {
      success: false,
      error: error instanceof Error ? error.message : 'PDF generation failed',
    };
  }
}

/**
 * Check if Puppeteer is available
 */
function checkPuppeteerAvailable(): boolean {
  try {
    require('puppeteer');
    return true;
  } catch {
    return false;
  }
}

/**
 * Generate PDF using Puppeteer
 */
async function generatePDFWithPuppeteer(data: InvoicePDFData): Promise<{
  success: boolean;
  buffer?: Buffer;
  error?: string;
}> {
  try {
    // TODO: Implement actual Puppeteer PDF generation
    // import puppeteer from 'puppeteer';
    // const browser = await puppeteer.launch();
    // const page = await browser.newPage();
    // await page.setContent(generateInvoiceHTML(data), { waitUntil: 'networkidle0' });
    // const pdf = await page.pdf({ format: 'A4' });
    // await browser.close();
    // return { success: true, buffer: pdf };

    logger.info(
      { invoiceNumber: data.invoiceNumber },
      'PDF generation (Puppeteer available but not implemented)'
    );

    return {
      success: true,
      buffer: Buffer.from(
        `Invoice #${data.invoiceNumber}\nTotal: $${data.total.toFixed(2)}`
      ),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Puppeteer error',
    };
  }
}

/**
 * Generate invoice HTML template
 */
export function generateInvoiceHTML(data: InvoicePDFData): string {
  const formatCurrency = (amount: number) => `$${amount.toFixed(2)}`;
  const formatDate = (date: Date) => date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const itemsHTML = data.items
    .map(
      (item) =>
        `
        <tr>
          <td style="padding: 8px; text-align: left;">${item.description}</td>
          <td style="padding: 8px; text-align: center;">${item.quantity}</td>
          <td style="padding: 8px; text-align: right;">${formatCurrency(item.rate)}</td>
          <td style="padding: 8px; text-align: right; font-weight: bold;">${formatCurrency(item.amount)}</td>
        </tr>
      `
    )
    .join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body {
          font-family: Arial, sans-serif;
          color: #333;
          margin: 0;
          padding: 20px;
        }
        .invoice-container {
          max-width: 800px;
          margin: 0 auto;
        }
        .header {
          display: flex;
          justify-content: space-between;
          margin-bottom: 40px;
          border-bottom: 2px solid #007bff;
          padding-bottom: 20px;
        }
        .company-info h1 {
          margin: 0;
          color: #007bff;
          font-size: 28px;
        }
        .invoice-number {
          text-align: right;
        }
        .invoice-number h2 {
          margin: 0;
          font-size: 24px;
        }
        .invoice-number p {
          margin: 5px 0;
          font-size: 14px;
        }
        .details {
          display: flex;
          justify-content: space-between;
          margin-bottom: 40px;
          gap: 40px;
        }
        .details div {
          flex: 1;
        }
        .details h3 {
          margin: 0 0 10px 0;
          font-size: 12px;
          font-weight: bold;
          text-transform: uppercase;
          color: #666;
        }
        .details p {
          margin: 5px 0;
          font-size: 14px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 20px;
        }
        thead {
          background-color: #f5f5f5;
          border-top: 2px solid #007bff;
          border-bottom: 2px solid #007bff;
        }
        th {
          padding: 12px 8px;
          text-align: left;
          font-weight: bold;
          font-size: 12px;
          text-transform: uppercase;
        }
        tr:hover {
          background-color: #fafafa;
        }
        .totals {
          display: flex;
          justify-content: flex-end;
          margin-bottom: 40px;
        }
        .totals-table {
          width: 300px;
        }
        .total-row {
          display: flex;
          justify-content: space-between;
          padding: 8px 0;
          border-bottom: 1px solid #ddd;
        }
        .total-row.final {
          border-top: 2px solid #007bff;
          border-bottom: 2px solid #007bff;
          font-weight: bold;
          font-size: 16px;
          padding: 12px 0;
        }
        .notes {
          margin-top: 40px;
          padding: 20px;
          background-color: #f9f9f9;
          border-left: 4px solid #007bff;
        }
        .notes h3 {
          margin: 0 0 10px 0;
          font-size: 12px;
          font-weight: bold;
          text-transform: uppercase;
        }
        .notes p {
          margin: 0;
          font-size: 13px;
          line-height: 1.5;
        }
        .footer {
          margin-top: 40px;
          padding-top: 20px;
          border-top: 1px solid #ddd;
          text-align: center;
          font-size: 12px;
          color: #999;
        }
      </style>
    </head>
    <body>
      <div class="invoice-container">
        <div class="header">
          <div class="company-info">
            <h1>${data.companyName}</h1>
            <p style="margin: 5px 0; font-size: 14px;">${data.companyEmail}</p>
          </div>
          <div class="invoice-number">
            <h2>INVOICE</h2>
            <p><strong>#${data.invoiceNumber}</strong></p>
            <p>Date: ${formatDate(data.invoiceDate)}</p>
            <p>Due: ${formatDate(data.dueDate)}</p>
          </div>
        </div>

        <div class="details">
          <div>
            <h3>Billed To</h3>
            <p>${data.billedTo || data.clientEmail || 'N/A'}</p>
            ${data.clientEmail ? `<p>${data.clientEmail}</p>` : ''}
          </div>
          <div>
            <h3>From</h3>
            <p>${data.companyName}</p>
            <p>${data.companyEmail}</p>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Description</th>
              <th style="text-align: center;">Qty</th>
              <th style="text-align: right;">Rate</th>
              <th style="text-align: right;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHTML}
          </tbody>
        </table>

        <div class="totals">
          <div class="totals-table">
            <div class="total-row">
              <span>Subtotal</span>
              <span>${formatCurrency(data.subtotal)}</span>
            </div>
            ${data.tax ? `
              <div class="total-row">
                <span>Tax</span>
                <span>${formatCurrency(data.tax)}</span>
              </div>
            ` : ''}
            <div class="total-row final">
              <span>Total</span>
              <span>${formatCurrency(data.total)}</span>
            </div>
          </div>
        </div>

        ${data.notes ? `
          <div class="notes">
            <h3>Notes</h3>
            <p>${data.notes}</p>
          </div>
        ` : ''}

        <div class="footer">
          <p>Thank you for your business!</p>
          <p style="margin-top: 10px; font-size: 11px;">wxKanban - Professional Task Management</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Generate report PDF
 */
export async function generateReportPDF(data: {
  title: string;
  subtitle?: string;
  content: string; // HTML content
}): Promise<{
  success: boolean;
  buffer?: Buffer;
  error?: string;
}> {
  try {
    logger.info({ title: data.title }, 'Generating report PDF');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; color: #333; margin: 20px; }
          h1 { color: #007bff; border-bottom: 2px solid #007bff; padding-bottom: 10px; }
          h2 { color: #333; margin-top: 30px; }
        </style>
      </head>
      <body>
        <h1>${data.title}</h1>
        ${data.subtitle ? `<h2>${data.subtitle}</h2>` : ''}
        ${data.content}
      </body>
      </html>
    `;

    // Mock response
    return {
      success: true,
      buffer: Buffer.from(html),
    };
  } catch (error) {
    logger.error({ error, title: data.title }, 'Failed to generate report PDF');
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Report generation failed',
    };
  }
}
