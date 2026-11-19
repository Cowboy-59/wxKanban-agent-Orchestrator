import { and, desc, eq, inArray, isNull, isNotNull, sql, type SQL } from "drizzle-orm";
import { db } from "~/db/client.js";
import { feedbacksubmissions, type FeedbackSubmission } from "~/db/schema/feedbacksubmissions.js";
import { companyauditlogs } from "~/db/schema/companyauditlog.js";
import {
  sendFeedbackNotification,
  retryFeedbackNotification,
} from "./FeedbackNotificationService.js";
import { logger } from "~/server/lib/logger.js";

// [SCOPE 110] Central feedback sink project — auto-error records may carry no
// company, so their purge audit is attributed to this project's company (FR-002).
// Exported for the project agent's settings route (SPEC-148 FR-001) — [SCOPE 148 / T006]
export const SINK_PROJECT_ID =
  process.env["FEEDBACK_SINK_PROJECT_ID"] ||
  "ba924193-0335-4080-9fa6-33cd6b81300a"; // wxKanban Development

// Triage operations for the wxperts SysAdmin surface. Cross-project (admin) —
// uses the direct db client, not the per-project scoped wrapper. Every status
// change notifies the submitter (T008) and stamps firsttriagedat on first touch.
export const FEEDBACK_STATUSES = [
  "new",
  "triaged",
  "needsinfo",
  "inprogress",
  "resolved",
  "declined",
] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

// [SCOPE 061] BEGIN — submission source vocabulary (manual feedback vs trapped error)
export const FEEDBACK_SOURCES = ["manual", "auto"] as const;
export type FeedbackSource = (typeof FEEDBACK_SOURCES)[number];
// [SCOPE 061] END

// [SCOPE 043 / T006] BEGIN — SysAdmin triage surface
// MODIFIED-BY: [SCOPE 061] — optional source/type filters for auto-error triage
// MODIFIED-BY: [SCOPE 110 / T012] — dismissed excluded by default (FR-006)
export async function listFeedback(filter?: {
  status?: FeedbackStatus;
  source?: FeedbackSource;
  type?: string;
  // [SCOPE 110 / T012] visibility of dismissed rows: 'exclude' (default) hides
  // them from the working queue; 'only' isolates them for the dismissed filter;
  // 'include' shows both. Metrics always exclude dismissed (getFeedbackMetrics).
  dismissed?: "exclude" | "only" | "include";
}): Promise<FeedbackSubmission[]> {
// [SCOPE 043 / T006] END
  // [SCOPE 061] BEGIN — additive source/type filtering (conditions + and())
  const conditions: SQL[] = [];
  if (filter?.status) conditions.push(eq(feedbacksubmissions.status, filter.status));
  if (filter?.source) conditions.push(eq(feedbacksubmissions.source, filter.source));
  if (filter?.type) conditions.push(eq(feedbacksubmissions.type, filter.type));
  // [SCOPE 110 / T012] default-visible semantics: hide dismissed unless asked.
  const mode = filter?.dismissed ?? "exclude";
  if (mode === "only") conditions.push(isNotNull(feedbacksubmissions.dismissedat));
  else if (mode === "exclude") conditions.push(isNull(feedbacksubmissions.dismissedat));
  const base = db.select().from(feedbacksubmissions);
  const rows =
    conditions.length > 0
      ? await base.where(and(...conditions)).orderBy(desc(feedbacksubmissions.createdat))
      : await base.orderBy(desc(feedbacksubmissions.createdat));
  // [SCOPE 061] END
  return rows as FeedbackSubmission[];
}

// [SCOPE 043 / T006] BEGIN — SysAdmin triage surface
export async function getFeedback(id: string): Promise<FeedbackSubmission | null> {
  const [row] = await db.select().from(feedbacksubmissions).where(eq(feedbacksubmissions.id, id));
  return (row as FeedbackSubmission) ?? null;
}
// [SCOPE 043 / T006] END

// [SCOPE 043 / T006] BEGIN — SysAdmin triage surface
async function loadOrThrow(id: string): Promise<FeedbackSubmission> {
  const row = await getFeedback(id);
  if (!row) throw new Error(`feedback not found: ${id}`);
  return row;
}
// [SCOPE 043 / T006] END

