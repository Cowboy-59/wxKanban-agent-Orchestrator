/**
 * SPEC-152 (SCOPE-132 Amendment F) T005, review fix 2026-10-29 — a password change signs out every
 * K.A.I.N. device inside the caller's transaction, and the audit is written after, one row per company.
 * T014 (review #5, 2026-10-30) — every way a device ends also revokes its connect-minted MCP tokens in
 * the same transaction. T015 (review #6) — a device of a deactivated company is refused.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

const h = vi.hoisted(() => ({
  insert: vi.fn(),
  defaultUpdates: [] as string[],
  tx: null as unknown,
  selectFields: [] as string[],
  selectRows: [] as unknown[],
}));

// The repo .env points at production: the default db is a stub that must not be written through.
vi.mock("../../src/db/client.js", () => {
  const chain = {
    from: () => chain,
    innerJoin: () => chain,
    where: () => chain,
    limit: async () => h.selectRows,
  };
  return {
    db: {
      insert: () => ({ values: h.insert }),
      update: (table: Parameters<typeof getTableName>[0]) => {
        h.defaultUpdates.push(getTableName(table));
        return { set: () => ({ where: () => Promise.resolve() }) };
      },
      transaction: async (cb: (tx: unknown) => Promise<unknown>) => cb(h.tx),
      select: (fields: Record<string, unknown>) => {
        h.selectFields = Object.keys(fields);
        return chain;
      },
    },
  };
});
vi.mock("../../src/server/services/KitEncryptionService.js", () => ({
  kitEncryptionService: { generateApiToken: () => "raw", hashToken: (t: string) => `hash:${t}` },
}));

import { agentDeviceTokenService } from "../../src/server/services/AgentDeviceTokenService.js";

// [SCOPE 152 / T014] BEGIN — transaction double for the device-ending paths
const dialect = new PgDialect();

/** A transaction double that records every update: the table, the values set and the rendered WHERE. */
function recorder(results: Record<string, unknown[]>) {
  const calls: { table: string; set: Record<string, unknown>; sql: string; params: unknown[] }[] = [];
  const tx = {
    update: (table: Parameters<typeof getTableName>[0]) => ({
      set: (values: Record<string, unknown>) => ({
        where: (cond: SQL) => {
          const q = dialect.sqlToQuery(cond);
          const name = getTableName(table);
          calls.push({ table: name, set: values, sql: q.sql, params: q.params });
          return { returning: async () => results[name] ?? [] };
        },
      }),
    }),
    insert: () => ({ values: () => ({ returning: async () => [{ id: "new-device" }] }) }),
  };
  return { tx, calls };
}
// [SCOPE 152 / T014] END

beforeEach(() => {
  vi.clearAllMocks();
  h.insert.mockResolvedValue(undefined);
  h.defaultUpdates = [];
  h.selectFields = [];
  h.selectRows = [];
});

// [SCOPE 152 / T005] BEGIN — revoke-all in the caller's transaction (FR-065)
// MODIFIED-BY: [SCOPE 152 / T014] — the recorder double; the MCP-token update is expected after the device update
describe("revokeAllForUser", () => {
  it("revokes through the transaction it is given and writes no audit row itself", async () => {
    const { tx, calls } = recorder({ agentdevicetokens: [{ id: "d1", companyid: "c1" }] });
    const revoked = await agentDeviceTokenService.revokeAllForUser(
      "u1",
      "admin-1",
      "password_changed",
      tx as unknown as Parameters<typeof agentDeviceTokenService.revokeAllForUser>[3],
    );
    expect(revoked).toEqual([{ id: "d1", companyid: "c1" }]);
    expect(calls[0].table).toBe("agentdevicetokens");
    expect(calls[0].set).toMatchObject({ revokedbyid: "admin-1", revokereason: "password_changed" });
    expect(calls[0].set.revokedat).toBeInstanceOf(Date);
    expect(h.defaultUpdates).toEqual([]);
    expect(h.insert).not.toHaveBeenCalled();
  });
});

describe("auditRevokeAll", () => {
  it("writes one agent.device.revoked row per company the devices were issued in", async () => {
    await agentDeviceTokenService.auditRevokeAll("u1", "u1", "password_changed", [
      { id: "d1", companyid: "c1" },
      { id: "d2", companyid: "c2" },
      { id: "d3", companyid: "c1" },
    ]);
    expect(h.insert).toHaveBeenCalledTimes(2);
    expect(h.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        companyid: "c1",
        action: "agent.device.revoked",
        newvalue: { userId: "u1", devices: ["d1", "d3"], reason: "password_changed" },
      }),
    );
    expect(h.insert).toHaveBeenCalledWith(
      expect.objectContaining({ companyid: "c2", newvalue: { userId: "u1", devices: ["d2"], reason: "password_changed" } }),
    );
  });

  it("writes nothing when no device was signed in", async () => {
    await agentDeviceTokenService.auditRevokeAll("u1", "u1", "password_changed", []);
    expect(h.insert).not.toHaveBeenCalled();
  });
});
// [SCOPE 152 / T005] END

