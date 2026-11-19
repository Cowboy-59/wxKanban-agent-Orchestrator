import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "~/db/client.js";
import { companyprojects, mcpdriftevents } from "~/db/schema/index.js";
import { createLogger } from "~/server/lib/logger.js";
import type {
  DriftEventFilters,
  DriftEventInput,
  DriftEventRecord,
  DriftSummary,
  GatewaySeverity,
} from "~/shared/types/gateway.js";
import { GitHubFeedbackClient } from "./GitHubFeedbackClient.js";

const logger = createLogger("drift-event-service");

function toRecord(row: typeof mcpdriftevents.$inferSelect): DriftEventRecord {
  return {
    id: row.id,
    projectId: row.projectid,
    projectIdentifier: row.projectidentifier,
    mcpVersionMain: row.mcpversionmain,
    mcpVersionKit: row.mcpversionkit,
    changedPaths: Array.isArray(row.changedpaths) ? row.changedpaths.map(String) : [],
    severity: row.severity as GatewaySeverity,
    githubFeedbackRef: row.githubfeedbackref ?? null,
    resolvedStatus: row.resolvedstatus as DriftEventRecord["resolvedStatus"],
    resolvedAt: row.resolvedat ? row.resolvedat.toISOString() : null,
    createdAt: row.createdat.toISOString(),
  };
}

export class DriftEventService {
  constructor(private readonly githubFeedbackClient = new GitHubFeedbackClient()) {}

  async emit(input: DriftEventInput): Promise<DriftEventRecord> {
    const githubFeedbackRef = await this.githubFeedbackClient.createDriftIssue(input);
    const [created] = await db
      .insert(mcpdriftevents)
      .values({
        projectid: input.projectid,
        projectidentifier: input.projectidentifier,
        mcpversionmain: input.mcpversionmain,
        mcpversionkit: input.mcpversionkit,
        changedpaths: input.changedpaths,
        severity: input.severity,
        githubfeedbackref: githubFeedbackRef,
      })
      .returning();

    logger.info({ eventid: created.id, projectid: input.projectid, severity: input.severity }, "Drift event emitted");
    return toRecord(created);
  }

  async list(filters: DriftEventFilters): Promise<{ total: number; events: DriftEventRecord[] }> {
    const conditions = [];

    if (filters.projectid) {
      conditions.push(eq(mcpdriftevents.projectid, filters.projectid));
    }

    if (filters.status) {
      conditions.push(eq(mcpdriftevents.resolvedstatus, filters.status));
    }

    if (filters.severity && filters.severity.length > 0) {
      conditions.push(inArray(mcpdriftevents.severity, filters.severity));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const limit = Math.min(filters.limit ?? 50, 200);
    const offset = Math.max(filters.offset ?? 0, 0);

    const totalResult = await db
      .select({ count: count() })
      .from(mcpdriftevents)
      .where(whereClause);

    const rows = await db
      .select()
      .from(mcpdriftevents)
      .where(whereClause)
      .orderBy(desc(mcpdriftevents.createdat))
      .limit(limit)
      .offset(offset);

    return {
      total: totalResult[0]?.count ?? 0,
      events: rows.map(toRecord),
    };
  }

  async getById(id: string): Promise<DriftEventRecord | null> {
    const [row] = await db.select().from(mcpdriftevents).where(eq(mcpdriftevents.id, id)).limit(1);
    return row ? toRecord(row) : null;
  }

  async resolve(id: string, note?: string): Promise<{ id: string; resolvedStatus: string; resolvedAt: string } | null> {
    const existing = await this.getById(id);
    if (!existing) {
      return null;
    }

    const resolvedAt = new Date();
    const [updated] = await db
      .update(mcpdriftevents)
      .set({ resolvedstatus: "resolved", resolvedat: resolvedAt })
      .where(eq(mcpdriftevents.id, id))
      .returning();

    if (existing.githubFeedbackRef) {
      await this.githubFeedbackClient.resolveDriftIssue(existing.githubFeedbackRef, note);
    }

    return {
      id: updated.id,
      resolvedStatus: updated.resolvedstatus,
      resolvedAt: resolvedAt.toISOString(),
    };
  }

  async aggregate(filters: Pick<DriftEventFilters, "projectid"> = {}): Promise<DriftSummary> {
    const projectCondition = filters.projectid ? eq(mcpdriftevents.projectid, filters.projectid) : undefined;

    const [totals] = await db
      .select({
        total: count(),
        open: sql<number>`COUNT(*) FILTER (WHERE ${mcpdriftevents.resolvedstatus} = 'open')`.mapWith(Number),
        critical: sql<number>`COUNT(*) FILTER (WHERE ${mcpdriftevents.severity} = 'critical')`.mapWith(Number),
        high: sql<number>`COUNT(*) FILTER (WHERE ${mcpdriftevents.severity} = 'high')`.mapWith(Number),
        medium: sql<number>`COUNT(*) FILTER (WHERE ${mcpdriftevents.severity} = 'medium')`.mapWith(Number),
        low: sql<number>`COUNT(*) FILTER (WHERE ${mcpdriftevents.severity} = 'low')`.mapWith(Number),
        oldestunresolveddays: sql<number>`COALESCE(MAX(EXTRACT(DAY FROM NOW() - ${mcpdriftevents.createdat})) FILTER (WHERE ${mcpdriftevents.resolvedstatus} = 'open'), 0)`.mapWith(Number),
      })
      .from(mcpdriftevents)
      .where(projectCondition);

    const byProjectRows = await db
      .select({
        projectIdentifier: mcpdriftevents.projectidentifier,
        open: sql<number>`COUNT(*) FILTER (WHERE ${mcpdriftevents.resolvedstatus} = 'open')`.mapWith(Number),
      })
      .from(mcpdriftevents)
      .where(projectCondition)
      .groupBy(mcpdriftevents.projectidentifier)
      .orderBy(desc(sql`COUNT(*) FILTER (WHERE ${mcpdriftevents.resolvedstatus} = 'open')`));

    return {
      total: totals?.total ?? 0,
      open: totals?.open ?? 0,
      bySeverity: {
        critical: totals?.critical ?? 0,
        high: totals?.high ?? 0,
        medium: totals?.medium ?? 0,
        low: totals?.low ?? 0,
      },
      byProject: byProjectRows,
      oldestUnresolvedDays: totals?.oldestunresolveddays ?? 0,
    };
  }

  async ensureProjectAccess(projectid: string, companyid?: string): Promise<boolean> {
    if (!companyid) {
      return false;
    }

    const [project] = await db
      .select({ id: companyprojects.id })
      .from(companyprojects)
      .where(and(eq(companyprojects.id, projectid), eq(companyprojects.companyid, companyid)))
      .limit(1);

    return Boolean(project);
  }
}