// [SCOPE 043 / T006] BEGIN — SysAdmin triage surface
export async function transitionStatus(
  id: string,
  status: FeedbackStatus,
  opts: { declineReason?: string; adminId?: string },
// [SCOPE 043 / T006] END
): Promise<FeedbackSubmission> {
  if (!FEEDBACK_STATUSES.includes(status)) throw new Error(`invalid status: ${status}`);
  const existing = await loadOrThrow(id);
  if (status === "declined" && !opts.declineReason?.trim()) {
    throw new Error("declining requires a reason");
  }

  const set: Record<string, unknown> = { status, updatedat: new Date() };
  if (status === "declined") set.declinereason = opts.declineReason!.trim();
  if (!existing.firsttriagedat) set.firsttriagedat = new Date();

  const [updated] = await db
    .update(feedbacksubmissions)
    .set(set)
    .where(eq(feedbacksubmissions.id, id))
    .returning();
  const row = updated as FeedbackSubmission;

  // Notify the submitter (best-effort; reconciles notifystatus done/failed).
  await sendFeedbackNotification(row);
  logger.info({ feedbackId: id, status, adminId: opts.adminId }, "feedback status transitioned");
  return row;
}

// [SCOPE 043 / T006] BEGIN — SysAdmin triage surface
export async function addInternalNote(
  id: string,
  note: string,
  adminId?: string,
): Promise<FeedbackSubmission> {
  if (!note?.trim()) throw new Error("note is required");
  const existing = await loadOrThrow(id);
  const merged = existing.internalnotes ? `${existing.internalnotes}\n---\n${note.trim()}` : note.trim();
  const [updated] = await db
    .update(feedbacksubmissions)
    .set({ internalnotes: merged, updatedat: new Date() })
    .where(eq(feedbacksubmissions.id, id))
    .returning();
  logger.info({ feedbackId: id, adminId }, "feedback internal note added");
  return updated as FeedbackSubmission;
}
// [SCOPE 043 / T006] END

// Send the single clarifying question: status -> needsinfo, notify the submitter.
// [SCOPE 043 / T006] BEGIN — SysAdmin triage surface
export async function sendClarification(
  id: string,
  question: string,
  adminId?: string,
): Promise<FeedbackSubmission> {
  if (!question?.trim()) throw new Error("a clarification question is required");
  const existing = await loadOrThrow(id);
  const set: Record<string, unknown> = {
    status: "needsinfo",
    clarificationquestion: question.trim(),
    updatedat: new Date(),
  };
  if (!existing.firsttriagedat) set.firsttriagedat = new Date();

  const [updated] = await db
    .update(feedbacksubmissions)
    .set(set)
    .where(eq(feedbacksubmissions.id, id))
    .returning();
  const row = updated as FeedbackSubmission;
  await sendFeedbackNotification(row);
  logger.info({ feedbackId: id, adminId }, "feedback clarification sent");
  return row;
}
// [SCOPE 043 / T006] END

// Manual retry of a failed notification leg (no background worker in v1).
// [SCOPE 043 / T006] BEGIN — SysAdmin triage surface
export async function retryNotification(id: string): Promise<{ ok: boolean; error?: string }> {
// [SCOPE 043 / T006] END
  return retryFeedbackNotification(id);
}

// ── v2 — web triage console: disposition decision layer + accept-to-scope ──────

// [SCOPE 043 / T012] BEGIN — v2 disposition vocabulary
// FR-011/012: the decision an admin (or the AI) makes about a triaged item.
// Orthogonal to FEEDBACK_STATUSES (the workflow); disposition is "what to do".
export const FEEDBACK_DISPOSITIONS = [
  "scope",
  "outofbandfix",
  "duplicate",
  "decline",
  "needsinfo",
] as const;
export type FeedbackDisposition = (typeof FEEDBACK_DISPOSITIONS)[number];
// [SCOPE 043 / T012] END

