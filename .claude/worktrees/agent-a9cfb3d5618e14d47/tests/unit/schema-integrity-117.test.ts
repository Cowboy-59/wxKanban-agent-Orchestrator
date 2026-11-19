/**
 * SCOPE 117 — Production Schema Integrity
 *
 * Covers FR-002 (sentinel rejected at the request boundary) and FR-003
 * (Postgres error cause preserved in logs).
 */

import { describe, it, expect } from "vitest";
import { parseUuidFilter, parseRequiredUuid } from "~/server/lib/queryParams.js";
import { serializeDbError } from "~/server/lib/dbError.js";

describe("FR-002 — projectid boundary parsing", () => {
  const VALID = "019f2aed-e170-708c-9915-9a1e426e8e62";

  it('treats the "all" sentinel as no-filter rather than a uuid', () => {
    const result = parseUuidFilter("all", "projectid");
    expect(result).toEqual({ ok: true, value: undefined });
  });

  it("treats the sentinel case-insensitively and ignores surrounding space", () => {
    expect(parseUuidFilter("ALL", "projectid")).toEqual({ ok: true, value: undefined });
    expect(parseUuidFilter("  all  ", "projectid")).toEqual({ ok: true, value: undefined });
  });

  it("passes a well-formed uuid through unchanged", () => {
    expect(parseUuidFilter(VALID, "projectid")).toEqual({ ok: true, value: VALID });
  });

  it("treats an absent parameter as no-filter", () => {
    expect(parseUuidFilter(undefined, "projectid")).toEqual({ ok: true, value: undefined });
  });

  it("rejects a malformed value instead of letting it reach a uuid column", () => {
    // This is the 22P02 class: previously these reached Postgres and produced a 500.
    for (const bad of ["../", "xyz", "1", "'; drop table users; --"]) {
      const result = parseUuidFilter(bad, "projectid");
      expect(result.ok, `expected ${bad} to be rejected`).toBe(false);
    }
  });

  it("rejects repeated query parameters that arrive as an array", () => {
    expect(parseUuidFilter([VALID, VALID], "projectid").ok).toBe(false);
  });

  it("requires a value when the parameter is mandatory", () => {
    expect(parseRequiredUuid(undefined, "projectId").ok).toBe(false);
    expect(parseRequiredUuid("", "projectId").ok).toBe(false);
    // Sentinels are NOT a valid stand-in for a required id.
    expect(parseRequiredUuid("all", "projectId").ok).toBe(false);
    expect(parseRequiredUuid(VALID, "projectId")).toEqual({ ok: true, value: VALID });
  });
});

describe("FR-003 — database error cause preserved", () => {
  it("extracts the Postgres code from a Drizzle-wrapped error", () => {
    // Shape produced by Drizzle 0.45: the wrapper message is always the SQL,
    // and the real PostgresError sits on .cause.
    const pgError = Object.assign(new Error('relation "complianceflags" does not exist'), {
      code: "42P01",
      severity: "ERROR",
      routine: "parserOpenTable",
    });
    const wrapped = Object.assign(
      new Error("Failed query: select ... from complianceflags"),
      { cause: pgError },
    );

    const out = serializeDbError(wrapped);
    expect(out.code).toBe("42P01");
    expect(out.severity).toBe("ERROR");
    expect(out.routine).toBe("parserOpenTable");
    expect(out.detail).toContain("complianceflags");
  });

  it("extracts 22P02 from the uuid-sentinel failure", () => {
    const pgError = Object.assign(new Error('invalid input syntax for type uuid: "all"'), {
      code: "22P02",
    });
    const wrapped = Object.assign(new Error("Failed query: select ..."), { cause: pgError });
    expect(serializeDbError(wrapped).code).toBe("22P02");
  });

  it("falls back cleanly when the error has no cause", () => {
    const out = serializeDbError(new Error("plain failure"));
    expect(out.message).toBe("plain failure");
    expect(out.code).toBeUndefined();
  });

  it("handles non-Error throwables without crashing the logger", () => {
    expect(serializeDbError("string throw").message).toBe("string throw");
    expect(serializeDbError(undefined).message).toBe("Unknown error");
  });

  it("does not emit bound parameter values", () => {
    // Bound params can carry customer data; the SQLSTATE plus relation is enough.
    const pgError = Object.assign(new Error("boom"), { code: "42P01" });
    const wrapped = Object.assign(
      new Error('Failed query: select ...\nparams: secret@example.com,019f2aed'),
      { cause: pgError },
    );
    const serialized = JSON.stringify(serializeDbError(wrapped));
    expect(serialized).not.toContain("secret@example.com");
  });

  it("serializes to single-line JSON", () => {
    const pgError = Object.assign(new Error("boom"), { code: "42P01" });
    const wrapped = Object.assign(new Error("Failed query"), { cause: pgError });
    const line = JSON.stringify(serializeDbError(wrapped));
    expect(line.includes("\n")).toBe(false);
  });
});

describe("FR-005 — schema drift comparison", () => {
  it("reports declared-but-missing as defects", async () => {
    const { compareSchemas } = await import(
      "../../wxkanban-agent/core/orchestrator/schema-drift.js"
    );
    const declared = new Map([
      ["complianceflags", ["app"]],
      ["projecttasks", ["app"]],
    ]);
    const deployed = new Set(["projecttasks"]);
    const { missing, orphans } = compareSchemas(declared, deployed);
    expect(missing).toEqual(["complianceflags"]);
    expect(orphans).toEqual([]);
  });

  it("reports deployed-but-undeclared as orphans, never as missing", async () => {
    const { compareSchemas } = await import(
      "../../wxkanban-agent/core/orchestrator/schema-drift.js"
    );
    const declared = new Map([["projecttasks", ["app"]]]);
    const deployed = new Set(["projecttasks", "marketingcontacts", "sockettrace"]);
    const { missing, orphans } = compareSchemas(declared, deployed);
    expect(missing).toEqual([]);
    // Orphans are informational. An undeclared table may still be live —
    // marketingcontacts holds 1006 rows and is queried by raw SQL.
    expect(orphans).toEqual(["marketingcontacts", "sockettrace"]);
  });

  it("treats a table declared by either schema source as declared", async () => {
    const { compareSchemas } = await import(
      "../../wxkanban-agent/core/orchestrator/schema-drift.js"
    );
    // capabilityindex is MCP-declared. Reading only the app schema would
    // wrongly report it as an orphan.
    const declared = new Map([["capabilityindex", ["mcp"]]]);
    const deployed = new Set(["capabilityindex"]);
    const { missing, orphans } = compareSchemas(declared, deployed);
    expect(missing).toEqual([]);
    expect(orphans).toEqual([]);
  });

  it("returns both lists sorted for stable CI output", async () => {
    const { compareSchemas } = await import(
      "../../wxkanban-agent/core/orchestrator/schema-drift.js"
    );
    const declared = new Map([["zeta", ["app"]], ["alpha", ["app"]]]);
    const { missing } = compareSchemas(declared, new Set());
    expect(missing).toEqual(["alpha", "zeta"]);
  });
});
