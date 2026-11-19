// SPEC-005 / T010 — statement page 2 (Items Done). The db client is mocked; nothing here
// opens a connection (the local environment file points at production).
import { describe, it, expect, vi, beforeEach } from "vitest";

const selectQueue: unknown[][] = [];

vi.mock("../../src/db/client.js", () => {
  const thenable = (rows: () => unknown[]): Record<string, unknown> => {
    const c: Record<string, unknown> = {};
    for (const m of ["from", "where", "limit", "orderBy", "innerJoin", "leftJoin"]) c[m] = () => c;
    c.then = (resolve: (v: unknown[]) => void) => resolve(rows());
    return c;
  };
  return { db: { select: () => thenable(() => selectQueue.shift() ?? []) } };
});

import {
  MAX_SUMMARY_LINES,
  TimeBillingSummaryService,
  buildStatementSummary,
  sanitizeName,
  type SummaryEntry,
  type SummaryGroup,
} from "../../src/server/services/TimeBillingSummaryService.js";

// [SCOPE 005 / T010] BEGIN — unit tests for the statement summary page
const base: SummaryEntry = {
  duration: 60,
  line: "process",
  taskid: null,
  issuetype: null,
  taskname: null,
  specid: null,
  specnumber: null,
  spectitle: null,
  projectid: "p1",
  projectname: "Portal",
};
const e = (over: Partial<SummaryEntry>): SummaryEntry => ({ ...base, ...over });
const scope = (n: number, duration = 60): SummaryEntry =>
  e({ line: "scope", specid: `s${n}`, specnumber: String(n).padStart(3, "0"), spectitle: `Spec ${n}`, duration });
const group = (s: ReturnType<typeof buildStatementSummary>, key: string): SummaryGroup | undefined =>
  s.groups.find((g) => g.key === key);

beforeEach(() => {
  selectQueue.length = 0;
});

describe("buildStatementSummary partition (FR-010)", () => {
  it("puts each entry in exactly one group and the group hours add up to the total", () => {
    const s = buildStatementSummary(
      [
        scope(1, 90),
        e({ line: "process", duration: 30 }),
        e({ line: "brainstorm", duration: 45 }),
        e({ line: "scope", taskid: "t1", issuetype: "bug", taskname: "Login fails", duration: 60 }),
      ],
      [],
    );
    expect(s.groups.map((g) => g.key)).toEqual(["scopes", "bugs", "processes", "brainstorms"]);
    expect(group(s, "scopes")?.items).toEqual([{ name: "001 Spec 1", minutes: 90, hours: "1.50" }]);
    expect(group(s, "bugs")?.items[0]).toEqual({ name: "Login fails", minutes: 60, hours: "1.00" });
    expect(group(s, "processes")?.items[0]?.name).toBe("Processes – Portal");
    expect(group(s, "brainstorms")?.items[0]?.name).toBe("Brainstorming – Portal");
    expect(s.totalminutes).toBe(225);
    expect(s.totalhours).toBe("3.75");
  });

  it("a bug task wins over its scope line; a non-bug task falls through to the spec", () => {
    const bug = e({ line: "scope", specid: "s1", specnumber: "001", spectitle: "A", taskid: "t1", issuetype: "bug", taskname: "Crash" });
    const task = e({ line: "scope", specid: "s1", specnumber: "001", spectitle: "A", taskid: "t2", issuetype: "task", taskname: "Do it" });
    const s = buildStatementSummary([bug, task], []);
    expect(group(s, "bugs")?.items.map((i) => i.name)).toEqual(["Crash"]);
    expect(group(s, "scopes")?.items.map((i) => i.name)).toEqual(["001 A"]);
  });

  it("processes and brainstorms are one item per project; entries on one spec merge", () => {
    const s = buildStatementSummary(
      [
        e({ projectid: "p1", projectname: "Portal", duration: 30 }),
        e({ projectid: "p1", projectname: "Portal", duration: 45 }),
        e({ projectid: "p2", projectname: "Site", duration: 15 }),
        e({ line: "brainstorm", projectid: "p2", projectname: "Site", duration: 15 }),
        scope(1, 30),
        scope(1, 30),
      ],
      [],
    );
    expect(group(s, "processes")?.items.map((i) => [i.name, i.minutes])).toEqual([
      ["Processes – Portal", 75],
      ["Processes – Site", 15],
    ]);
    expect(group(s, "brainstorms")?.items).toHaveLength(1);
    expect(group(s, "scopes")?.items).toEqual([{ name: "001 Spec 1", minutes: 60, hours: "1.00" }]);
  });

  it("a scope line with no spec counts as the project's processes", () => {
    const s = buildStatementSummary([e({ line: "scope", specid: null, duration: 30 })], []);
    expect(group(s, "processes")?.items[0]?.name).toBe("Processes – Portal");
  });

  it("never uses the entry notes", () => {
    const withNotes = { ...e({ duration: 30 }), notes: "secret prompt text" };
    const s = buildStatementSummary([withNotes], []);
    expect(JSON.stringify(s)).not.toContain("secret");
  });
});

