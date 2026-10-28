import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { TRIAGE_DIR } from "./triage-hook";

// [SCOPE 148 / T013] BEGIN — the no-change fingerprint (SPEC-148 FR-003, SCOPE-132 FR-044)
//
// An Opus run over the whole feedback queue is the most expensive thing this agent does, and
// most mornings nothing has changed since yesterday's sweep. So before a 06:00 or catch-up run,
// the bridge asks the cheapest possible question — WITH NO MODEL — and skips the run when the
// answer is "the same queue I already reported on".
//
// The fingerprint is `count + latest updatedAt` per status, taken twice: once for My Feedback
// (this project's own reports) and once for Incoming (what other companies filed into the sink).
// Those two numbers together move on everything that matters:
//
//   a new report            count rises, and latest moves
//   a status transition     counts shift BETWEEN statuses
//   an in-place edit        latest moves (a customer answering a needs-info question)
//
// That last one is why this keys on updatedAt and not createdAt. A customer answering a
// clarification changes neither the row count nor createdAt, and a fingerprint blind to it would
// call that "no change" and skip the one run that had new information waiting in it. The MCP
// response did not carry updatedAt until this task added it, so `latestOf` falls back to
// createdAt against an older server — a weaker check, never a wrong one.
//
// TRIAGE deliberately skips all of this: a human asking for a run gets a run.

/** Every status a report can hold (mcp-server FeedbackStatusSchema). */
export const FEEDBACK_STATUSES = ["new", "triaged", "needsinfo", "inprogress", "resolved", "declined"] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

/** The two views. `my` = this project's own reports; `in` = other companies' reports in the sink. */
export const FEEDBACK_VIEWS = ["my", "in"] as const;
export type FeedbackView = (typeof FEEDBACK_VIEWS)[number];

export interface StatusPrint {
  count: number;
  /** The newest updatedAt in that bucket, ISO, or null when the bucket is empty. */
  latest: string | null;
}

/** Keyed `<view>:<status>`, e.g. `my:new`, `in:triaged`. */
export type Fingerprint = Record<string, StatusPrint>;

export interface FingerprintSource {
  mcpUrl: string;
  mcpToken: string;
  projectId: string;
}

interface FeedbackItem {
  updatedAt?: unknown;
  createdAt?: unknown;
  /** [SCOPE 148 / T014] Customer-written. Collected ONLY to keep it out of the room, never shown. */
  title?: unknown;
}

/** updatedAt when the server sends it, else createdAt. Never throws on a shape it did not expect. */
function latestOf(items: FeedbackItem[]): string | null {
  let best: string | null = null;
  for (const it of items) {
    const raw = typeof it.updatedAt === "string" ? it.updatedAt : typeof it.createdAt === "string" ? it.createdAt : null;
    if (!raw) continue;
    if (best === null || raw > best) best = raw;
  }
  return best;
}

/**
 * One `project.list_my_feedback` call. `maxItems` is deliberately NOT sent: the schema caps a
 * supplied value at 100 while omitting it lets the server use its own 500 (T009's rule), and a
 * silently truncated list would make the fingerprint agree when the queue had in fact grown.
 */
