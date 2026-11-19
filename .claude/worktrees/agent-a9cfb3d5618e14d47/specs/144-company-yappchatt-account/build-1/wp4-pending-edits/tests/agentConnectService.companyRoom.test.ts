/**
 * SPEC-144 (SCOPE-144) T008 — AgentConnectService delegates both connect paths' rooms to
 * the company account rules. PENDING: applies once the hook-gated AgentConnectService
 * edit is approved. The db is a chain stub; nothing reaches Postgres or YappChatt.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  selectResults: [] as unknown[][],
  transaction: vi.fn(),
  ensureCompanyRoom: vi.fn(),
}));

vi.mock("../../src/db/client.js", () => {
  const chain = (): Record<string, unknown> => {
    const c: Record<string, unknown> = {};
    for (const k of ["from", "innerJoin", "where"]) c[k] = () => c;
    c.limit = async () => h.selectResults.shift() ?? [];
    return c;
  };
  return { db: { select: () => chain(), transaction: h.transaction } };
});
vi.mock("../../src/server/services/KitEncryptionService.js", () => ({
  kitEncryptionService: { generateApiToken: () => "tok_abcdefghijklmnop", hashToken: () => "hash" },
}));
vi.mock("../../src/server/services/ProjectAgentGrantService.js", () => ({ projectAgentGrantService: {} }));
vi.mock("../../src/server/services/CompanyYappchattService.js", () => {
  class CompanyYappchattError extends Error {
    constructor(
      readonly code: string,
      readonly status: number,
      message: string,
      readonly extra: Record<string, string | null> = {},
    ) {
      super(message);
    }
  }
  return { CompanyYappchattError, companyYappchattService: { ensureCompanyRoom: h.ensureCompanyRoom } };
});

import { AgentConnectService, AgentConnectError } from "../../src/server/services/AgentConnectService.js";
import { CompanyYappchattError } from "../../src/server/services/CompanyYappchattService.js";

// [SCOPE 144 / T008] BEGIN — AgentConnectService company room tests
const svc = new AgentConnectService();
const TOKEN = { projectid: "p-1", customerid: "c-1", issuedbyid: "u-1", name: "Kit", expiresat: null };
const TICKET = { id: "t1", companyid: "c-1", agentname: "KAIN" } as unknown as Parameters<AgentConnectService["connect"]>[0];

beforeEach(() => {
  vi.clearAllMocks();
  h.selectResults = [];
  h.transaction.mockResolvedValue(undefined);
});

describe("projectAgentRoom", () => {
  it("passes the project's company, the token issuer and createCompanyAccount to the room rules", async () => {
    h.selectResults = [[{ name: "Billing", companyid: "c-9" }], [{ email: "dev@acme.com" }]];
    h.ensureCompanyRoom.mockResolvedValue({ conversationId: "r-1", minted: false, operatorEmail: "dev@acme.com", ownerYappchattId: "y-co" });
    const r = await svc.projectAgentRoom(TOKEN, "KAIN", { createCompanyAccount: true });
    expect(h.ensureCompanyRoom).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: "c-9", projectId: "p-1", projectName: "Billing", agentName: "KAIN", actorUserId: "u-1", createCompanyAccount: true }),
    );
    expect(r.room).toMatchObject({ conversationId: "r-1", ownerYappchattId: "y-co" });
  });

  it("no company account → AgentConnectError 409 with contactEmail, and no MCP token minted", async () => {
    h.selectResults = [[{ name: "Billing", companyid: "c-1" }], [{ email: "dev@acme.com" }]];
    h.ensureCompanyRoom.mockRejectedValue(new CompanyYappchattError("no_company_account", 409, "x", { contactEmail: "info@acme.com" }));
    const err = await svc.projectAgentRoom(TOKEN, "KAIN").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AgentConnectError);
    expect(err).toMatchObject({ code: "no_company_account", status: 409, extra: { contactEmail: "info@acme.com" } });
    expect(h.transaction).not.toHaveBeenCalled();
  });
});

describe("connect (KAIN)", () => {
  it("resolves the room BEFORE minting the MCP token, so a refusal revokes nothing", async () => {
    h.selectResults = [[{ grantedbyid: "u-2", projectName: "Billing" }], [{ email: "ops@acme.com" }]];
    h.ensureCompanyRoom.mockRejectedValue(new CompanyYappchattError("no_company_account", 409, "x", { contactEmail: "info@acme.com" }));
    await expect(svc.connect(TICKET, "p-1")).rejects.toMatchObject({ code: "no_company_account" });
    expect(h.transaction).not.toHaveBeenCalled();
    expect(h.ensureCompanyRoom).toHaveBeenCalledWith(expect.objectContaining({ companyId: "c-1", actorUserId: "u-2" }));
  });

  it("mints the MCP token after a room is resolved", async () => {
    h.selectResults = [[{ grantedbyid: "u-2", projectName: "Billing" }], [{ email: "ops@acme.com" }]];
    h.ensureCompanyRoom.mockResolvedValue({ conversationId: "r-1", minted: false, operatorEmail: "ops@acme.com", ownerYappchattId: "y-co" });
    const r = await svc.connect(TICKET, "p-1");
    expect(h.transaction).toHaveBeenCalledTimes(1);
    expect(r.room.conversationId).toBe("r-1");
  });
});
// [SCOPE 144 / T008] END