// [SCOPE 152 / T014] BEGIN — ending a device revokes its MCP tokens in the same transaction (FR-065)
describe("ending a device ends its MCP tokens", () => {
  it("password change: every signed-out device's MCP tokens, in the caller's transaction", async () => {
    const { tx, calls } = recorder({
      agentdevicetokens: [
        { id: "d1", companyid: "c1" },
        { id: "d2", companyid: "c2" },
      ],
      mcpapitokens: [{ id: "m1" }],
    });
    await agentDeviceTokenService.revokeAllForUser(
      "u1",
      "admin-1",
      "password_changed",
      tx as unknown as Parameters<typeof agentDeviceTokenService.revokeAllForUser>[3],
    );
    expect(calls.map((c) => c.table)).toEqual(["agentdevicetokens", "mcpapitokens"]);
    const mcp = calls[1];
    expect(mcp.set).toMatchObject({ revokedbyid: "admin-1" });
    expect(mcp.set.revokedat).toBeInstanceOf(Date);
    expect(mcp.params).toEqual(expect.arrayContaining(["agent-grant:%:d1", "agent-grant:%:d2"]));
    expect(mcp.sql).toMatch(/"revokedat" is null/);
    expect(h.defaultUpdates).toEqual([]);
  });

  it("password change with no device signed in touches no MCP token", async () => {
    const { tx, calls } = recorder({ agentdevicetokens: [] });
    await agentDeviceTokenService.revokeAllForUser(
      "u1",
      "u1",
      "password_changed",
      tx as unknown as Parameters<typeof agentDeviceTokenService.revokeAllForUser>[3],
    );
    expect(calls.map((c) => c.table)).toEqual(["agentdevicetokens"]);
  });

  it("revoke: the device and its MCP tokens in one transaction", async () => {
    const { tx, calls } = recorder({ agentdevicetokens: [{ id: "d9", companyid: "c1" }] });
    h.tx = tx;
    const row = await agentDeviceTokenService.revoke("d9", "admin-1", "revoked");
    expect(row).toMatchObject({ id: "d9" });
    expect(calls.map((c) => c.table)).toEqual(["agentdevicetokens", "mcpapitokens"]);
    expect(calls[1].params).toContain("agent-grant:%:d9");
    expect(h.defaultUpdates).toEqual([]);
  });

  it("revoke of a device that is not live touches no MCP token", async () => {
    const { tx, calls } = recorder({ agentdevicetokens: [] });
    h.tx = tx;
    expect(await agentDeviceTokenService.revoke("gone", "admin-1", "revoked")).toBeNull();
    expect(calls.map((c) => c.table)).toEqual(["agentdevicetokens"]);
  });

  it("signing in again under the same device name ends the replaced device's MCP tokens", async () => {
    const { tx, calls } = recorder({ agentdevicetokens: [{ id: "old-device" }] });
    h.tx = tx;
    const issued = await agentDeviceTokenService.issue("u1", "c1", "Phone");
    expect(issued).toEqual({ token: "kdt_raw", deviceId: "new-device" });
    expect(calls.map((c) => c.table)).toEqual(["agentdevicetokens", "mcpapitokens"]);
    expect(calls[0].set).toMatchObject({ revokereason: "replaced" });
    expect(calls[1].params).toContain("agent-grant:%:old-device");
  });

  it("a first sign-in on a device name touches no MCP token", async () => {
    const { tx, calls } = recorder({ agentdevicetokens: [] });
    h.tx = tx;
    await agentDeviceTokenService.issue("u1", "c1", "Laptop");
    expect(calls.map((c) => c.table)).toEqual(["agentdevicetokens"]);
  });
});
// [SCOPE 152 / T014] END

// [SCOPE 152 / T015] BEGIN — a device of a deactivated company is refused (FR-065, FR-070)
describe("verify and the device's company", () => {
  const live = { deviceId: "d1", deviceName: "Phone", userId: "u1", companyId: "c1", personActive: true, personCompanyId: "c1" };

  it("refuses a device whose company is deactivated, with the same null as any refusal", async () => {
    h.selectRows = [{ ...live, companyActive: false }];
    expect(await agentDeviceTokenService.verify("kdt_raw")).toBeNull();
    expect(h.selectFields).toContain("companyActive");
    expect(h.defaultUpdates).toEqual([]); // no lastusedat bump for a refused device
  });

  it("accepts the same device while its company is active", async () => {
    h.selectRows = [{ ...live, companyActive: true }];
    expect(await agentDeviceTokenService.verify("kdt_raw")).toEqual({
      deviceId: "d1",
      deviceName: "Phone",
      userId: "u1",
      companyId: "c1",
    });
    expect(h.defaultUpdates).toEqual(["agentdevicetokens"]);
  });
});
// [SCOPE 152 / T015] END
