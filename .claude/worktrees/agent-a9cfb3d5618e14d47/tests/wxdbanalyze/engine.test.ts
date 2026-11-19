import { describe, expect, it } from "vitest";
import { resolveEngine } from "../../_wxAI/skills/wxDBAnalyze/scripts/core/engine.js";
import {
  AdapterNotImplementedError,
  createRefusingAdapter,
} from "../../_wxAI/skills/wxDBAnalyze/scripts/engines/stub.js";
// [SCOPE 121 / T014] BEGIN — Registry test import
import { adapterFor } from "../../_wxAI/skills/wxDBAnalyze/scripts/engines/registry.js";
// [SCOPE 121 / T014] END

describe("resolveEngine", () => {
  it("prefers an explicit engine over the url", () => {
    expect(
      resolveEngine({ explicit: "mssql", url: "postgres://h/db" }),
    ).toBe("mssql");
  });

  it.each([
    ["postgres://h/db", "postgres"],
    ["postgresql://h/db", "postgres"],
    ["mssql://h/db", "mssql"],
    ["sqlserver://h/db", "mssql"],
    ["mysql://h/db", "mysql"],
    ["mariadb://h/db", "mysql"],
    ["oracle://h/db", "oracle"],
    ["firebird://h/db", "firebird"],
  ])("derives %s from the url scheme", (url, expected) => {
    expect(resolveEngine({ url })).toBe(expected);
  });

  it("falls back to the declared project stack", () => {
    expect(resolveEngine({ projectStack: "PostgreSQL 15" })).toBe("postgres");
  });

  it("throws rather than guessing when nothing identifies the engine", () => {
    expect(() => resolveEngine({})).toThrow(/cannot determine the database engine/i);
  });

  it("throws on an unrecognised explicit engine", () => {
    expect(() => resolveEngine({ explicit: "sqlite" })).toThrow(/sqlite/);
  });
});

describe("createRefusingAdapter", () => {
  it("reports every dimension as not-implemented", () => {
    const adapter = createRefusingAdapter("firebird");
    expect(adapter.supports("schema")).toBe("not-implemented");
    expect(adapter.supports("integrity")).toBe("not-implemented");
  });

  it("refuses to connect", async () => {
    const adapter = createRefusingAdapter("oracle");
    await expect(adapter.connect("oracle://h/db")).rejects.toThrow(
      AdapterNotImplementedError,
    );
  });

  it("names the engine in the refusal so the message is actionable", async () => {
    const adapter = createRefusingAdapter("mysql");
    await expect(adapter.connect("mysql://h/db")).rejects.toThrow(
      /mysql adapter is not implemented/i,
    );
  });

  it("exposes an empty additive whitelist, so nothing can be applied", () => {
    expect(createRefusingAdapter("mssql").additiveWhitelist()).toEqual([]);
  });
});

// [SCOPE 121 / T014] BEGIN — Registry tests
describe("adapterFor", () => {
  it("returns the real adapter for postgres", () => {
    expect(adapterFor("postgres").supports("schema")).toBe("full");
  });

  it("returns a refusing adapter for every unimplemented engine", () => {
    for (const engine of ["mssql", "mysql", "oracle", "firebird"] as const) {
      expect(adapterFor(engine).supports("schema")).toBe("not-implemented");
    }
  });

  it("reports Phase 2 dimensions as not-implemented even on postgres", () => {
    expect(adapterFor("postgres").supports("conventions")).toBe("not-implemented");
  });
});
// [SCOPE 121 / T014] END

// [SCOPE 121 / T022] BEGIN — Batch A support-map coverage
describe("postgres adapter support map (Batch A)", () => {
  it("reports all five Batch A dimensions as full", () => {
    const adapter = adapterFor("postgres");
    for (const dimension of ["schema", "integrity", "data", "performance", "maintenance"] as const) {
      expect(adapter.supports(dimension)).toBe("full");
    }
  });

  it("still reports the four Batch B dimensions as not-implemented", () => {
    const adapter = adapterFor("postgres");
    for (const dimension of ["conventions", "security", "availability", "impact"] as const) {
      expect(adapter.supports(dimension)).toBe("not-implemented");
    }
  });
});
// [SCOPE 121 / T022] END