describe("buildStatementSummary corrections and order (FR-010, FR-011)", () => {
  it("a negative correction nets into its item and a zero-net item is dropped", () => {
    const s = buildStatementSummary([scope(1, 120), scope(1, -60), scope(2, 60), scope(2, -60)], []);
    expect(group(s, "scopes")?.items).toEqual([{ name: "001 Spec 1", minutes: 60, hours: "1.00" }]);
    expect(s.totalminutes).toBe(60);
    expect(buildStatementSummary([scope(1, 60), scope(1, -60)], []).groups).toEqual([]);
  });

  it("orders highest hours first, then by name; empty groups are omitted", () => {
    const s = buildStatementSummary([scope(3, 30), scope(2, 90), scope(1, 30)], []);
    expect(group(s, "scopes")?.items.map((i) => i.name)).toEqual(["002 Spec 2", "001 Spec 1", "003 Spec 3"]);
    expect(s.groups.map((g) => g.key)).toEqual(["scopes"]);
  });

  it("resolved feedback adds untimed bug lines after the timed ones, de-duplicated", () => {
    const s = buildStatementSummary(
      [e({ line: "scope", taskid: "t1", issuetype: "bug", taskname: "Crash", duration: 15 })],
      [
        { id: "f1", title: "Button misaligned" },
        { id: "f1", title: "Button misaligned" },
        { id: "f2", title: "Typo" },
      ],
    );
    const bugs = group(s, "bugs");
    expect(bugs?.items.map((i) => i.name)).toEqual(["Crash", "Button misaligned", "Typo"]);
    expect(bugs?.items[1]).toEqual({ name: "Button misaligned", minutes: null, hours: null });
    expect(bugs?.minutes).toBe(15);
    expect(s.totalminutes).toBe(15);
  });

  it("feedback alone makes a bugs group with zero hours", () => {
    const s = buildStatementSummary([], [{ id: "f1", title: "Typo" }]);
    expect(group(s, "bugs")?.hours).toBe("0.00");
  });
});

describe("buildStatementSummary fit to a page (FR-010)", () => {
  it("trims the largest group's tail with +N more and keeps totals intact", () => {
    const entries = Array.from({ length: 25 }, (_, i) => scope(i + 1, 15 * (30 - i)));
    const scopeMinutes = entries.reduce((n, x) => n + x.duration, 0);
    entries.push(e({ duration: 60 }));
    const s = buildStatementSummary(entries, []);
    const visible = s.groups.reduce((n, g) => n + g.items.length, 0);
    expect(visible).toBeLessThanOrEqual(MAX_SUMMARY_LINES);
    const scopes = group(s, "scopes");
    expect(scopes?.items).toHaveLength(MAX_SUMMARY_LINES - 1);
    expect(scopes?.more?.count).toBe(25 - (MAX_SUMMARY_LINES - 1));
    // The trimmed items are the smallest ones, and totals still include them.
    const hiddenMinutes = entries.slice(MAX_SUMMARY_LINES - 1, 25).reduce((n, x) => n + x.duration, 0);
    expect(scopes?.more?.minutes).toBe(hiddenMinutes);
    expect(scopes?.more?.hours).toBe((hiddenMinutes / 60).toFixed(2));
    expect(scopes?.minutes).toBe(scopeMinutes);
    expect(group(s, "processes")?.more).toBeNull();
    expect(s.totalminutes).toBe(entries.reduce((n, x) => n + x.duration, 0));
  });

  it("shrinks the biggest groups evenly and every group keeps its top 2", () => {
    const bug = (n: number): SummaryEntry =>
      e({ line: "scope", taskid: `t${n}`, issuetype: "bug", taskname: `Bug ${n}`, duration: 15 * (n + 1) });
    const entries = [
      ...Array.from({ length: 12 }, (_, i) => scope(i + 1, 30 + i * 15)),
      ...Array.from({ length: 12 }, (_, i) => bug(i)),
      e({ projectid: "p1" }),
      e({ projectid: "p2", projectname: "Site" }),
      e({ projectid: "p3", projectname: "Wiki" }),
      e({ line: "brainstorm", projectid: "p3", projectname: "Wiki" }),
    ];
    const s = buildStatementSummary(entries, []);
    expect(s.groups.reduce((n, g) => n + g.items.length, 0)).toBe(MAX_SUMMARY_LINES);
    expect(group(s, "processes")?.items.length).toBeGreaterThanOrEqual(2);
    expect(group(s, "brainstorms")?.items).toHaveLength(1);
    expect(Math.abs((group(s, "scopes")?.items.length ?? 0) - (group(s, "bugs")?.items.length ?? 0))).toBeLessThanOrEqual(1);
  });

  it("never trims a group below its top 2", () => {
    const entries = Array.from({ length: 30 }, (_, i) => scope(i + 1, 15 * (40 - i)));
    entries.push(
      ...Array.from({ length: 5 }, (_, i) => e({ projectid: `p${i}`, projectname: `P${i}`, duration: 15 })),
      ...Array.from({ length: 5 }, (_, i) => e({ line: "brainstorm", projectid: `q${i}`, projectname: `Q${i}`, duration: 15 })),
    );
    const s = buildStatementSummary(entries, []);
    for (const g of s.groups) expect(g.items.length).toBeGreaterThanOrEqual(2);
    expect(s.groups.reduce((n, g) => n + g.items.length, 0)).toBeLessThanOrEqual(MAX_SUMMARY_LINES);
  });

  it("untimed feedback at the tail is trimmed first and counts in more with 0 minutes", () => {
    const entries = Array.from({ length: 5 }, (_, i) => e({ line: "scope", taskid: `t${i}`, issuetype: "bug", taskname: `B${i}`, duration: 15 }));
    const feedback = Array.from({ length: 20 }, (_, i) => ({ id: `f${i}`, title: `Report ${i}` }));
    const bugs = group(buildStatementSummary(entries, feedback), "bugs");
    expect(bugs?.items.slice(0, 5).every((i) => i.minutes === 15)).toBe(true);
    expect(bugs?.more).toEqual({ count: 25 - MAX_SUMMARY_LINES, minutes: 0, hours: "0.00" });
    expect(bugs?.minutes).toBe(75);
  });
});

