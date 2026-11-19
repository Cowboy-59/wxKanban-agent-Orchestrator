// SPEC-005 / T009 — client statement generation and locking. The db client is mocked; nothing
// here opens a connection (the local .env points at production).
import { describe, it, expect, vi, beforeEach } from "vitest";

const selectQueue: unknown[][] = [];
const lockQueue: unknown[][] = [];
const inserted: Record<string, unknown>[] = [];
const locks: Record<string, unknown>[] = [];
const state = { committed: false };

vi.mock("../../src/db/client.js", () => {
  const thenable = (rows: () => unknown[]): Record<string, unknown> => {
    const c: Record<string, unknown> = {};
    for (const m of ["from", "where", "limit", "orderBy", "innerJoin"]) c[m] = () => c;
    c.then = (resolve: (v: unknown[]) => void) => resolve(rows());
    return c;
  };
  const tx = {
    insert: () => ({
      values: (v: Record<string, unknown>) => {
        inserted.push(v);
        return { returning: () => Promise.resolve([{ ...v }]) };
      },
    }),
    update: () => ({
      set: (v: Record<string, unknown>) => {
        locks.push(v);
        return { where: () => ({ returning: () => Promise.resolve(lockQueue.shift() ?? []) }) };
      },
    }),
  };
  return {
    db: {
      select: () => thenable(() => selectQueue.shift() ?? []),
      transaction: async <T>(fn: (t: typeof tx) => Promise<T>): Promise<T> => {
        const r = await fn(tx); // a throw here propagates: the real transaction rolls back
        state.committed = true;
        return r;
      },
    },
  };
});

import {
  TimeBillingStatementService,
  buildStatementPage1,
  checkPeriod,
  statementNumber,
  suggestPeriod,
  type StatementEntry,
} from "../../src/server/services/TimeBillingStatementService.js";

// [SCOPE 005 / T009] BEGIN — unit tests for statement generation and locking
const dev = (over: Partial<StatementEntry>): StatementEntry => ({
  id: "d",
  workdate: "2026-10-26",
  category: "developer",
  userid: "u1",
  duration: 60,
  entryrate: "150.00",
  resourcecount: null,
  ...over,
});
const res = (over: Partial<StatementEntry>): StatementEntry =>
  dev({ category: "resource", entryrate: "50.00", resourcecount: 1, ...over });

const customer = { id: "cu1", name: "Acme", email: "ap@acme.test", billingcycle: "weekly" };

beforeEach(() => {
  selectQueue.length = 0;
  lockQueue.length = 0;
  inserted.length = 0;
  locks.length = 0;
  state.committed = false;
});

describe("buildStatementPage1 (FR-009)", () => {
  it("one Senior Developers row per day counting distinct people, and every row adds up", () => {
    const p = buildStatementPage1([
      dev({ id: "1", userid: "u1", duration: 90 }),
      dev({ id: "2", userid: "u1", duration: 30 }),
      dev({ id: "3", userid: "u2", duration: 45 }),
    ]);
    expect(p.rows).toHaveLength(1);
    expect(p.rows[0]).toMatchObject({ category: "developer", count: 2, minutes: 165, hours: "2.75", rate: "150.00", amount: "412.50" });
    expect(p.total).toBe("412.50");
  });

  it("five subagents on the same model plus the main session are 6 Resources", () => {
    const p = buildStatementPage1([res({ id: "a", resourcecount: 6, duration: 105 })]);
    expect(p.rows[0]).toMatchObject({ category: "resource", count: 6, hours: "1.75", amount: "87.50" });
  });

  it("each manual Resource entry is 1 Resource", () => {
    const p = buildStatementPage1([res({ id: "a", resourcecount: null }), res({ id: "b", resourcecount: 1 })]);
    expect(p.rows[0]?.count).toBe(2);
  });

  it("days with no time on a line have no row; rows run by day, Developer first", () => {
    const p = buildStatementPage1([
      res({ id: "r1", workdate: "2026-10-27" }),
      dev({ id: "d1", workdate: "2026-10-27" }),
      dev({ id: "d2", workdate: "2026-10-26" }),
    ]);
    expect(p.rows.map((r) => `${r.workdate} ${r.category}`)).toEqual([
      "2026-10-26 developer",
      "2026-10-27 developer",
      "2026-10-27 resource",
    ]);
  });

  it("different rates on one day split the row so hours × rate = amount still holds", () => {
    const p = buildStatementPage1([dev({ id: "1", entryrate: "150" }), dev({ id: "2", entryrate: "175.00", userid: "u2" })]);
    expect(p.rows.map((r) => [r.rate, r.amount])).toEqual([["150.00", "150.00"], ["175.00", "175.00"]]);
    expect(p.total).toBe("325.00");
  });

  it("a −1.00 hr correction reduces the day and the total; a row netting to zero is dropped", () => {
    const p = buildStatementPage1([dev({ id: "1", duration: 120 }), dev({ id: "2", duration: -60 })]);
    expect(p.rows[0]).toMatchObject({ minutes: 60, amount: "150.00" });
    expect(buildStatementPage1([dev({ id: "1" }), dev({ id: "2", duration: -60 })]).rows).toEqual([]);
  });

  it("the total is the sum of the rows to the cent (odd rate)", () => {
    const p = buildStatementPage1([
      dev({ id: "1", entryrate: "150.01", duration: 15 }),
      dev({ id: "2", entryrate: "150.01", duration: 15, workdate: "2026-10-27" }),
    ]);
    expect(p.rows.map((r) => r.amountcents)).toEqual([3750, 3750]);
    expect(p.totalcents).toBe(7500);
  });
});