export async function listFeedback(
  src: FingerprintSource,
  status: FeedbackStatus,
  view: FeedbackView,
  fetchImpl: typeof fetch = fetch,
): Promise<FeedbackItem[]> {
  const res = await fetchImpl(`${src.mcpUrl.replace(/\/$/, "")}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${src.mcpToken}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: {
        name: "project.list_my_feedback",
        arguments: { projectId: src.projectId, status, ...(view === "in" ? { incoming: true } : {}) },
      },
    }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`list_my_feedback failed (${res.status}): ${body.slice(0, 200)}`);
  // The tool answers with content[0].text holding the JSON payload.
  const env = JSON.parse(body) as { result?: { content?: Array<{ text?: string }> } };
  const text = env.result?.content?.[0]?.text;
  if (!text) throw new Error("list_my_feedback returned no content");
  const payload = JSON.parse(text) as { items?: FeedbackItem[] };
  return Array.isArray(payload.items) ? payload.items : [];
}

export interface QueueScan {
  fingerprint: Fingerprint;
  /**
   * [SCOPE 148 / T014] Every customer-written title in the queue. Collected because FR-008's
   * room summary must replace any agent label that merely copies one — a report TITLED with an
   * injection string is the attack, and the only way to recognise a copy is to hold the
   * originals. These never leave the bridge: they are compared against, never posted.
   */
  titles: string[];
}

/** 12 calls: 6 statuses x 2 views. Sequential, to stay gentle on a service nobody is watching. */
export async function scanQueue(src: FingerprintSource, fetchImpl: typeof fetch = fetch): Promise<QueueScan> {
  const fingerprint: Fingerprint = {};
  const titles: string[] = [];
  for (const view of FEEDBACK_VIEWS) {
    for (const status of FEEDBACK_STATUSES) {
      const items = await listFeedback(src, status, view, fetchImpl);
      fingerprint[`${view}:${status}`] = { count: items.length, latest: latestOf(items) };
      for (const it of items) if (typeof it.title === "string" && it.title.trim()) titles.push(it.title);
    }
  }
  return { fingerprint, titles };
}

/** The fingerprint alone, for callers that do not need the titles. */
export async function buildFingerprint(
  src: FingerprintSource,
  fetchImpl: typeof fetch = fetch,
): Promise<Fingerprint> {
  return (await scanQueue(src, fetchImpl)).fingerprint;
}

/** The prefix `finalizeReport` looks for, and `parseFingerprint` reads back. */
export const FINGERPRINT_PREFIX = "Fingerprint:";

/** One line, stable key order, so two equal queues always render the same string. */
export function formatFingerprint(fp: Fingerprint): string {
  const parts: string[] = [];
  for (const view of FEEDBACK_VIEWS) {
    for (const status of FEEDBACK_STATUSES) {
      const p = fp[`${view}:${status}`];
      if (!p) continue;
      parts.push(`${view}:${status}=${p.count}@${p.latest ?? "-"}`);
    }
  }
  return `${FINGERPRINT_PREFIX} ${parts.join(" ")}`;
}

/** Read a fingerprint line back. Null when the line is absent or unparseable. */
export function parseFingerprint(text: string): Fingerprint | null {
  const m = new RegExp(`^${FINGERPRINT_PREFIX}\\s*(.+)$`, "m").exec(text);
  if (!m) return null;
  const fp: Fingerprint = {};
  for (const tok of m[1].trim().split(/\s+/)) {
    const t = /^([a-z]+:[a-z]+)=(\d+)@(\S+)$/.exec(tok);
    if (!t) continue;
    fp[t[1]] = { count: Number(t[2]), latest: t[3] === "-" ? null : t[3] };
  }
  return Object.keys(fp).length > 0 ? fp : null;
}

export function sameFingerprint(a: Fingerprint, b: Fingerprint): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const x = a[k];
    const y = b[k];
    if (!x || !y) return false;
    if (x.count !== y.count || x.latest !== y.latest) return false;
  }
  return true;
}

export interface PreviousReport {
  name: string;
  /** The report's date, from its file name. */
  date: string;
  fingerprint: Fingerprint | null;
}

const REPORT_NAME = /^BUG-Triage-(\d{4}-\d{2}-\d{2})(?:-(\d+))?\.md$/;

/**
 * The newest BUG-Triage report on disk.
 *
 * Sorted on (date, run index) rather than by name, because a plain name sort gets the same-day
 * case backwards: `-` is 0x2D and `.` is 0x2E, so `BUG-Triage-2026-10-26-2.md` sorts BEFORE
 * `BUG-Triage-2026-10-26.md` and the last element is the FIRST run of the day. Comparing the
 * parsed parts means a second run of the day wins, which is what "newest" has to mean — the
 * bare name is run 1.
 */
export function newestReport(repoRoot: string): PreviousReport | null {
  const dir = join(repoRoot, TRIAGE_DIR);
  let names: string[];
  try {
    names = readdirSync(dir).filter((n) => REPORT_NAME.test(n));
  } catch {
    return null;
  }
  if (names.length === 0) return null;
  const keyed = names.map((n) => {
    const m = REPORT_NAME.exec(n) as RegExpExecArray;
    return { name: n, date: m[1], index: m[2] ? Number(m[2]) : 1 };
  });
  keyed.sort((a, b) => (a.date === b.date ? a.index - b.index : a.date < b.date ? -1 : 1));
  // Index, not Array#at: the kit's TS lib target predates it (it runs on Node 20, but tsc
  // rejects it, and a kit that does not typecheck does not build).
  const name = keyed[keyed.length - 1].name;
  const date = /^BUG-Triage-(\d{4}-\d{2}-\d{2})/.exec(name)?.[1] ?? "";
  let fingerprint: Fingerprint | null = null;
  try {
    fingerprint = parseFingerprint(readFileSync(join(dir, name), "utf8"));
  } catch {
    fingerprint = null;
  }
  return { name, date, fingerprint };
}

export type NoChangeVerdict =
  | { run: true; fingerprint: Fingerprint; titles: string[]; reason: "no-previous-report" | "changed" }
  | { run: false; since: string };

/**
 * Should a scheduled run go ahead? Builds the current fingerprint and compares it with the
 * newest report's. No previous report, or a previous report with no readable fingerprint,
 * means run — the check may never be the reason a first report is not written.
 */
export async function checkForChange(
  repoRoot: string,
  src: FingerprintSource,
  fetchImpl: typeof fetch = fetch,
): Promise<NoChangeVerdict> {
  const { fingerprint: current, titles } = await scanQueue(src, fetchImpl);
  const prev = newestReport(repoRoot);
  if (!prev || !prev.fingerprint) return { run: true, fingerprint: current, titles, reason: "no-previous-report" };
  if (sameFingerprint(current, prev.fingerprint)) return { run: false, since: prev.date };
  return { run: true, fingerprint: current, titles, reason: "changed" };
}
// [SCOPE 148 / T013] END