describe("names", () => {
  it("strips control characters and newlines, collapses spaces and truncates to 80 with an ellipsis", () => {
    expect(sanitizeName("  Fix\tthe\r\nlogin\u0000   bug  ")).toBe("Fix the login bug");
    const long = sanitizeName("x".repeat(200));
    expect(long).toHaveLength(80);
    expect(long.endsWith("…")).toBe(true);
    expect(sanitizeName("y".repeat(80))).toBe("y".repeat(80));
  });

  it("applies to task names and feedback titles", () => {
    const s = buildStatementSummary(
      [e({ line: "scope", taskid: "t1", issuetype: "bug", taskname: "A\nB", duration: 15 })],
      [{ id: "f1", title: "z".repeat(300) }],
    );
    expect(group(s, "bugs")?.items[0]?.name).toBe("A B");
    expect(group(s, "bugs")?.items[1]?.name).toHaveLength(80);
  });
});

describe("TimeBillingSummaryService.load", () => {
  const invoice = { id: "i1", periodstart: "2026-10-26", periodend: "2026-11-01" };

  it("builds page 2 from the locked entries and the resolved feedback", async () => {
    selectQueue.push(
      [invoice],
      [{ ...base, line: "scope", specid: "s1", specnumber: "005", spectitle: "Billing", duration: 120 }],
      [{ id: "f1", title: "Total wrong" }],
    );
    const s = await TimeBillingSummaryService.load("c1", "i1");
    expect(group(s, "scopes")?.items[0]).toEqual({ name: "005 Billing", minutes: 120, hours: "2.00" });
    expect(group(s, "bugs")?.items[0]?.hours).toBeNull();
    expect(s.totalhours).toBe("2.00");
  });

  it("treats a running-timer entry with no duration as zero", async () => {
    selectQueue.push([invoice], [{ ...base, duration: null }]);
    expect((await TimeBillingSummaryService.load("c1", "i1")).groups).toEqual([]);
  });

  it("a missing, legacy or other-company statement is 404", async () => {
    selectQueue.push([]);
    await expect(TimeBillingSummaryService.load("c1", "i9")).rejects.toMatchObject({ statusCode: 404 });
  });
});
// [SCOPE 005 / T010] END

// [SCOPE 005 / T027] BEGIN — Amendment D: DBA, Management and Meetings summary groups
describe("buildStatementSummary — DBA, Management and Meetings groups (Amendment D)", () => {
  const s = buildStatementSummary(
    [
      e({ line: "dba", duration: 60 }),
      e({ line: "management", duration: 30 }),
      e({ line: "meeting", duration: 15 }),
      e({ line: "meeting", duration: 45 }),
    ],
    [],
  );

  it("gives each its own group, after Brainstorms, one item per project", () => {
    expect(s.groups.map((g) => g.key)).toEqual(["dba", "management", "meetings"]);
    expect(group(s, "dba")?.items).toEqual([{ name: "DBA – Portal", minutes: 60, hours: "1.00" }]);
    expect(group(s, "management")?.items[0]?.name).toBe("Management – Portal");
    expect(group(s, "meetings")?.items).toEqual([{ name: "Meetings – Portal", minutes: 60, hours: "1.00" }]);
  });

  it("keeps page 2 equal to the entries", () => {
    expect(s.totalminutes).toBe(150);
  });
});
// [SCOPE 005 / T027] END