// [SCOPE 043 / T012] BEGIN — v2 set/override disposition (FR-012)
// Records the admin's final disposition while preserving the AI's original
// suggestion (aiproposeddisposition) — the override is never lost.
export async function setDisposition(
  id: string,
  disposition: FeedbackDisposition,
  adminId?: string,
): Promise<FeedbackSubmission> {
  if (!FEEDBACK_DISPOSITIONS.includes(disposition)) {
    throw new Error(`invalid disposition: ${disposition}`);
  }
  const existing = await loadOrThrow(id);
  const set: Record<string, unknown> = {
    disposition,
    dispositionedat: new Date(),
    dispositionedbyid: adminId ?? null,
    updatedat: new Date(),
  };
  if (!existing.firsttriagedat) set.firsttriagedat = new Date();

  const [updated] = await db
    .update(feedbacksubmissions)
    .set(set)
    .where(eq(feedbacksubmissions.id, id))
    .returning();
  logger.info(
    { feedbackId: id, disposition, aiProposed: existing.aiproposeddisposition, adminId },
    "feedback disposition set",
  );
  return updated as FeedbackSubmission;
}
// [SCOPE 043 / T012] END

// [SCOPE 043 / T012] BEGIN — v2 accept-to-scope seed builder
// MODIFIED-BY: [SCOPE 148 / T007] — extensionversion is the Cockpit's, kitversion the kit's (FR-014)
// Turn the customer's submitted text into a kebab-case short name for the seed.
function deriveShortName(title: string): string {
  const STOP = new Set(["a", "an", "the", "to", "of", "for", "on", "in", "and"]);
  const words = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w));
  const slug = words.slice(0, 4).join("-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return slug || "feedback-scope";
}

// Flatten the persona-elicited `details` jsonb into a readable problem statement.
// Exported for its unit test (SPEC-148 FR-014).
export function buildSeedBody(details: unknown, context: unknown): string {
  const d = (details ?? {}) as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof d.paste === "string" && d.paste.trim()) parts.push(d.paste.trim());
  if (typeof d.note === "string" && d.note.trim()) parts.push(`Note: ${d.note.trim()}`);
  // Guided/persona answers (no paste) — include any string-valued fields.
  if (parts.length === 0) {
    for (const [k, v] of Object.entries(d)) {
      if (typeof v === "string" && v.trim()) parts.push(`**${k}**: ${v.trim()}`);
    }
  }
  const c = (context ?? {}) as Record<string, unknown>;
  const env = [
    c.extensionversion && `Cockpit ${c.extensionversion}`,
    c.kitversion && `kit ${c.kitversion}`,
    c.vscodeversion && `VS Code ${c.vscodeversion}`,
    c.os,
  ]
    .filter(Boolean)
    .join(" · ");
  if (env) parts.push(`_Reported from: ${env}_`);
  return parts.join("\n\n");
}

export interface ScopeSeed {
  title: string;
  shortname: string;
  body: string;
  sourceFeedbackId: string;
}

// FR-013/015: accept a triaged item to scope. Stores the seed (DB = source of
// truth) and marks disposition='scope'. The collision-safe NNN assignment and
// the file write happen in the kit at materialization (FR-014, T017) — the
// hosted server cannot read or write a developer's specs/ tree. Idempotent:
// re-accepting an already-scoped item returns its existing link, no second seed.
export async function acceptToScope(
  id: string,
  edits: { title?: string } | undefined,
  adminId?: string,
): Promise<{ feedback: FeedbackSubmission; seed: ScopeSeed; alreadyScoped: boolean }> {
  const existing = await loadOrThrow(id);

  if (existing.scopeseed || existing.linkedscopenumber) {
    return {
      feedback: existing,
      seed: existing.scopeseed as ScopeSeed,
      alreadyScoped: true,
    };
  }

  const title = (edits?.title?.trim() || existing.title).slice(0, 255);
  const seed: ScopeSeed = {
    title,
    shortname: deriveShortName(title),
    body: buildSeedBody(existing.details, existing.context),
    sourceFeedbackId: id,
  };

  const set: Record<string, unknown> = {
    disposition: "scope",
    dispositionedat: new Date(),
    dispositionedbyid: adminId ?? null,
    scopeseed: seed,
    updatedat: new Date(),
  };
  if (!existing.firsttriagedat) set.firsttriagedat = new Date();

  const [updated] = await db
    .update(feedbacksubmissions)
    .set(set)
    .where(eq(feedbacksubmissions.id, id))
    .returning();
  logger.info({ feedbackId: id, shortname: seed.shortname, adminId }, "feedback accepted to scope");
  return { feedback: updated as FeedbackSubmission, seed, alreadyScoped: false };
}
// [SCOPE 043 / T012] END

