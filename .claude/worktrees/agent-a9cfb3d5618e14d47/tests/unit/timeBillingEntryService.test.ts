// SPEC-005 / T005 — manual Time and Billing entries. The db client is mocked; nothing here
// opens a connection (the local .env points at production).
import { describe, it, expect, vi, beforeEach } from "vitest";

const selectQueue: unknown[][] = [];
const updateQueue: unknown[][] = [];
const deleteQueue: unknown[][] = [];
const inserted: Record<string, unknown>[] = [];

vi.mock("../../src/db/client.js", () => {
  const thenable = (rows: () => unknown[]): Record<string, unknown> => {
    const c: Record<string, unknown> = {};
    for (const m of ["from", "where", "limit", "orderBy", "set"]) c[m] = () => c;
    c.returning = () => c;
    c.then = (resolve: (v: unknown[]) => void) => resolve(rows());
    return c;
  };
  return {
    db: {
      select: () => thenable(() => selectQueue.shift() ?? []),
      update: () => thenable(() => updateQueue.shift() ?? []),
      delete: () => thenable(() => deleteQueue.shift() ?? []),
      // T023: the engaged-client-project lookup (TimeBillingProjectAccess) runs raw SQL; none here.
      execute: async (): Promise<{ rows: unknown[] }> => ({ rows: [] }),
      insert: () => ({
        values: (v: Record<string, unknown>) => {
          inserted.push(v);
          return { returning: () => Promise.resolve([{ ...v }]) };
        },
      }),
    },
  };
});

import {
  TimeBillingEntryService,
  validateManualEntry,
  type ManualEntryInput,
} from "../../src/server/services/TimeBillingEntryService.js";

// [SCOPE 005 / T005] BEGIN — unit tests for manual entries
const base: ManualEntryInput = {
  projectid: "p1",
  line: "scope",
  specid: "s1",
  category: "developer",
  userid: "u1",
  model: null,
  workdate: "2026-11-02",
  minutes: 7,
  notes: null,
};

beforeEach(() => {
  selectQueue.length = 0;
  updateQueue.length = 0;
  deleteQueue.length = 0;
  inserted.length = 0;
});

describe("validateManualEntry (FR-005, FR-011)", () => {
  it("rounds 0:07 to 15 minutes and 1:38 to 105", () => {
    expect(validateManualEntry(base).minutes).toBe(15);
    expect(validateManualEntry({ ...base, minutes: 98 }).minutes).toBe(105);
  });

  it("rejects a Resource entry without a model", () => {
    expect(() => validateManualEntry({ ...base, category: "resource", model: "  " })).toThrow(/model/);
    expect(validateManualEntry({ ...base, category: "resource", model: " claude-opus-5-5 " }).model).toBe(
      "claude-opus-5-5",
    );
  });

  it("allows negative hours only with a note", () => {
    expect(() => validateManualEntry({ ...base, minutes: -60 })).toThrow(/note/);
    expect(validateManualEntry({ ...base, minutes: -60, notes: "Correct 11/01 overbill" }).minutes).toBe(-60);
  });

  it("enforces the line × category pairs and the scope rule", () => {
    expect(() => validateManualEntry({ ...base, line: "process", specid: null })).toThrow(/process/);
    expect(() => validateManualEntry({ ...base, specid: null })).toThrow(/scope/);
    expect(() => validateManualEntry({ ...base, line: "brainstorm" })).toThrow(/scope/);
    expect(() => validateManualEntry({ ...base, category: "developer", userid: null })).toThrow(/person/);
  });

  it("rejects zero, over-24-hour and badly dated entries", () => {
    expect(() => validateManualEntry({ ...base, minutes: 0 })).toThrow();
    expect(() => validateManualEntry({ ...base, minutes: 24 * 60 + 1 })).toThrow(/24/);
    expect(() => validateManualEntry({ ...base, workdate: "11/02/2026" })).toThrow(/YYYY/);
  });
});

