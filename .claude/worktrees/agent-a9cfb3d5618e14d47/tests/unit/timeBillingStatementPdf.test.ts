// SPEC-005 / T011 — statement PDF layout. The HTML builder is pure; the renderer and the
// database are mocked, so nothing launches Chromium or opens a connection (the local .env
// points at production).
import { describe, it, expect, vi, beforeEach } from "vitest";

const calls = { rendered: [] as Array<{ html: string; title: string }> };

vi.mock("../../src/db/client.js", () => {
  const c: Record<string, unknown> = {};
  for (const m of ["from", "where", "limit"]) c[m] = () => c;
  c.then = (resolve: (v: unknown[]) => void) => resolve([{ name: "wxperts" }]);
  return { db: { select: () => c } };
});

vi.mock("../../src/server/services/MarkdownPdfRenderer.js", () => ({
  MarkdownPdfRenderer: {
    renderToPdf: async (html: string, title: string): Promise<Buffer> => {
      calls.rendered.push({ html, title });
      return Buffer.from("%PDF-1.7");
    },
  },
}));

const page1 = {
  rows: [
    { workdate: "2026-10-26", category: "developer" as const, count: 1, minutes: 120, hours: "2.00", rate: "150.00", amountcents: 30000, amount: "300.00" },
    { workdate: "2026-10-26", category: "resource" as const, count: 5, minutes: 105, hours: "1.75", rate: "50.00", amountcents: 8750, amount: "87.50" },
  ],
  developerminutes: 120,
  resourceminutes: 105,
  totalcents: 38750,
  total: "387.50",
};

const summary = {
  groups: [
    {
      key: "scopes" as const,
      items: [{ name: "146 Audit <script>", minutes: 165, hours: "2.75" }],
      minutes: 165,
      hours: "2.75",
      more: { count: 3, minutes: 60, hours: "1.00" },
    },
    { key: "bugs" as const, items: [{ name: "Login fails", minutes: null, hours: null }], minutes: 0, hours: "0.00", more: null },
  ],
  totalminutes: 225,
  totalhours: "3.75",
};

const ach = { bankname: "First Bank", routingnumber: "111000025", accountnumber: "123456789012", accountname: "wxperts LLC" };

vi.mock("../../src/server/services/TimeBillingStatementService.js", () => ({
  TimeBillingStatementService: {
    load: async () => ({
      invoice: {
        id: "inv1",
        invoicenumber: "INV-2026-ABCD1234",
        billedto: "Acme",
        periodstart: "2026-10-26",
        periodend: "2026-11-01",
        generatedat: new Date("2026-11-02T12:00:00Z"),
        createdat: new Date("2026-11-02T12:00:00Z"),
      },
      page1,
    }),
  },
}));
vi.mock("../../src/server/services/TimeBillingSummaryService.js", () => ({
  TimeBillingSummaryService: { load: async () => summary },
}));
const achState: { value: typeof ach | null } = { value: ach };
vi.mock("../../src/server/services/TimeBillingSettingsService.js", () => ({
  TimeBillingSettingsService: { getStatementAch: async () => achState.value },
}));

import {
  buildStatementHtml,
  escapeHtml,
  formatDay,
  formatMoney,
  renderStatementPdf,
  rowLabel,
} from "../../src/server/services/TimeBillingStatementPdf.js";

// [SCOPE 005 / T011] BEGIN — unit tests for the statement PDF
beforeEach(() => {
  calls.rendered.length = 0;
  achState.value = ach;
});

const doc = {
  companyname: "wxperts",
  invoicenumber: "INV-2026-ABCD1234",
  billedto: "Acme & Co",
  periodstart: "2026-10-26",
  periodend: "2026-11-01",
  generatedon: "2026-11-02",
  page1,
  summary,
  ach,
};

describe("statement formatting helpers (FR-009)", () => {
  it("formats money with thousands separators and a sign", () => {
    expect(formatMoney("387.50")).toBe("$387.50");
    expect(formatMoney("1234567.5")).toBe("$1,234,567.50");
    expect(formatMoney("-150.00")).toBe("-$150.00");
  });

  it("labels rows N Senior Developers / N Resources, singular for one, never AI", () => {
    expect(rowLabel("developer", 1)).toBe("1 Senior Developer");
    expect(rowLabel("developer", 2)).toBe("2 Senior Developers");
    expect(rowLabel("resource", 5)).toBe("5 Resources");
    expect(rowLabel("resource", 1)).not.toMatch(/\bAI\b/);
  });

  it("reads a workdate as a calendar day with no timezone shift", () => {
    expect(formatDay("2026-10-26")).toBe("Mon 10/26/2026");
    expect(formatDay("2026-11-01")).toBe("Sun 11/01/2026");
  });

  it("escapes HTML", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  });
});

describe("buildStatementHtml (FR-009, FR-010, FR-012)", () => {
  const html = buildStatementHtml(doc);

  it("page 1 carries every row with hours, rate and amount, and the total", () => {
    expect(html).toContain("1 Senior Developer");
    expect(html).toContain("5 Resources");
    expect(html).toContain("$150.00/hr");
    expect(html).toContain("$87.50");
    expect(html).toContain("$387.50");
    expect(html).toContain("3.75");
  });

  it("carries the full ACH details on the statement", () => {
    expect(html).toContain("111000025");
    expect(html).toContain("123456789012");
  });

  it("says ACH is not set up instead of printing a partial account", () => {
    expect(buildStatementHtml({ ...doc, ach: null })).toContain("ACH payment details have not been set up");
  });

  it("page 2 starts on a new page and lists groups, items and +N more", () => {
    expect(html).toContain('class="page2"');
    expect(html).toContain("Items done");
    expect(html).toContain("Scopes");
    expect(html).toContain("+3 more");
    expect(html).toMatch(/Login fails<\/td><td class="num">—/);
  });

  it("escapes every value, so item names cannot inject markup", () => {
    expect(html).not.toContain("<script>");
    expect(html).toContain("146 Audit &lt;script&gt;");
    expect(html).toContain("Acme &amp; Co");
  });

  it("never uses the word AI", () => {
    expect(html).not.toMatch(/\bAI\b/);
  });
});

describe("renderStatementPdf (FR-009)", () => {
  it("renders the loaded statement and names the file after its number", async () => {
    const r = await renderStatementPdf("c1", "inv1");
    expect(r.filename).toBe("INV-2026-ABCD1234.pdf");
    expect(r.pdf.toString()).toBe("%PDF-1.7");
    expect(calls.rendered).toHaveLength(1);
    expect(calls.rendered[0]?.title).toBe("Statement INV-2026-ABCD1234");
    expect(calls.rendered[0]?.html).toContain("wxperts — Statement INV-2026-ABCD1234");
    expect(calls.rendered[0]?.html).toContain("Issued Mon 11/02/2026");
  });
});
// [SCOPE 005 / T011] END