// [SCOPE 043 / T012] BEGIN — v2 kit callback: record the materialized scope number
// FR-014/015: the kit assigns the collision-safe NNN against the real filesystem
// on project open, writes the file, then reports the number back here so the row
// carries durable bidirectional traceability.
export async function recordMaterializedScope(
  id: string,
  scopeNumber: string,
): Promise<FeedbackSubmission> {
  if (!/^[0-9]{3}$/.test(scopeNumber)) {
    throw new Error(`invalid scope number (expected NNN): ${scopeNumber}`);
  }
  const existing = await loadOrThrow(id);
  if (!existing.scopeseed) throw new Error(`feedback ${id} was not accepted to scope`);
  if (existing.linkedscopenumber) return existing; // idempotent — already linked

  const [updated] = await db
    .update(feedbacksubmissions)
    .set({ linkedscopenumber: scopeNumber, updatedat: new Date() })
    .where(eq(feedbacksubmissions.id, id))
    .returning();
  logger.info({ feedbackId: id, scopeNumber }, "feedback scope materialized");
  return updated as FeedbackSubmission;
}
// [SCOPE 043 / T012] END

// [SCOPE 043 / T012] BEGIN — v2 feedback analytics aggregation (FR-016)
export interface FeedbackMetrics {
  total: number;
  decisionCoverage: { open: number; dispositioned: number; scoped: number };
  byStatus: Record<string, number>;
  byDisposition: Record<string, number>;
  medianTimeToDispositionHours: number | null;
  aiAccuracy: { judged: number; accepted: number; overridden: number; acceptRate: number | null };
  scopeConversion: { byClassification: Record<string, number>; bySeverity: Record<string, number> };
  volumeTrend: Array<{ month: string; bug: number; suggestion: number }>;
}

export async function getFeedbackMetrics(): Promise<FeedbackMetrics> {
  // Single round-trip per aggregate; all derive from feedbacksubmissions.
  const totalsRow = await db.execute<{
    total: string;
    open: string;
    dispositioned: string;
    scoped: string;
  }>(sql`
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE disposition IS NULL AND linkedscopenumber IS NULL)::int AS open,
      count(*) FILTER (WHERE disposition IS NOT NULL AND linkedscopenumber IS NULL)::int AS dispositioned,
      count(*) FILTER (WHERE linkedscopenumber IS NOT NULL OR disposition = 'scope')::int AS scoped
    FROM feedbacksubmissions
    WHERE dismissedat IS NULL
  `);
  const t = (totalsRow.rows[0] ?? {}) as Record<string, unknown>;

  const statusRows = await db.execute<{ status: string; n: number }>(
    sql`SELECT status, count(*)::int AS n FROM feedbacksubmissions WHERE dismissedat IS NULL GROUP BY status`,
  );
  const dispRows = await db.execute<{ disposition: string; n: number }>(
    sql`SELECT disposition, count(*)::int AS n FROM feedbacksubmissions WHERE disposition IS NOT NULL AND dismissedat IS NULL GROUP BY disposition`,
  );

  const medianRow = await db.execute<{ hours: number | null }>(sql`
    SELECT percentile_cont(0.5) WITHIN GROUP (
      ORDER BY EXTRACT(EPOCH FROM (dispositionedat - createdat)) / 3600.0
    ) AS hours
    FROM feedbacksubmissions WHERE dispositionedat IS NOT NULL AND dismissedat IS NULL
  `);

  const accuracyRow = await db.execute<{ judged: number; accepted: number }>(sql`
    SELECT
      count(*)::int AS judged,
      count(*) FILTER (WHERE disposition = aiproposeddisposition)::int AS accepted
    FROM feedbacksubmissions
    WHERE disposition IS NOT NULL AND aiproposeddisposition IS NOT NULL AND dismissedat IS NULL
  `);

  const convClassRows = await db.execute<{ classification: string; n: number }>(
    sql`SELECT coalesce(classification, 'unclassified') AS classification, count(*)::int AS n
        FROM feedbacksubmissions WHERE disposition = 'scope' AND dismissedat IS NULL GROUP BY classification`,
  );
  const convSevRows = await db.execute<{ severity: string; n: number }>(
    sql`SELECT coalesce(severity, 'unset') AS severity, count(*)::int AS n
        FROM feedbacksubmissions WHERE disposition = 'scope' AND dismissedat IS NULL GROUP BY severity`,
  );

  const trendRows = await db.execute<{ month: string; bug: number; suggestion: number }>(sql`
    SELECT to_char(date_trunc('month', createdat), 'YYYY-MM') AS month,
           count(*) FILTER (WHERE type = 'bug')::int AS bug,
           count(*) FILTER (WHERE type = 'suggestion')::int AS suggestion
    FROM feedbacksubmissions
    WHERE dismissedat IS NULL
    GROUP BY 1 ORDER BY 1
  `);

  const toMap = (rows: Array<Record<string, unknown>>, key: string): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const r of rows) out[String(r[key])] = Number(r.n);
    return out;
  };

  const judged = Number((accuracyRow.rows[0] as Record<string, unknown>)?.judged ?? 0);
  const accepted = Number((accuracyRow.rows[0] as Record<string, unknown>)?.accepted ?? 0);
  const medianHoursRaw = (medianRow.rows[0] as Record<string, unknown>)?.hours;

  return {
    total: Number(t.total ?? 0),
    decisionCoverage: {
      open: Number(t.open ?? 0),
      dispositioned: Number(t.dispositioned ?? 0),
      scoped: Number(t.scoped ?? 0),
    },
    byStatus: toMap(statusRows.rows as Array<Record<string, unknown>>, "status"),
    byDisposition: toMap(dispRows.rows as Array<Record<string, unknown>>, "disposition"),
    medianTimeToDispositionHours:
      medianHoursRaw == null ? null : Math.round(Number(medianHoursRaw) * 10) / 10,
    aiAccuracy: {
      judged,
      accepted,
      overridden: judged - accepted,
      acceptRate: judged > 0 ? Math.round((accepted / judged) * 100) / 100 : null,
    },
    scopeConversion: {
      byClassification: toMap(convClassRows.rows as Array<Record<string, unknown>>, "classification"),
      bySeverity: toMap(convSevRows.rows as Array<Record<string, unknown>>, "severity"),
    },
    volumeTrend: (trendRows.rows as Array<Record<string, unknown>>).map((r) => ({
      month: String(r.month),
      bug: Number(r.bug),
      suggestion: Number(r.suggestion),
    })),
  };
}
// [SCOPE 043 / T012] END

