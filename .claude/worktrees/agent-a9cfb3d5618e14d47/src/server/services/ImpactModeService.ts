/**
 * The project owner's Change Impact mode — SCOPE-137 Amendment A (FR-007a).
 *
 * Each change is appended as an `impact_mode_set` row in the shared `events` table; the newest
 * valid row is the project's mode. Rows are only ever inserted, never updated or deleted
 * (tests/unit/change-impact-log-immutable.test.ts). The kit reads the mode through the hosted
 * MCP's project.cockpit_summary; it cannot write it, because capture_event refuses the type.
 * The table is not declared in the app's Drizzle schema, so it is read and written with
 * parameterized SQL, as ChangeImpactLogService does.
 */
import { sql } from "drizzle-orm";
import { db } from "~/db/client.js";

// [SCOPE 137 / T019] BEGIN — Owner-set impactMode: read the latest, append a change (FR-007a)
export const IMPACT_MODES = ["notify", "boundaries", "always"] as const;
export type ImpactMode = (typeof IMPACT_MODES)[number];
export const IMPACT_MODE_EVENT_TYPE = "impact_mode_set";

export interface OwnerImpactMode {
  mode: ImpactMode;
  previous: ImpactMode | null;
  setBy: string;
  setAt: string;
}

type Row = { actor: string; metadata: Record<string, unknown> | null; created_at: string | Date };

export const isImpactMode = (v: unknown): v is ImpactMode =>
  typeof v === "string" && (IMPACT_MODES as readonly string[]).includes(v);

function rowsOf(result: unknown): Row[] {
  return ((result as { rows?: Row[] }).rows ?? (result as Row[])) as Row[];
}

export class ImpactModeService {
  /** The owner's mode, or null when it was never set (the kit then uses its local value). */
  static async get(projectId: string): Promise<OwnerImpactMode | null> {
    const result = await db.execute(sql`
      SELECT actor, metadata, created_at
      FROM events
      WHERE projectid = ${projectId} AND type = ${IMPACT_MODE_EVENT_TYPE}
      ORDER BY created_at DESC
      LIMIT 20
    `);
    for (const row of rowsOf(result)) {
      const m = row.metadata ?? {};
      if (!isImpactMode(m.mode)) continue;
      return {
        mode: m.mode,
        previous: isImpactMode(m.previous) ? m.previous : null,
        setBy: row.actor,
        setAt: new Date(row.created_at).toISOString(),
      };
    }
    return null;
  }

  /** Append a change. Setting the mode it already has records nothing and returns it unchanged. */
  static async set(
    projectId: string,
    mode: ImpactMode,
    by: { userid: string; label: string },
  ): Promise<{ changed: boolean; current: OwnerImpactMode }> {
    const before = await this.get(projectId);
    if (before?.mode === mode) return { changed: false, current: before };
    const previous = before?.mode ?? null;
    const metadata = { mode, previous, setByUserId: by.userid };
    const summary = `impactMode set to ${mode}${previous ? ` (was ${previous})` : ""}`;
    const result = await db.execute(sql`
      INSERT INTO events (projectid, type, source, actor, raw_content, metadata)
      VALUES (${projectId}, ${IMPACT_MODE_EVENT_TYPE}, ${"web"}, ${by.label}, ${summary}, ${JSON.stringify(metadata)}::jsonb)
      RETURNING created_at
    `);
    const [row] = rowsOf(result);
    return {
      changed: true,
      current: { mode, previous, setBy: by.label, setAt: new Date(row?.created_at ?? Date.now()).toISOString() },
    };
  }
}
// [SCOPE 137 / T019] END
