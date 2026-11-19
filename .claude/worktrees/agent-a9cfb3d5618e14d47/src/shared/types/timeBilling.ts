/**
 * Time and Billing wire types (SPEC-005), shared by the server routes and the
 * /admin/time-billing page. Hours are decimal strings with two places ("1.75").
 */

// [SCOPE 005 / T004] BEGIN — Time and Billing line and project types (FR-002, FR-003, FR-004)
// MODIFIED-BY: [SCOPE 005 / T023] — ProjectTimeSummary carries engaged / clientname (FR-014)
// MODIFIED-BY: [SCOPE 005 / T027] — DBA, Management and Meetings Developer-only project lines (Amendment D, FR-003)
export type TimeCategory = "developer" | "resource";

/** Amendment D: project lines that take Developer time only, in display order. */
export const DEVELOPER_ONLY_LINES = ["dba", "management", "meeting"] as const;
export type DeveloperOnlyLine = (typeof DEVELOPER_ONLY_LINES)[number];

export type TimeLine = "scope" | "brainstorm" | "process" | DeveloperOnlyLine;

/** Every line value the database accepts (projecttimeentries_line_check, migration 0074). */
export const TIME_LINES: readonly TimeLine[] = ["scope", "brainstorm", "process", ...DEVELOPER_ONLY_LINES];

export function isTimeLine(v: string | null): v is TimeLine {
  return v !== null && (TIME_LINES as readonly string[]).includes(v);
}

/** One scope's Developer and Resource time for the period. */
export interface ScopeTimeLine {
  /** NULL when the scope was deleted after time was recorded on it (FK ON DELETE SET NULL). */
  specid: string | null;
  specnumber: string | null;
  title: string;
  /** Archived scopes are listed only when they still carry time in the period. */
  archived: boolean;
  developerMinutes: number;
  resourceMinutes: number;
  developerHours: string;
  resourceHours: string;
}

/** The project-level lines (FR-003). Labels never say "AI". */
export interface ProjectLines {
  brainstormDeveloperMinutes: number;
  brainstormResourceMinutes: number;
  processResourceMinutes: number;
  brainstormDeveloperHours: string;
  brainstormResourceHours: string;
  processResourceHours: string;
  /** Amendment D: Developer minutes and hours per Developer-only line. */
  developerOnly: Record<DeveloperOnlyLine, { minutes: number; hours: string }>;
}

export interface ProjectTimeSummary {
  projectid: string;
  name: string;
  billed: boolean;
  customerid: string | null;
  customername: string | null;
  /** FR-002: a billed project with no Customer cannot be put on a statement. */
  needsClient: boolean;
  /** FR-014 (T023): a client company's project reached through an engagement. */
  engaged: boolean;
  /** FR-014 (T023): the client company's name for an engaged project; null for an own project. */
  clientname: string | null;
  scopes: ScopeTimeLine[];
  lines: ProjectLines;
  totalMinutes: number;
  totalHours: string;
}

export interface TimeBillingProjectsResponse {
  from: string;
  to: string;
  includeInvoiced: boolean;
  projects: ProjectTimeSummary[];
  /** FR-003: grand total across billed projects only. */
  billedTotalMinutes: number;
  billedTotalHours: string;
}
// [SCOPE 005 / T004] END

// [SCOPE 005 / T012] BEGIN — entry, customer and status wire types for the Time and Billing routes (FR-002, FR-005, FR-007, FR-009)
/** One Time and Billing entry as the page lists it. Notes are the ADMIN's own text. */
export interface TimeEntryView {
  id: string;
  projectid: string;
  specid: string | null;
  line: TimeLine;
  category: TimeCategory;
  workdate: string;
  minutes: number;
  hours: string;
  /** Developer entries: the person who did the work. */
  userid: string;
  username: string | null;
  /** Resource entries: the model. */
  model: string | null;
  notes: string | null;
  source: string;
  /** FR-011: on a statement, so read-only. */
  invoiced: boolean;
}

/** A Customer the ADMIN can bill, for the statement dialog (FR-009). */
export interface TimeBillingCustomer {
  id: string;
  name: string;
  billingcycle: "weekly" | "biweekly";
  /** Billed projects of this Customer; 0 means nothing can go on a statement yet. */
  billedProjects: number;
}

/** FR-007: false until agentruns exists in production — the page runs on manual entry only. */
export interface TimeBillingStatus {
  agentRunsAvailable: boolean;
}
// [SCOPE 005 / T012] END