describe("TimeBillingEntryService.create (FR-005, FR-008)", () => {
  it("snapshots the project override rate and records who worked and who entered", async () => {
    selectQueue.push(
      [{ id: "p1", hourlyrate: "175.00", resourcerate: null }], // project
      [{ id: "s1" }], // scope of the project
      [{ id: "u1" }], // worker is a company user
      [{ hourlyrate: null, resourcerate: "50.00" }], // company
    );
    const created = await TimeBillingEntryService.create("c1", "admin1", { ...base, minutes: 98 });
    expect(inserted).toHaveLength(1);
    expect(created).toMatchObject({
      companyid: "c1",
      userid: "u1",
      enteredbyid: "admin1",
      duration: 105,
      entryrate: "175.00",
      category: "developer",
      line: "scope",
      workdate: "2026-11-02",
      taskid: null,
      resourcecount: null,
      source: "manual",
    });
  });

  it("a Resource entry counts as one Resource, is attributed to the admin, and uses the Resource rate", async () => {
    selectQueue.push(
      [{ id: "p1", hourlyrate: null, resourcerate: null }],
      [{ id: "admin1" }],
      [{ hourlyrate: "150.00", resourcerate: "50.00" }],
    );
    const created = await TimeBillingEntryService.create("c1", "admin1", {
      ...base,
      line: "brainstorm",
      specid: null,
      category: "resource",
      userid: null,
      model: "claude-sonnet-5-5",
    });
    expect(created).toMatchObject({ userid: "admin1", entryrate: "50.00", resourcecount: 1, model: "claude-sonnet-5-5" });
  });

  it("refuses a project of another company with 404", async () => {
    selectQueue.push([]);
    await expect(TimeBillingEntryService.create("c1", "admin1", base)).rejects.toMatchObject({ statusCode: 404 });
    expect(inserted).toHaveLength(0);
  });
});

describe("locking (FR-011)", () => {
  const invoiced = { id: "e1", companyid: "c1", category: "developer", invoiceid: "inv1", duration: 60, notes: null };
  const open = { ...invoiced, invoiceid: null };

  it("editing an invoiced entry returns 409", async () => {
    selectQueue.push([invoiced]);
    await expect(TimeBillingEntryService.update("c1", "e1", { minutes: 30 })).rejects.toMatchObject({ statusCode: 409 });
  });

  it("deleting an invoiced entry returns 409", async () => {
    selectQueue.push([invoiced]);
    await expect(TimeBillingEntryService.remove("c1", "e1")).rejects.toMatchObject({ statusCode: 409 });
  });

  it("a statement generated between load and write still wins (409)", async () => {
    selectQueue.push([open]);
    updateQueue.push([]); // the guarded UPDATE matched no row
    await expect(TimeBillingEntryService.update("c1", "e1", { minutes: 30 })).rejects.toMatchObject({ statusCode: 409 });
  });

  it("an open entry is edited and returns before and after for the audit trail", async () => {
    selectQueue.push([open]);
    updateQueue.push([{ ...open, duration: 30 }]);
    const r = await TimeBillingEntryService.update("c1", "e1", { minutes: 22 });
    expect(r.before.duration).toBe(60);
    expect(r.after.duration).toBe(30);
  });

  it("an entry of another company is 404", async () => {
    selectQueue.push([]);
    await expect(TimeBillingEntryService.remove("c1", "e9")).rejects.toMatchObject({ statusCode: 404 });
  });
});
// [SCOPE 005 / T005] END

// [SCOPE 005 / T027] BEGIN — Amendment D: DBA, Management and Meetings take Developer entries only
describe("validateManualEntry — Developer-only project lines (Amendment D)", () => {
  it.each(["dba", "management", "meeting"] as const)("accepts a Developer entry on %s", (line) => {
    expect(validateManualEntry({ ...base, line, specid: null }).minutes).toBe(15);
  });

  it.each(["dba", "management", "meeting"] as const)("refuses a Resource entry on %s", (line) => {
    expect(() =>
      validateManualEntry({ ...base, line, specid: null, category: "resource", userid: null, model: "claude-opus-5-5" }),
    ).toThrow(new RegExp(line));
  });

  it("refuses a scope on a Developer-only line", () => {
    expect(() => validateManualEntry({ ...base, line: "meeting" })).toThrow(/scope/);
  });
});
// [SCOPE 005 / T027] END
