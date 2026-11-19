import { describe, it, expect } from "vitest";
import {
  mcpapitokens,
  mcprequestaudit,
  MCP_AUDIT_OUTCOMES,
} from "../../src/db/schema/index.js";

type DrizzleColumn = {
  name: string;
  columnType: string;
  notNull: boolean;
  hasDefault: boolean;
};

const getColumns = (table: unknown): Record<string, DrizzleColumn> => {
  const columns: Record<string, DrizzleColumn> = {};
  if (typeof table !== "object" || table === null) return columns;
  for (const [key, value] of Object.entries(table)) {
    if (
      typeof value === "object" &&
      value !== null &&
      "columnType" in value &&
      !key.startsWith("_")
    ) {
      columns[key] = value as DrizzleColumn;
    }
  }
  return columns;
};

describe("Spec 028 — mcpapitokens schema (T001)", () => {
  const cols = getColumns(mcpapitokens);

  it("declares all 13 required columns", () => {
    const required = [
      "id",
      "customerid",
      "projectid",
      "tokenhash",
      "tokenprefix",
      "name",
      "issuedbyid",
      "issuedat",
      "expiresat",
      "revokedat",
      "revokedbyid",
      "lastusedat",
      "createdat",
    ];
    for (const c of required) {
      expect(cols[c], `missing column ${c}`).toBeDefined();
    }
  });

  it("primary key id is uuid with default", () => {
    expect(cols["id"]?.columnType).toMatch(/PgUUID/);
    expect(cols["id"]?.hasDefault).toBe(true);
  });

  it("required scope/identity columns are NOT NULL", () => {
    for (const c of [
      "customerid",
      "projectid",
      "tokenhash",
      "tokenprefix",
      "name",
      "issuedbyid",
      "issuedat",
      "createdat",
    ]) {
      expect(cols[c]?.notNull, `${c} must be NOT NULL`).toBe(true);
    }
  });

  it("optional lifecycle columns are nullable", () => {
    for (const c of ["expiresat", "revokedat", "revokedbyid", "lastusedat"]) {
      expect(cols[c]?.notNull, `${c} must be nullable`).toBe(false);
    }
  });

  it("issuedat and createdat have now() defaults", () => {
    expect(cols["issuedat"]?.hasDefault).toBe(true);
    expect(cols["createdat"]?.hasDefault).toBe(true);
  });

  it("hash + prefix + name are text", () => {
    expect(cols["tokenhash"]?.columnType).toMatch(/PgText/);
    expect(cols["tokenprefix"]?.columnType).toMatch(/PgText/);
    expect(cols["name"]?.columnType).toMatch(/PgText/);
  });

});

describe("Spec 028 — mcprequestaudit schema (T002)", () => {
  const cols = getColumns(mcprequestaudit);

  it("declares all 14 required columns", () => {
    const required = [
      "id",
      "requestid",
      "tokenid",
      "customerid",
      "projectid",
      "tool",
      "methodpath",
      "durationms",
      "outcome",
      "errorcode",
      "responsestatus",
      "clientip",
      "useragent",
      "createdat",
    ];
    for (const c of required) {
      expect(cols[c], `missing column ${c}`).toBeDefined();
    }
  });

  it("required columns are NOT NULL", () => {
    for (const c of [
      "id",
      "requestid",
      "methodpath",
      "durationms",
      "outcome",
      "responsestatus",
      "createdat",
    ]) {
      expect(cols[c]?.notNull, `${c} must be NOT NULL`).toBe(true);
    }
  });

  it("optional/nullable columns per FR-008", () => {
    for (const c of [
      "tokenid",
      "customerid",
      "projectid",
      "tool",
      "errorcode",
      "clientip",
      "useragent",
    ]) {
      expect(cols[c]?.notNull, `${c} must be nullable`).toBe(false);
    }
  });

  it("durationms and responsestatus are integer", () => {
    expect(cols["durationms"]?.columnType).toMatch(/PgInteger/);
    expect(cols["responsestatus"]?.columnType).toMatch(/PgInteger/);
  });

});

describe("Spec 028 — outcome vocabulary (FR-008)", () => {
  it("exports the canonical 5 outcomes", () => {
    expect(MCP_AUDIT_OUTCOMES).toEqual([
      "success",
      "auth-failed",
      "throttled",
      "scope-violation",
      "error",
    ]);
  });
});
