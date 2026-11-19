import { db } from '~/db/client.js';
import { companies } from '~/db/schema/company.js';
import { eq } from 'drizzle-orm';
import { createLogger } from '~/server/lib/logger.js';
import { MarkdownPdfRenderer } from '~/server/services/MarkdownPdfRenderer.js';
import { TimeBillingSettingsService, type StatementAch } from '~/server/services/TimeBillingSettingsService.js';
import { TimeBillingStatementService, type StatementPage1 } from '~/server/services/TimeBillingStatementService.js';
import { TimeBillingSummaryService, type StatementSummary, type SummaryGroupKey } from '~/server/services/TimeBillingSummaryService.js';

const logger = createLogger('time-billing-statement-pdf');

// [SCOPE 005 / T011] BEGIN — statement HTML: page 1 daily rows, total and ACH; page 2 items done (FR-009, FR-010, FR-012)
export interface StatementDocument {
  companyname: string;
  invoicenumber: string;
  billedto: string;
  periodstart: string;
  periodend: string;
  /** YYYY-MM-DD the statement was generated. */
  generatedon: string;
  page1: StatementPage1;
  summary: StatementSummary;
  /** Full ACH details; the statement is the one place the account number is shown in full (FR-012). */
  ach: StatementAch | null;
}

const GROUP_TITLES: Record<SummaryGroupKey, string> = {
  scopes: 'Scopes',
  bugs: 'Bugs',
  processes: 'Processes',
  brainstorms: 'Brainstorms',
  // [SCOPE 005 / T027] Amendment D groups
  dba: 'DBA',
  management: 'Management',
  meetings: 'Meetings',
};