// ── SCOPE-110 — Feedback Queue Hygiene: removal (dismiss / purge), bulk-first ──

// [SCOPE 110 / T003] BEGIN — bulk is the primitive (FR-003)
// Every removal action takes a SET of identifiers; acting on one record is a
// single-element call on the same path. A malformed identifier fails the whole
// set (never a partial apply); the set is capped so one request cannot sweep the
// table. Well-formed-but-unknown ids are not "invalid" — they simply match nothing.
const MAX_BULK_IDS = 200;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateIdSet(ids: unknown): asserts ids is string[] {
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new Error("at least one identifier is required");
  }
  if (ids.length > MAX_BULK_IDS) {
    throw new Error(`too many identifiers: ${ids.length} (max ${MAX_BULK_IDS})`);
  }
  for (const id of ids) {
    if (typeof id !== "string" || !UUID_RE.test(id)) {
      throw new Error(`invalid identifier in set: ${String(id)}`);
    }
  }
}
// [SCOPE 110 / T003] END

// [SCOPE 110 / T001] resolve the sink project's company once, so an auto-error
// record with no company can still be audited on purge (FR-002).
let sinkCompanyIdCache: string | null | undefined;
async function resolveSinkCompanyId(): Promise<string | null> {
  if (sinkCompanyIdCache !== undefined) return sinkCompanyIdCache;
  try {
    const r = await db.execute<{ companyid: string | null }>(
      sql`SELECT companyid FROM companyprojects WHERE id = ${SINK_PROJECT_ID} LIMIT 1`,
    );
    sinkCompanyIdCache = ((r.rows[0]?.companyid as string) ?? null) || null;
  } catch {
    sinkCompanyIdCache = null;
  }
  return sinkCompanyIdCache;
}

