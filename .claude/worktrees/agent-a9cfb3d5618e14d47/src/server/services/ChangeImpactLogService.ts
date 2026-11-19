/**
 * Change Impact agreement log, read side — SCOPE-137 / T014 (FR-013).
 *
 * The kit writes agreement records through the MCP's project.capture_event into the shared
 * `events` table. The app only ever READS them: there is no update or delete path for these
 * types anywhere (asserted by tests/unit/change-impact-log-immutable.test.ts). The table is not
 * declared in the app's Drizzle schema, so it is read with one parameterized SELECT.
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "~/db/client.js";
import { projectspecifications } from "~/db/schema/projectspecification.js";

// [SCOPE 137 / T014] BEGIN — Change Impact agreement log read service (FR-013)
export const CHANGE_IMPACT_EVENT_TYPES = ["change_impact_ack", "change_impact_approval", "change_impact_crossing"] as const;

export interface ChangeImpactRecord {
  id: string;
  type: (typeof CHANGE_IMPACT_EVENT_TYPES)[number];
  kind: string;
  actor: string;
  source: string;
  summary: string;
  createdAt: string;
  occurredAt: string | null;
  attended: boolean;
  mode: string | null;
  decision: string | null;
  answer: string | null;
  entryPoint: string | null;
  queued: boolean;
  changedFiles: string[];
  changeHash: string | null;
  affected: number;
  reasons: Array<{ kind: string; detail: string }>;
  scopes: string[];
}

type EventRow = {
  id: string;
  type: string;
  actor: string;
  source: string;
  raw_content: string;
  metadata: Record<string, unknown> | null;
  created_at: string | Date;
};

const asStrings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

function toRecord(row: EventRow): ChangeImpactRecord {
  const m = row.metadata ?? {};
  const change = (m.change ?? {}) as Record<string, unknown>;
  const impact = (m.impact ?? {}) as Record<string, unknown>;
  const reasons = Array.isArray(impact.reasons) ? impact.reasons : [];
  return {
    id: row.id,
    type: row.type as ChangeImpactRecord["type"],
    kind: typeof m.kind === "string" ? m.kind : row.type.replace("change_impact_", ""),
    actor: row.actor,
    source: row.source,
    summary: row.raw_content,
    createdAt: new Date(row.created_at).toISOString(),
    occurredAt: typeof m.occurredAt === "string" ? m.occurredAt : null,
    attended: m.attended === true,
    mode: typeof m.mode === "string" ? m.mode : null,
    decision: typeof m.decision === "string" ? m.decision : null,
    answer: typeof m.answer === "string" ? m.answer : null,
    entryPoint: typeof m.entryPoint === "string" ? m.entryPoint : null,
    queued: m.queued === true,
    changedFiles: asStrings(change.files),
    changeHash: typeof change.hash === "string" ? change.hash : null,
    affected: typeof impact.affected === "number" ? impact.affected : 0,
    reasons: reasons
      .filter((r): r is { kind: string; detail: string } => typeof r === "object" && r !== null)
      .map((r) => ({ kind: String(r.kind ?? ""), detail: String(r.detail ?? "") })),
    scopes: asStrings(m.scopes),
  };
}

export class ChangeImpactLogService {
  /**
   * Records that name this scope, newest first. A resend from the kit's offline queue carries
   * the same clientEventId as a record that did arrive; only the first is shown. Null when the
   * scope is not in this project.
   */
  static async listForScope(
    projectId: string,
    scopeId: string,
    limit = 200,
  ): Promise<{ scopeNumber: string; records: ChangeImpactRecord[] } | null> {
    const [scope] = await db
      .select({ specnumber: projectspecifications.specnumber })
      .from(projectspecifications)
      .where(and(eq(projectspecifications.id, scopeId), eq(projectspecifications.projectid, projectId)));
    if (!scope) return null;
    const scopeNumber = String(scope.specnumber).padStart(3, "0");

    const result = await db.execute(sql`
      SELECT id, type, actor, source, raw_content, metadata, created_at
      FROM events
      WHERE projectid = ${projectId}
        AND type IN ('change_impact_ack', 'change_impact_approval', 'change_impact_crossing')
        AND jsonb_exists(metadata -> 'scopes', ${scopeNumber})
      ORDER BY created_at DESC
      LIMIT ${Math.min(Math.max(limit, 1), 500)}
    `);
    const newestFirst = ((result as unknown as { rows?: EventRow[] }).rows ?? (result as unknown as EventRow[])) as EventRow[];

    // Oldest first, so the record that arrived first is the one kept.
    const seen = new Set<string>();
    const records: ChangeImpactRecord[] = [];
    for (const row of [...newestFirst].reverse()) {
      const clientId = typeof row.metadata?.clientEventId === "string" ? row.metadata.clientEventId : row.id;
      if (seen.has(clientId)) continue;
      seen.add(clientId);
      records.push(toRecord(row));
    }
    return { scopeNumber, records: records.reverse() };
  }
}
// [SCOPE 137 / T014] END