/** Escape text for HTML. Every value that reaches the document goes through this. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** "1234.50" → "$1,234.50"; negative amounts keep their sign before the dollar sign. */
export function formatMoney(amount: string): string {
  const negative = amount.startsWith('-');
  const [whole = '0', cents = '00'] = (negative ? amount.slice(1) : amount).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}$${grouped}.${cents.padEnd(2, '0').slice(0, 2)}`;
}

/** "N Senior Developers" / "N Resources", singular for one. "Resource", never "AI" (constraint 5). */
export function rowLabel(category: 'developer' | 'resource', count: number): string {
  if (category === 'developer') return `${count} Senior Developer${count === 1 ? '' : 's'}`;
  return `${count} Resource${count === 1 ? '' : 's'}`;
}

/** "2026-10-26" → "Mon 10/26/2026", read as a calendar date with no timezone shift. */
export function formatDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()] ?? '';
  return `${day} ${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`;
}

const STYLE = `
<style>
  .stmt { font-size: 11px; }
  .stmt h1 { font-size: 20px; margin: 0 0 4px; }
  .stmt h2 { font-size: 14px; margin: 18px 0 6px; }
  .stmt .meta { color: #4b5563; margin: 0 0 12px; }
  .stmt table { width: 100%; border-collapse: collapse; margin: 6px 0; }
  .stmt th, .stmt td { border-bottom: 1px solid #e5e7eb; padding: 4px 6px; text-align: left; }
  .stmt th { background: #f3f4f6; font-weight: 600; }
  .stmt td.num, .stmt th.num { text-align: right; white-space: nowrap; }
  .stmt tr.total td { font-weight: 700; border-top: 2px solid #111827; border-bottom: none; }
  .stmt .ach td:first-child { width: 35%; color: #4b5563; }
  .stmt .muted { color: #6b7280; }
  .stmt .page2 { page-break-before: always; }
</style>`;

/** The statement as HTML: page 1 then page 2. Pure, so the layout is testable without Chromium. */
export function buildStatementHtml(doc: StatementDocument): string {
  const e = escapeHtml;
  const rows = doc.page1.rows
    .map(
      (r) =>
        `<tr><td>${e(formatDay(r.workdate))}</td><td>${e(rowLabel(r.category, r.count))}</td>` +
        `<td class="num">${e(r.hours)}</td><td class="num">${e(formatMoney(r.rate))}/hr</td>` +
        `<td class="num">${e(formatMoney(r.amount))}</td></tr>`,
    )
    .join('');

  const ach = doc.ach
    ? `<table class="ach"><tbody>
        <tr><td>Bank</td><td>${e(doc.ach.bankname)}</td></tr>
        <tr><td>Account name</td><td>${e(doc.ach.accountname)}</td></tr>
        <tr><td>Routing number</td><td>${e(doc.ach.routingnumber)}</td></tr>
        <tr><td>Account number</td><td>${e(doc.ach.accountnumber)}</td></tr>
      </tbody></table>`
    : `<p class="muted">ACH payment details have not been set up.</p>`;

  const groups = doc.summary.groups
    .map((g) => {
      const items = g.items
        .map((i) => `<tr><td>${e(i.name)}</td><td class="num">${i.hours === null ? '—' : e(i.hours)}</td></tr>`)
        .join('');
      const more = g.more
        ? `<tr><td class="muted">+${g.more.count} more</td><td class="num muted">${e(g.more.hours)}</td></tr>`
        : '';
      return (
        `<h2>${e(GROUP_TITLES[g.key])} <span class="muted">(${e(g.hours)} hrs)</span></h2>` +
        `<table><thead><tr><th>Item</th><th class="num">Hours</th></tr></thead><tbody>${items}${more}</tbody></table>`
      );
    })
    .join('');

  return `${STYLE}
<div class="stmt">
  <h1>${e(doc.companyname)} — Statement ${e(doc.invoicenumber)}</h1>
  <p class="meta">Bill to: <strong>${e(doc.billedto)}</strong><br>
  Period: ${e(formatDay(doc.periodstart))} to ${e(formatDay(doc.periodend))} · Issued ${e(formatDay(doc.generatedon))}</p>
  <table>
    <thead><tr><th>Date</th><th>Description</th><th class="num">Hours</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead>
    <tbody>${rows}
      <tr class="total"><td colspan="2">Total</td>
        <td class="num">${e(minutesLabel(doc.page1.developerminutes + doc.page1.resourceminutes))}</td><td></td>
        <td class="num">${e(formatMoney(doc.page1.total))}</td></tr>
    </tbody>
  </table>
  <h2>Payment by ACH</h2>
  ${ach}
  <div class="page2">
    <h1>Items done</h1>
    <p class="meta">${e(formatDay(doc.periodstart))} to ${e(formatDay(doc.periodend))} · ${e(doc.summary.totalhours)} hrs</p>
    ${groups || '<p class="muted">No items in this period.</p>'}
  </div>
</div>`;
}

function minutesLabel(minutes: number): string {
  return (minutes / 60).toFixed(2);
}
// [SCOPE 005 / T011] END

// [SCOPE 005 / T011] BEGIN — renderStatementPdf: load a generated statement and render it (FR-009)
/**
 * Render a generated statement of the caller's company to PDF. Page 1 is rebuilt from the
 * entries locked to it and must still equal the stored total, or the PDF is refused
 * (success metric 3 — TimeBillingStatementService.load throws). Nothing here is logged but
 * ids and sizes: ACH values never reach a log line (FR-012).
 */
export async function renderStatementPdf(
  companyid: string,
  invoiceid: string,
): Promise<{ filename: string; pdf: Buffer }> {
  const { invoice, page1 } = await TimeBillingStatementService.load(companyid, invoiceid);
  const summary = await TimeBillingSummaryService.load(companyid, invoiceid);
  const ach = await TimeBillingSettingsService.getStatementAch(companyid);
  const [company] = await db.select({ name: companies.name }).from(companies).where(eq(companies.id, companyid)).limit(1);

  const html = buildStatementHtml({
    companyname: company?.name ?? '',
    invoicenumber: invoice.invoicenumber,
    billedto: invoice.billedto ?? '',
    periodstart: invoice.periodstart ?? '',
    periodend: invoice.periodend ?? '',
    generatedon: (invoice.generatedat ?? invoice.createdat).toISOString().slice(0, 10),
    page1,
    summary,
    ach,
  });
  const pdf = await MarkdownPdfRenderer.renderToPdf(html, `Statement ${invoice.invoicenumber}`);
  logger.info({ companyid, invoiceid, bytes: pdf.length, hasach: ach !== null }, 'Statement PDF rendered');
  return { filename: `${invoice.invoicenumber}.pdf`, pdf };
}
// [SCOPE 005 / T011] END
