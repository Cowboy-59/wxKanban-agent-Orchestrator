import type { DbConnection } from "../../core/engine.js";

// [SCOPE 121 / T015] BEGIN — Capability detection
// MODIFIED-BY [SCOPE 121 / T020] — added "autovacuum_freeze_max_age" to
// TRACKED_SETTINGS. It was missing, so `collectCapabilities` never copied it
// into `settings`, and Task 20's freeze-headroom calculation always fell back
// to the hardcoded default even on databases where a DBA had tuned the real
// setting down (Task 20 review round 1, Finding 1 — Critical).
/**
 * `preloaded-not-created` is the state that matters and the reason this is a
 * four-value union rather than a boolean.
 *
 * On this database `pg_stat_statements` sits in `shared_preload_libraries`, so
 * the server has been collecting query statistics all along — but nobody ran
 * `CREATE EXTENSION`, so the view does not exist and nothing can read them.
 * Reporting that as "unavailable" would hide a one-statement fix that unlocks
 * data already being gathered.
 */
export type ExtensionState =
  | "installed"
  | "preloaded-not-created"
  | "available-not-installed"
  | "unavailable";

/** Extensions this tool can make use of, and reports on when absent. */
export const TRACKED_EXTENSIONS = [
  "pg_stat_statements",
  "pgstattuple",
  "pg_buffercache",
  "pgaudit",
] as const;

export type TrackedExtension = (typeof TRACKED_EXTENSIONS)[number];

/** Settings the later dimensions read. */
export const TRACKED_SETTINGS = [
  "autovacuum",
  "track_counts",
  "track_io_timing",
  "max_connections",
  "shared_preload_libraries",
  "server_version_num",
  "autovacuum_vacuum_scale_factor",
  "autovacuum_analyze_scale_factor",
  "autovacuum_vacuum_threshold",
  "autovacuum_analyze_threshold",
  "autovacuum_freeze_max_age",
] as const;

export interface PgCapabilities {
  extensions: Record<TrackedExtension, ExtensionState>;
  settings: Record<string, string>;
  serverVersionNum: number;
}

export const EXTENSIONS_SQL = `select extname from pg_catalog.pg_extension`;
export const AVAILABLE_SQL = `select name from pg_catalog.pg_available_extensions`;
export const SETTINGS_SQL = `select name, setting from pg_catalog.pg_settings`;

export async function collectCapabilities(
  connection: DbConnection,
): Promise<PgCapabilities> {
  const installed = new Set(
    (await connection.query(EXTENSIONS_SQL)).map((r) => String(r.extname)),
  );
  const available = new Set(
    (await connection.query(AVAILABLE_SQL)).map((r) => String(r.name)),
  );

  const settings: Record<string, string> = {};
  for (const row of await connection.query(SETTINGS_SQL)) {
    const name = String(row.name);
    if ((TRACKED_SETTINGS as readonly string[]).includes(name)) {
      settings[name] = String(row.setting);
    }
  }

  const preloaded = (settings.shared_preload_libraries ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const extensions = {} as Record<TrackedExtension, ExtensionState>;
  for (const ext of TRACKED_EXTENSIONS) {
    extensions[ext] = installed.has(ext)
      ? "installed"
      : preloaded.includes(ext)
        ? "preloaded-not-created"
        : available.has(ext)
          ? "available-not-installed"
          : "unavailable";
  }

  return {
    extensions,
    settings,
    serverVersionNum: Number(settings.server_version_num ?? 0),
  };
}
// [SCOPE 121 / T015] END