describe("periods (FR-009)", () => {
  it("pre-fills the last full Mon–Sun week, or the day after the last statement", () => {
    expect(suggestPeriod("weekly", null, "2026-11-02")).toEqual({ periodstart: "2026-10-26", periodend: "2026-11-01" });
    expect(suggestPeriod("weekly", null, "2026-11-01")).toEqual({ periodstart: "2026-10-19", periodend: "2026-10-25" });
    expect(suggestPeriod("biweekly", null, "2026-11-04")).toEqual({ periodstart: "2026-10-19", periodend: "2026-11-01" });
    expect(suggestPeriod("weekly", "2026-11-01", "2026-11-09")).toEqual({ periodstart: "2026-11-02", periodend: "2026-11-08" });
    expect(suggestPeriod("biweekly", "2026-12-27", "2027-01-11")).toEqual({ periodstart: "2026-12-28", periodend: "2027-01-10" });
  });

  it("rejects bad periods", () => {
    expect(() => checkPeriod("2026-11-08", "2026-11-02")).toThrow(/on or before/);
    expect(() => checkPeriod("2026-10-01", "2026-11-02")).toThrow(/31 days/);
    expect(() => checkPeriod("11/02/2026", "2026-11-08")).toThrow(/YYYY/);
    expect(() => checkPeriod("2026-11-02", "2026-11-02")).not.toThrow();
  });

  it("numbers statements INV-YYYY- with a random suffix", () => {
    const a = statementNumber("2026-11-01");
    expect(a).toMatch(/^INV-2026-[0-9A-F]{8}$/);
    expect(statementNumber("2026-11-01")).not.toBe(a);
  });
});

describe("TimeBillingStatementService.generate (FR-009, FR-011)", () => {
  const rows = [
    { id: "e1", workdate: "2026-10-26", category: "developer", userid: "u1", duration: 120, entryrate: "150.00", resourcecount: null },
    { id: "e2", workdate: "2026-10-26", category: "resource", userid: "a1", duration: 105, entryrate: "50.00", resourcecount: 5 },
  ];
  // T023: the Customer's billed projects — one own project, one engaged client project.
  const billedOwn = [{ id: "p1" }];
  const billedEngaged = [{ id: "p2" }];

  it("writes the statement and locks every entry with invoiceid, invoiced and invoicedat", async () => {
    selectQueue.push([customer], billedOwn, billedEngaged, rows);
    lockQueue.push([{ id: "e1" }, { id: "e2" }]);
    const r = await TimeBillingStatementService.generate("c1", "cu1", "2026-10-26", "2026-11-01");
    expect(state.committed).toBe(true);
    expect(inserted[0]).toMatchObject({
      companyid: "c1",
      customerid: "cu1",
      billedto: "Acme",
      periodstart: "2026-10-26",
      periodend: "2026-11-01",
      totalamount: "387.50",
      developerhours: "2.00",
      resourcehours: "1.75",
      hoursworked: "3.75",
      projectid: null,
    });
    expect(locks[0]).toMatchObject({ invoiceid: r.invoice.id, invoiced: true });
    expect(locks[0]?.invoicedat).toBeInstanceOf(Date);
    expect(r.entrycount).toBe(2);
    expect(r.page1.rows.map((x) => x.count)).toEqual([1, 5]);
  });

  it("if another statement locked an entry in between, nothing is kept (409)", async () => {
    selectQueue.push([customer], billedOwn, billedEngaged, rows);
    lockQueue.push([{ id: "e1" }]);
    await expect(TimeBillingStatementService.generate("c1", "cu1", "2026-10-26", "2026-11-01")).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(state.committed).toBe(false);
  });

  it("a Customer with no billed project is refused before writing (T023)", async () => {
    selectQueue.push([customer], [], []);
    await expect(TimeBillingStatementService.generate("c1", "cu1", "2026-10-26", "2026-11-01")).rejects.toThrow(/no billed projects/);
    expect(inserted).toHaveLength(0);
  });

  it("a period with nothing unbilled (e.g. generated again) is refused before writing", async () => {
    selectQueue.push([customer], billedOwn, billedEngaged, []);
    await expect(TimeBillingStatementService.generate("c1", "cu1", "2026-10-26", "2026-11-01")).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(inserted).toHaveLength(0);
  });

  it("a Customer of another company is 404", async () => {
    selectQueue.push([]);
    await expect(TimeBillingStatementService.generate("c1", "cu9", "2026-10-26", "2026-11-01")).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

describe("TimeBillingStatementService.load", () => {
  it("rebuilds page 1 from the locked entries and checks it against the stored total", async () => {
    selectQueue.push(
      [{ id: "i1", companyid: "c1", customerid: "cu1", totalamount: "150.00" }],
      [{ id: "e1", workdate: "2026-10-26", category: "developer", userid: "u1", duration: 60, entryrate: "150.00", resourcecount: null }],
    );
    const r = await TimeBillingStatementService.load("c1", "i1");
    expect(r.page1.total).toBe("150.00");

    selectQueue.push(
      [{ id: "i1", companyid: "c1", customerid: "cu1", totalamount: "999.00" }],
      [{ id: "e1", workdate: "2026-10-26", category: "developer", userid: "u1", duration: 60, entryrate: "150.00", resourcecount: null }],
    );
    await expect(TimeBillingStatementService.load("c1", "i1")).rejects.toThrow(/no longer add up/);
  });

  it("a legacy invoice (no customer) or another company's statement is 404", async () => {
    selectQueue.push([]);
    await expect(TimeBillingStatementService.load("c1", "i9")).rejects.toMatchObject({ statusCode: 404 });
  });
});
// [SCOPE 005 / T009] END