// [SCOPE 110 / T008] BEGIN — dismiss / undismiss (FR-001, reversible, no audit)
// Dismissal is a reversible hide, not a deletion, so it is not audited. It leaves
// status/disposition and every other triage field untouched. Re-dismissing an
// already-dismissed record is a no-op (the isNull guard simply matches nothing).
export async function dismissFeedback(
  ids: string[],
  adminId?: string,
): Promise<{ dismissed: number }> {
  validateIdSet(ids);
  const updated = await db
    .update(feedbacksubmissions)
    .set({ dismissedat: new Date(), dismissedbyid: adminId ?? null, updatedat: new Date() })
    .where(and(inArray(feedbacksubmissions.id, ids), isNull(feedbacksubmissions.dismissedat)))
    .returning({ id: feedbacksubmissions.id });
  logger.info({ count: updated.length, requested: ids.length, adminId }, "feedback dismissed");
  return { dismissed: updated.length };
}

export async function undismissFeedback(
  ids: string[],
): Promise<{ undismissed: number }> {
  validateIdSet(ids);
  const updated = await db
    .update(feedbacksubmissions)
    .set({ dismissedat: null, dismissedbyid: null, updatedat: new Date() })
    .where(and(inArray(feedbacksubmissions.id, ids), isNotNull(feedbacksubmissions.dismissedat)))
    .returning({ id: feedbacksubmissions.id });
  logger.info({ count: updated.length, requested: ids.length }, "feedback undismissed");
  return { undismissed: updated.length };
}
// [SCOPE 110 / T008] END

// [SCOPE 110 / T009] BEGIN — purge with audit + bulk primitive (FR-002, FR-003)
// MODIFIED-BY: [SCOPE 110 / T010] — confirmation semantics (FR-007)
// Permanent deletion. The audit entry for each row is written INSIDE the same
// transaction as the delete, so a failed audit rolls the whole thing back —
// nothing is ever deleted unrecorded, and a partial failure deletes nothing. The
// full row is stored in previousvalue so a purged report's content survives it.
// Rows that referenced a purged row via duplicateofid survive with that reference
// cleared automatically (the FK is ON DELETE SET NULL).
export class PurgeConfirmationError extends Error {
  constructor(message: string, public readonly humanTitles: string[]) {
    super(message);
    this.name = "PurgeConfirmationError";
  }
}

export async function purgeFeedback(
  ids: string[],
  opts: { adminId?: string; confirm?: boolean; confirmText?: string } = {},
): Promise<{ purged: number }> {
  validateIdSet(ids);
  const rows = (await db
    .select()
    .from(feedbacksubmissions)
    .where(inArray(feedbacksubmissions.id, ids))) as FeedbackSubmission[];
  if (rows.length === 0) return { purged: 0 };

  // FR-007 — confirmation proportionate to what is destroyed. Any human-submitted
  // record in the set demands the typed word DELETE and names the affected titles;
  // an all-automatic sweep needs only a single confirmation.
  const humans = rows.filter((r) => r.source !== "auto");
  if (humans.length > 0) {
    if (opts.confirmText !== "DELETE") {
      const titles = humans.map((h) => h.title);
      throw new PurgeConfirmationError(
        `purge of ${humans.length} human-submitted record(s) requires typing DELETE to confirm`,
        titles,
      );
    }
  } else if (opts.confirm !== true && opts.confirmText !== "DELETE") {
    throw new Error("purge requires confirmation");
  }

  const sinkCompanyId = await resolveSinkCompanyId();

  await db.transaction(async (tx) => {
    for (const row of rows) {
      // FR-002 — an auto record may have no company; attribute the audit to the
      // sink project's company, preserving the record's own company in the payload.
      const companyId = row.companyid ?? sinkCompanyId;
      if (!companyId) {
        throw new Error(`cannot resolve a company for the purge audit of ${row.id}`);
      }
      await tx.insert(companyauditlogs).values({
        companyid: companyId,
        changedby: opts.adminId ?? null,
        action: "FEEDBACK_PURGED",
        previousvalue: row as unknown as Record<string, unknown>, // full snapshot survives deletion
        newvalue: {
          resourceType: "feedback",
          resourceId: row.id,
          source: row.source,
          title: row.title,
          submitterId: row.userid,
          originalCompanyId: row.companyid,
          purgedBy: opts.adminId ?? null,
        },
        description: `FEEDBACK_PURGED ${row.id} (${row.source}) "${row.title}" by ${opts.adminId ?? "system"}`,
      });
    }
    await tx.delete(feedbacksubmissions).where(inArray(feedbacksubmissions.id, ids));
  });

  logger.info({ count: rows.length, humans: humans.length, adminId: opts.adminId }, "feedback purged with audit");
  return { purged: rows.length };
}
// [SCOPE 110 / T009] END
