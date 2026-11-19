import { and, asc, eq } from "drizzle-orm";
import { db, pool } from "~/db/client.js";
import {
  feedbacksubmissions,
  type FeedbackSubmission,
} from "~/db/schema/feedbacksubmissions.js";
import { computeErrorFingerprint } from "~/server/lib/errorFingerprint.js";
import { sendFeedbackNotification } from "~/server/services/FeedbackNotificationService.js";
import { createLogger } from "~/server/lib/logger.js";
import type {
  CapturedErrorInput,
  CapturedErrorSeverity,
} from "~/shared/types/errors.js";
import { APP_VERSION } from "~/client/version.js";

const logger = createLogger("error-capture");

// [SCOPE 061] BEGIN — automatic error capture intake (app-side, fail-open).
// MODIFIED-BY: [SCOPE 063 / T002] — capture() takes ctx.projectId (default sink)
// MODIFIED-BY: [SCOPE 110 / T003] — identity upsert rides the DB unique constraint
// MODIFIED-BY: [SCOPE 110 / T004] — recurrence reopens the same record (one notify)
// Writes trapped runtime errors into feedbacksubmissions in the sink project
// (source='auto', type='error'), grouped by deterministic fingerprint. This
// MIRRORS the MCP resolveSinkScope's resolve-sink+insert (the app server can't
// import the mcp-server util). Nothing here may ever throw into the caller.

const SINK_PROJECT_ID =
  process.env["FEEDBACK_SINK_PROJECT_ID"] ||
  "ba924193-0335-4080-9fa6-33cd6b81300a"; // wxKanban Development

const ENABLED = process.env["ERROR_CAPTURE_ENABLED"] !== "false"; // default on
const ENVIRONMENT = process.env["NODE_ENV"] || "development";

// Per-fingerprint write rate-limit (in-memory; single instance is enough for v1).
const RATE_WINDOW_MS = 2000;
const lastWriteByFp = new Map<string, number>();

// Cache each project's owner user id (fallback userid for anonymous errors,
// since feedbacksubmissions.userid is NOT NULL). Keyed by projectid.
// [SCOPE 063 / T002] per-project owner cache (was a single sink-owner scalar).
const ownerCacheByProject = new Map<string, string | null>();

export interface ErrorCaptureContext {
  userId?: string | null;
  // [SCOPE 063 / T002] target project for the row; defaults to the central sink
  // so wxKanban's own dogfooding (POST /api/errors) is unchanged.
  projectId?: string | null;
}

export class ErrorCaptureService {
  static isEnabled(): boolean {
    return ENABLED;
  }

