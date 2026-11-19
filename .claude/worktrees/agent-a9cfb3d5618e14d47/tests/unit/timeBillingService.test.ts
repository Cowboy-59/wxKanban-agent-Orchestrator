// SPEC-005 / T004 — Time and Billing lines and totals. The db client is mocked; nothing here
// opens a connection (the local .env points at production).
import { describe, it, expect, vi } from "vitest";

vi.mock("../../src/db/client.js", () => ({ db: {} }));

import {
  buildProjectSummaries,
  currentWeekRange,
  isIsoDate,
  type MinutesRow,
  type ProjectRow,
  type ScopeRow,
} from "../../src/server/services/TimeBillingService.js";

// [SCOPE 005 / T004] BEGIN — unit tests for TimeBillingService pure parts
const projects: ProjectRow[] = [
  { id: "p1", name: "Acme portal", billed: true, customerid: "c1", customername: "Acme" },
  { id: "p2", name: "Internal", billed: false, customerid: null, customername: null },
  { id: "p3", name: "Orphan billed", billed: true, customerid: null, customername: null },
];
const scopes: ScopeRow[] = [
  { id: "s1", projectid: "p1", specnumber: "001", title: "Login", status: "planned" },
  { id: "s2", projectid: "p1", specnumber: "002", title: "Reports", status: "released" },
  { id: "s3", projectid: "p1", specnumber: "003", title: "Old idea", status: "archived" },
  { id: "s4", projectid: "p1", specnumber: "004", title: "Retired with time", status: "archived" },
  { id: "s5", projectid: "p2", specnumber: "001", title: "Tooling", status: "planned" },
];
const minutes: MinutesRow[] = [
  { projectid: "p1", specid: "s1", line: "scope", category: "developer", minutes: 105 },
  { projectid: "p1", specid: "s1", line: "scope", category: "resource", minutes: 60 },
  { projectid: "p1", specid: "s4", line: "scope", category: "resource", minutes: 15 },
  { projectid: "p1", specid: null, line: "scope", category: "developer", minutes: 30 },
  { projectid: "p1", specid: null, line: "brainstorm", category: "developer", minutes: 45 },
  { projectid: "p1", specid: null, line: "brainstorm", category: "resource", minutes: 15 },
  { projectid: "p1", specid: null, line: "process", category: "resource", minutes: 90 },
  { projectid: "p2", specid: "s5", line: "scope", category: "developer", minutes: 600 },
];

describe("buildProjectSummaries (FR-002, FR-003)", () => {
  const { projects: out, billedTotalMinutes } = buildProjectSummaries(projects, scopes, minutes);
  const p1 = out.find((p) => p.projectid === "p1");

  it("lists every non-archived scope, even with no time, and hides empty archived scopes", () => {
    const ids = p1?.scopes.map((s) => s.specid);
    expect(ids).toContain("s1");
    expect(ids).toContain("s2");
    expect(ids).not.toContain("s3");
    expect(p1?.scopes.find((s) => s.specid === "s2")?.developerHours).toBe("0.00");
  });

  it("keeps an archived or deleted scope that still carries time, so no minute drops out", () => {
    expect(p1?.scopes.find((s) => s.specid === "s4")?.resourceHours).toBe("0.25");
    expect(p1?.scopes.find((s) => s.specid === null)?.developerMinutes).toBe(30);
  });

  it("splits Developer and Resource per scope and fills the three project lines", () => {
    const s1 = p1?.scopes.find((s) => s.specid === "s1");
    expect(s1?.developerHours).toBe("1.75");
    expect(s1?.resourceHours).toBe("1.00");
    expect(p1?.lines.brainstormDeveloperHours).toBe("0.75");
    expect(p1?.lines.brainstormResourceHours).toBe("0.25");
    expect(p1?.lines.processResourceHours).toBe("1.50");
  });

  it("totals per project and grand-totals billed projects only", () => {
    expect(p1?.totalMinutes).toBe(105 + 60 + 15 + 30 + 45 + 15 + 90);
    expect(out.find((p) => p.projectid === "p2")?.totalMinutes).toBe(600);
    expect(billedTotalMinutes).toBe(360);
  });

  it("flags a billed project with no Customer", () => {
    expect(out.find((p) => p.projectid === "p3")?.needsClient).toBe(true);
    expect(p1?.needsClient).toBe(false);
    expect(out.find((p) => p.projectid === "p2")?.needsClient).toBe(false);
  });

  it("never labels a line with the word AI", () => {
    expect(JSON.stringify(out)).not.toMatch(/\bAI\b/);
  });
});

describe("date range (FR-004)", () => {
  it("defaults to the current week, Monday to Sunday", () => {
    expect(currentWeekRange("2026-11-01")).toEqual({ from: "2026-10-26", to: "2026-11-01" }); // Sunday
    expect(currentWeekRange("2026-11-02")).toEqual({ from: "2026-11-02", to: "2026-11-08" }); // Monday
    expect(currentWeekRange("2026-11-04")).toEqual({ from: "2026-11-02", to: "2026-11-08" });
  });

  it("validates calendar dates", () => {
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-2-3")).toBe(false);
    expect(() => currentWeekRange("nope")).toThrow(RangeError);
  });
});
// [SCOPE 005 / T004] END

// [SCOPE 005 / T027] BEGIN — Amendment D: Developer-only line totals
describe("buildProjectSummaries — DBA, Management and Meetings (Amendment D)", () => {
  const rows: MinutesRow[] = [
    { projectid: "p1", specid: null, line: "dba", category: "developer", minutes: 45 },
    { projectid: "p1", specid: null, line: "meeting", category: "developer", minutes: 30 },
    { projectid: "p1", specid: null, line: "meeting", category: "developer", minutes: 15 },
  ];
  const [p1] = buildProjectSummaries(projects.slice(0, 1), [], rows).projects;

  it("totals each line and counts it in the project total", () => {
    expect(p1?.lines.developerOnly).toEqual({
      dba: { minutes: 45, hours: "0.75" },
      management: { minutes: 0, hours: "0.00" },
      meeting: { minutes: 45, hours: "0.75" },
    });
    expect(p1?.totalMinutes).toBe(90);
  });
});
// [SCOPE 005 / T027] END
