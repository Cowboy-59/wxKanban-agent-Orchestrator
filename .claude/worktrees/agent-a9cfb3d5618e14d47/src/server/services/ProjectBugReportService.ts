import { and, desc, eq, ne, sql } from "drizzle-orm";
import { db } from "~/db/client.js";
import { feedbacksubmissions } from "~/db/schema/feedbacksubmissions.js";
import { projecttasks } from "~/db/schema/projecttask.js";
import { createLogger } from "~/server/lib/logger.js";

const logger = createLogger("project-bug-reports");

// [SCOPE 063 / T007] BEGIN — ProjectBugReportService (project-scoped triage)
// Customer-facing, per-project triage over feedbacksubmissions. EVERY query is
// bounded by projectid and EVERY mutation re-checks row.projectid === projectId
// — this is the cross-tenant isolation invariant (US3 / Success Criterion #1).
// Distinct from the cross-project (SysAdmin) FeedbackTriageService, which must
// never be reused on this customer surface.

export const REPORT_STATUSES = [
  "new", "triaged", "needsinfo", "inprogress", "resolved", "declined",
] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export interface BugReportFilter {
  status?: string;
  source?: string;
  type?: string;
}

export class ProjectBugReportService {
  /** List reports for a project, optionally filtered. Newest activity first.
   *  [SCOPE 063 fix] status handling: a specific status matches exactly; the
   *  literal "all" applies no status filter; ABSENT hides resolved by default
   *  (resolving a report clears it from the working queue). */
  static async list(projectId: string, filter: BugReportFilter = {}) {
    const conds = [eq(feedbacksubmissions.projectid, projectId)];
    if (filter.status && filter.status !== "all") {
      conds.push(eq(feedbacksubmissions.status, filter.status));
    } else if (!filter.status) {
      conds.push(ne(feedbacksubmissions.status, "resolved"));
    }
    if (filter.source) conds.push(eq(feedbacksubmissions.source, filter.source));
    if (filter.type) conds.push(eq(feedbacksubmissions.type, filter.type));

    return db
      .select({
        id: feedbacksubmissions.id,
        type: feedbacksubmissions.type,
        title: feedbacksubmissions.title,
        severity: feedbacksubmissions.severity,
        status: feedbacksubmissions.status,
        source: feedbacksubmissions.source,
        occurrencecount: feedbacksubmissions.occurrencecount,
        firstoccurredat: feedbacksubmissions.firstoccurredat,
        lastoccurredat: feedbacksubmissions.lastoccurredat,
        createdat: feedbacksubmissions.createdat,
        suggestedsolution: feedbacksubmissions.suggestedsolution,
        suggestedat: feedbacksubmissions.suggestedat,
        linkedtaskid: feedbacksubmissions.linkedtaskid,
      })
      .from(feedbacksubmissions)
      .where(and(...conds))
      .orderBy(desc(feedbacksubmissions.lastoccurredat), desc(feedbacksubmissions.createdat));
  }

  /** [SCOPE 063 fix] Per-status counts for the status filter chips. Bounded by the
   *  same source/type as the list, so the chip counts match what a filter yields.
   *  Returns every status key (zero-filled) plus `total` and `active` (= non-resolved). */
  static async counts(projectId: string, filter: Omit<BugReportFilter, "status"> = {}) {
    const conds = [eq(feedbacksubmissions.projectid, projectId)];
    if (filter.source) conds.push(eq(feedbacksubmissions.source, filter.source));
    if (filter.type) conds.push(eq(feedbacksubmissions.type, filter.type));
    const rows = await db
      .select({ status: feedbacksubmissions.status, n: sql<number>`count(*)::int` })
      .from(feedbacksubmissions)
      .where(and(...conds))
      .groupBy(feedbacksubmissions.status);

    const out: Record<string, number> = { total: 0, active: 0 };
    for (const s of REPORT_STATUSES) out[s] = 0;
    for (const r of rows) {
      const n = Number(r.n);
      out[String(r.status)] = n;
      out.total += n;
    }
    out.active = out.total - (out.resolved ?? 0);
    return out;
  }

