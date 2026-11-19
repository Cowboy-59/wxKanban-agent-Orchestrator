import { describe, expect, it } from "vitest";
import { collectCapabilities } from "../../_wxAI/skills/wxDBAnalyze/scripts/engines/postgres/capabilities.js";

function conn(rows: Record<string, Record<string, unknown>[]>) {
  return {
    async query(sql: string) {
      const key = Object.keys(rows).find((k) => sql.includes(k));
      return key ? rows[key]! : [];
    },
    async close() {},
  };
}

describe("collectCapabilities", () => {
  it("reports an extension that is installed", async () => {
    const c = await collectCapabilities(
      conn({
        pg_extension: [{ extname: "pg_stat_statements" }],
        pg_available_extensions: [{ name: "pg_stat_statements" }],
        pg_settings: [],
      }),
    );
    expect(c.extensions.pg_stat_statements).toBe("installed");
  });

  it("distinguishes preloaded-but-not-created from simply absent", async () => {
    const c = await collectCapabilities(
      conn({
        pg_extension: [{ extname: "plpgsql" }],
        pg_available_extensions: [
          { name: "pg_stat_statements" },
          { name: "pgstattuple" },
        ],
        pg_settings: [
          { name: "shared_preload_libraries", setting: "rdsutils,pg_stat_statements,rds_casts" },
        ],
      }),
    );
    // Loaded by the server and already collecting, but no CREATE EXTENSION.
    expect(c.extensions.pg_stat_statements).toBe("preloaded-not-created");
    // Available to install, but not loaded and not collecting.
    expect(c.extensions.pgstattuple).toBe("available-not-installed");
  });

  it("reports an extension that is neither installed nor available", async () => {
    const c = await collectCapabilities(
      conn({ pg_extension: [], pg_available_extensions: [], pg_settings: [] }),
    );
    expect(c.extensions.pgaudit).toBe("unavailable");
  });

  it("captures the settings the later dimensions read", async () => {
    const c = await collectCapabilities(
      conn({
        pg_extension: [],
        pg_available_extensions: [],
        pg_settings: [
          { name: "autovacuum", setting: "on" },
          { name: "track_counts", setting: "on" },
          { name: "server_version_num", setting: "150017" },
        ],
      }),
    );
    expect(c.settings.autovacuum).toBe("on");
    expect(c.settings.track_counts).toBe("on");
    expect(c.serverVersionNum).toBe(150017);
  });

  // Task 20 review round 1, Finding 1 (Critical): TRACKED_SETTINGS omitted
  // autovacuum_freeze_max_age, so it was silently dropped by the filter in
  // collectCapabilities below and never reached maintenance.ts's headroom
  // calculation — which then always used the hardcoded default, even on a
  // database where a DBA had tuned the real value down. This test drives the
  // real collectCapabilities (not a hand-built PgCapabilities fixture) so a
  // future regression of TRACKED_SETTINGS is caught here rather than hidden
  // by a fixture that injects the key directly.
  it("carries autovacuum_freeze_max_age through to settings, so maintenance.ts's headroom is computed against the real configured value", async () => {
    const c = await collectCapabilities(
      conn({
        pg_extension: [],
        pg_available_extensions: [],
        pg_settings: [{ name: "autovacuum_freeze_max_age", setting: "150000000" }],
      }),
    );
    expect(c.settings.autovacuum_freeze_max_age).toBe("150000000");
  });
});
