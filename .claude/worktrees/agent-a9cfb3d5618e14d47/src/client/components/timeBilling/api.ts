// Time and Billing client API helpers — SPEC-005. Every call goes to /api/time-billing, which
// refuses non-ADMIN callers on the server (FR-001); the page's locks are only the first line.
import type {
  TimeBillingCustomer,
  TimeBillingProjectsResponse,
  TimeBillingStatus,
  TimeEntryView,
  TimeLine,
} from "~/shared/types/timeBilling";

// [SCOPE 005 / T014] BEGIN — fetch helper and wire types for the Time & Billing page (FR-001)
// MODIFIED-BY: [SCOPE 005 / T027] — LineTarget takes every TimeLine, including the Amendment D lines
export class TimeBillingApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "TimeBillingApiError";
  }
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("wxkanban_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** JSON request to /api/time-billing; throws TimeBillingApiError with the server's message. */
export async function tbFetch<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const response = await fetch(`/api/time-billing${path}`, {
    method: init.method ?? "GET",
    credentials: "include",
    headers: {
      ...authHeaders(),
      ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const data = (await response.json()) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      // Not JSON; keep the status message.
    }
    throw new TimeBillingApiError(response.status, message);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/** Download a statement PDF through the authenticated endpoint and save it. */
export async function downloadStatementPdf(statementid: string, filename: string): Promise<void> {
  const response = await fetch(`/api/time-billing/statements/${statementid}/pdf`, {
    credentials: "include",
    headers: authHeaders(),
  });
  if (!response.ok) throw new TimeBillingApiError(response.status, `PDF download failed (${response.status})`);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export interface DateRange {
  from: string;
  to: string;
  includeInvoiced: boolean;
}

export function rangeQuery(range: DateRange): string {
  return `from=${range.from}&to=${range.to}&includeInvoiced=${range.includeInvoiced}`;
}

/** Monday–Sunday of the week holding `day`, read as a calendar date (no timezone shift). */
export function weekOf(day: Date): { from: string; to: string } {
  const iso = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
  const d = new Date(`${iso}T00:00:00Z`);
  const monday = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86_400_000);
  const sunday = new Date(monday.getTime() + 6 * 86_400_000);
  return { from: monday.toISOString().slice(0, 10), to: sunday.toISOString().slice(0, 10) };
}

/** Local calendar day as YYYY-MM-DD. */
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** A line the user can put time on (FR-003). */
export interface LineTarget {
  projectid: string;
  projectname: string;
  line: TimeLine;
  specid: string | null;
  /** The scope's label for a scope line; empty for project lines. */
  scopelabel: string;
}

export interface TeamMember {
  userid: string;
  fullname: string | null;
  email: string;
}

export async function fetchTeam(): Promise<TeamMember[]> {
  const response = await fetch("/api/team", { credentials: "include", headers: authHeaders() });
  if (!response.ok) throw new TimeBillingApiError(response.status, "Failed to load team members");
  const data = (await response.json()) as { members?: TeamMember[] };
  return data.members ?? [];
}

export type { TimeBillingCustomer, TimeBillingProjectsResponse, TimeBillingStatus, TimeEntryView };
// [SCOPE 005 / T014] END

// [SCOPE 005 / T027] BEGIN — i18n key of each project line's label (FR-003, Amendment D)
/** Project lines (everything but a scope) and the translation key of their label. */
export const PROJECT_LINE_LABEL_KEYS: Readonly<Record<Exclude<TimeLine, "scope">, string>> = {
  brainstorm: "timeBilling.lines.brainstorming",
  process: "timeBilling.lines.processes",
  dba: "timeBilling.lines.dba",
  management: "timeBilling.lines.management",
  meeting: "timeBilling.lines.meetings",
};
// [SCOPE 005 / T027] END