  /** A single report — only if it belongs to this project (else null). */
  static async get(projectId: string, reportId: string) {
    const [row] = await db
      .select()
      .from(feedbacksubmissions)
      .where(and(eq(feedbacksubmissions.id, reportId), eq(feedbacksubmissions.projectid, projectId)))
      .limit(1);
    return row ?? null;
  }

  /** Transition status. Re-checks ownership; stamps firsttriagedat once. */
  static async setStatus(
    projectId: string,
    reportId: string,
    status: ReportStatus,
    opts: { declineReason?: string } = {},
  ) {
    const current = await this.get(projectId, reportId);
    if (!current) return null;
    if (status === "declined" && !opts.declineReason?.trim()) {
      throw new Error("declineReason is required when declining");
    }
    const updates: Record<string, unknown> = { status, updatedat: new Date() };
    if (!current.firsttriagedat) updates.firsttriagedat = new Date();
    if (status === "declined") updates.declinereason = opts.declineReason ?? null;
    await db
      .update(feedbacksubmissions)
      .set(updates)
      .where(and(eq(feedbacksubmissions.id, reportId), eq(feedbacksubmissions.projectid, projectId)));
    return this.get(projectId, reportId);
  }

  /** Append an internal note (newline-separated audit trail). */
  static async addNote(projectId: string, reportId: string, note: string) {
    const current = await this.get(projectId, reportId);
    if (!current) return null;
    const stamped = `[${new Date().toISOString()}] ${note.trim()}`;
    const merged = current.internalnotes ? `${current.internalnotes}\n---\n${stamped}` : stamped;
    await db
      .update(feedbacksubmissions)
      .set({ internalnotes: merged, updatedat: new Date() })
      .where(and(eq(feedbacksubmissions.id, reportId), eq(feedbacksubmissions.projectid, projectId)));
    return this.get(projectId, reportId);
  }

  /**
   * Create a project task from a report (US4). Idempotent: a report already
   * linked to a task returns that task id without creating a duplicate. On
   * creation the report auto-advances to 'inprogress'.
   */
  static async createTask(projectId: string, reportId: string, userId: string) {
    const current = await this.get(projectId, reportId);
    if (!current) return null;
    if (current.linkedtaskid) {
      return { taskId: current.linkedtaskid, created: false };
    }

    const fix = current.suggestedsolution?.trim();
    const detailsText = (() => {
      const d = current.details as Record<string, unknown> | null;
      const msg = d && typeof d.message === "string" ? d.message : "";
      const stack = d && typeof d.stack === "string" ? d.stack : "";
      return [msg, stack].filter(Boolean).join("\n\n");
    })();
    const description = [
      fix ? `AI-suggested fix:\n${fix}` : null,
      current.suggestedsolutionrationale ? `Rationale: ${current.suggestedsolutionrationale}` : null,
      detailsText ? `Error detail:\n${detailsText}` : null,
      `(Created from bug report ${reportId})`,
    ]
      .filter(Boolean)
      .join("\n\n");

    const [task] = await db
      .insert(projecttasks)
      .values({
        projectid: projectId,
        name: current.title.slice(0, 255),
        description,
        issuetype: "bug",
        priority: current.severity === "critical" || current.severity === "high" ? "high" : "medium",
        status: "open",
        sourceoforigin: "ai_proposed",
        createdbyid: userId,
      })
      .returning({ id: projecttasks.id });

    await db
      .update(feedbacksubmissions)
      .set({ linkedtaskid: task.id, status: "inprogress", updatedat: new Date() })
      .where(and(eq(feedbacksubmissions.id, reportId), eq(feedbacksubmissions.projectid, projectId)));

    logger.info({ projectId, reportId, taskId: task.id }, "task created from bug report");
    return { taskId: task.id, created: true };
  }

  /** Persist an AI suggestion onto a report (ownership re-checked). */
  static async saveSuggestion(
    projectId: string,
    reportId: string,
    suggestion: { solution: string; rationale: string },
  ) {
    await db
      .update(feedbacksubmissions)
      .set({
        suggestedsolution: suggestion.solution,
        suggestedsolutionrationale: suggestion.rationale,
        suggestedat: new Date(),
        updatedat: new Date(),
      })
      .where(and(eq(feedbacksubmissions.id, reportId), eq(feedbacksubmissions.projectid, projectId)));
    return this.get(projectId, reportId);
  }
}
// [SCOPE 063 / T007] END
