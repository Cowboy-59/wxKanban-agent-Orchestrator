import { describe, expect, it, vi } from "vitest";
import {
  ReadOnlyGuardError,
  buildReadOnlyConnection,
} from "../../_wxAI/skills/wxDBAnalyze/scripts/engines/postgres/connect.js";

function fakeSql(readOnlyReport: string) {
  const executed: string[] = [];
  const sql = Object.assign(
    async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join("?");
      executed.push(text.trim());
      if (text.includes("show default_transaction_read_only")) {
        return [{ default_transaction_read_only: readOnlyReport }];
      }
      return [];
    },
    { end: vi.fn(async () => undefined), unsafe: vi.fn(async () => []) },
  );
  return { sql, executed };
}

function fakeSqlEmptyShow() {
  const executed: string[] = [];
  const sql = Object.assign(
    async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join("?");
      executed.push(text.trim());
      // "show" returns zero rows, so rows[0] is undefined.
      return [];
    },
    { end: vi.fn(async () => undefined), unsafe: vi.fn(async () => []) },
  );
  return { sql, executed };
}

function fakeSqlSetThrows() {
  const executed: string[] = [];
  const sql = Object.assign(
    async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join("?");
      executed.push(text.trim());
      if (text.includes("set default_transaction_read_only")) {
        throw new Error("connection refused");
      }
      return [];
    },
    { end: vi.fn(async () => undefined), unsafe: vi.fn(async () => []) },
  );
  return { sql, executed };
}

describe("buildReadOnlyConnection", () => {
  it("sets and then verifies read-only before returning", async () => {
    const { sql, executed } = fakeSql("on");
    await buildReadOnlyConnection(sql as never);
    expect(executed[0]).toContain("set default_transaction_read_only");
    expect(executed[1]).toContain("show default_transaction_read_only");
  });

  it("refuses the connection when the guard did not take effect", async () => {
    const { sql } = fakeSql("off");
    await expect(buildReadOnlyConnection(sql as never)).rejects.toThrow(
      ReadOnlyGuardError,
    );
  });

  it("closes the connection when it refuses, leaving nothing open", async () => {
    const { sql } = fakeSql("off");
    await expect(buildReadOnlyConnection(sql as never)).rejects.toThrow();
    expect(sql.end).toHaveBeenCalled();
  });

  it("refuses when the verification query returns no rows", async () => {
    const { sql } = fakeSqlEmptyShow();
    await expect(buildReadOnlyConnection(sql as never)).rejects.toThrow(
      ReadOnlyGuardError,
    );
    expect(sql.end).toHaveBeenCalled();
  });

  it("propagates the error when the set statement itself fails, and still closes", async () => {
    const { sql } = fakeSqlSetThrows();
    await expect(buildReadOnlyConnection(sql as never)).rejects.toThrow(
      "connection refused",
    );
    expect(sql.end).toHaveBeenCalled();
  });

  it("issues query() over the extended protocol so multi-statement text cannot execute", async () => {
    const { sql } = fakeSql("on");
    const conn = await buildReadOnlyConnection(sql as never);
    await conn.query("select 1");
    expect(sql.unsafe).toHaveBeenCalledWith("select 1", [], {
      simple: false,
    });
  });
});