  /** Best-effort capture. Never throws; returns a tiny result for tests/logs. */
  static async capture(
    input: CapturedErrorInput,
    ctx: ErrorCaptureContext = {},
  ): Promise<{ ok: boolean; deduped?: boolean; skipped?: string }> {
    if (!ENABLED) return { ok: false, skipped: "disabled" };
    try {
      // [SCOPE 063 / T002] route to the target project, default central sink.
      const projectId = ctx.projectId || SINK_PROJECT_ID;
      const fp = computeErrorFingerprint(input);

      // Per-(project,fingerprint) rate-limit so one noisy project can't starve
      // another's writes. Channel-independent; bounds DB writes under a storm.
      const now = Date.now();
      const rateKey = `${projectId}:${fp}`;
      const last = lastWriteByFp.get(rateKey) ?? 0;
      if (now - last < RATE_WINDOW_MS) return { ok: true, skipped: "ratelimited" };
      lastWriteByFp.set(rateKey, now);

      const userId = ctx.userId || (await this.ownerUserId(projectId));
      if (!userId) return { ok: false, skipped: "no-user" };

      const severity = this.severityFor(input);
      const title = this.buildTitle(input);
      const details = {
        name: input.name,
        message: (input.message || "").slice(0, 4000),
        kind: input.kind,
        source: input.source,
        stack: (input.stack || "").slice(0, 8000),
        componentStack: (input.componentStack || "").slice(0, 4000) || undefined,
        status: input.status,
      };
      const context = {
        appVersion: APP_VERSION,
        environment: ENVIRONMENT,
        route: input.route,
        source: input.source,
        originUserId: ctx.userId ?? null,
      };

      // [SCOPE 110 / T003+T004] Identity-based dedup with reopen-on-recurrence.
      // Match ANY auto row with this identity regardless of status. FR-009's unique
      // index (projectid, errorfingerprint) WHERE source='auto' makes this at most
      // one per project; the T006 merge collapses pre-existing duplicates so this
      // lookup is single-valued in production. Ordering by firstoccurredat picks
      // the same row the merge keeps as survivor.
      const bumpOrReopen = async (): Promise<{
        ok: boolean;
        deduped: boolean;
        reopened?: boolean;
      } | null> => {
        const [row] = (await db
          .select()
          .from(feedbacksubmissions)
          .where(
            and(
              eq(feedbacksubmissions.projectid, projectId),
              eq(feedbacksubmissions.source, "auto"),
              eq(feedbacksubmissions.errorfingerprint, fp),
            ),
          )
          .orderBy(asc(feedbacksubmissions.firstoccurredat))
          .limit(1)) as FeedbackSubmission[];
        if (!row) return null;

        const closed = row.status === "resolved" || row.status === "declined";
        if (closed) {
          // FR-010 — recurrence reopens the SAME record: return to 'new', stamp
          // reopenedat, clear any dismissal, and remember the status it previously
          // held (in context — the scope adds no previousstatus column) so the
          // console can present the regression.
          const mergedContext = {
            ...((row.context as Record<string, unknown> | null) ?? {}),
            reopenedfrom: row.status,
          };
          await db
            .update(feedbacksubmissions)
            .set({
              status: "new",
              reopenedat: new Date(),
              occurrencecount: (row.occurrencecount ?? 1) + 1,
              lastoccurredat: new Date(),
              dismissedat: null,
              dismissedbyid: null,
              context: mergedContext,
              notifystatus: "pending",
              updatedat: new Date(),
            })
            .where(eq(feedbacksubmissions.id, row.id));
          // Exactly ONE notification, fired by the resolved/declined → new
          // transition, not by the occurrence. Re-read for the fresh row state.
          const [fresh] = (await db
            .select()
            .from(feedbacksubmissions)
            .where(eq(feedbacksubmissions.id, row.id))) as FeedbackSubmission[];
          if (fresh) await sendFeedbackNotification(fresh);
          return { ok: true, deduped: true, reopened: true };
        }

        // Already-open record — bump the occurrence count only; no notification.
        await db
          .update(feedbacksubmissions)
          .set({
            occurrencecount: (row.occurrencecount ?? 1) + 1,
            lastoccurredat: new Date(),
            updatedat: new Date(),
          })
          .where(eq(feedbacksubmissions.id, row.id));
        return { ok: true, deduped: true };
      };

      const bumped = await bumpOrReopen();
      if (bumped) return bumped;

      // No existing identity — insert. If a concurrent instance inserted the same
      // identity first, the FR-009 unique index rejects this with SQLSTATE 23505;
      // fall back to the bump/reopen path so correctness rides the DB constraint,
      // not the in-memory rate-limit guard.
      try {
        await db.insert(feedbacksubmissions).values({
          projectid: projectId,
          userid: userId,
          type: "error",
          title,
          details,
          context,
          severity,
          classification: "bug",
          source: "auto",
          errorfingerprint: fp,
          occurrencecount: 1,
          firstoccurredat: new Date(),
          lastoccurredat: new Date(),
          status: "new",
        });
        return { ok: true, deduped: false };
      } catch (err) {
        if ((err as { code?: string }).code === "23505") {
          const retried = await bumpOrReopen();
          if (retried) return retried;
        }
        throw err;
      }
    } catch (err) {
      // Fail-open: a capture failure must never affect the app.
      logger.warn({ err: (err as Error).message }, "error capture failed (swallowed)");
      return { ok: false, skipped: "error" };
    }
  }

  /** Deterministic severity by source/kind — no AI in v1. */
  private static severityFor(input: CapturedErrorInput): CapturedErrorSeverity {
    switch (input.kind) {
      case "uncaughtException":
      case "unhandledRejectionServer":
        return "critical";
      case "serverHandler":
      case "errorBoundary":
        return "high";
      default:
        return "medium";
    }
  }

  private static buildTitle(input: CapturedErrorInput): string {
    const base = `[${input.source}/${input.kind}] ${input.name}: ${input.message || ""}`;
    return base.replace(/\s+/g, " ").trim().slice(0, 250);
  }

  // [SCOPE 063 / T002] resolve any project's owner userid (was sink-only).
  private static async ownerUserId(projectId: string): Promise<string | null> {
    const cached = ownerCacheByProject.get(projectId);
    if (cached !== undefined) return cached;
    let owner: string | null = null;
    try {
      const r = await pool.query<{ userid: string }>(
        "select userid from companyprojects where id = $1 limit 1",
        [projectId],
      );
      owner = r.rows[0]?.userid ?? null;
    } catch {
      owner = null;
    }
    ownerCacheByProject.set(projectId, owner);
    return owner;
  }
}
// [SCOPE 061] END
