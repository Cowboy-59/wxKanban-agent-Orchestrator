/**
 * SPEC-144 (SCOPE-144) T008 — AgentConnectService delegates both connect paths' rooms to
 * the company account rules. The db is a chain stub; nothing reaches Postgres or YappChatt.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  selectResults: [] as unknown[][],
  transaction: vi.fn(),
  ensureCompanyRoom: vi.fn(),
  recordRefused: vi.fn(),
  findInAgentReach: vi.fn(),
  recordAgentAudit: vi.fn(),
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
// [SCOPE 152 / T006] Reach and the audit row are their own modules; connect only consumes them.
vi.mock("../../src/server/lib/agentReach.js", () => ({
  agentReach: vi.fn(),
  findInAgentReach: h.findInAgentReach,
}));
vi.mock("../../src/server/services/AgentDeviceTokenService.js", () => ({ recordAgentAudit: h.recordAgentAudit }));
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
vi.mock("../../src/server/services/ProjectRemoteAccessService.js", () => ({
  projectRemoteAccessService: { recordRefused: h.recordRefused },
}));

import { AgentConnectService, AgentConnectError } from "../../src/server/services/AgentConnectService.js";
import { CompanyYappchattError } from "../../src/server/services/CompanyYappchattService.js";

// [SCOPE 144 / T008] BEGIN — AgentConnectService company room tests
const svc = new AgentConnectService();
const TOKEN = { projectid: "p-1", customerid: "c-1", issuedbyid: "u-1", name: "Kit", expiresat: null };
// MODIFIED-BY: [SCOPE 152 / T006] — connect takes the signed-in device; reach comes from agentReach
const DEVICE = { deviceId: "d-1", deviceName: "Phone", userId: "u-2", companyId: "c-own" };
const REACHED = {
  projectId: "p-1",
  projectName: "Billing",
  companyId: "c-1",
  companyName: "Client Co",
  via: "engagement" as const,
  engagementId: "e-1",
};

beforeEach(() => {
  vi.clearAllMocks();
  h.selectResults = [];
  h.transaction.mockResolvedValue(undefined);
});

describe("projectAgentRoom", () => {
  it("passes the project's company, the token issuer and createCompanyAccount to the room rules", async () => {
    h.selectResults = [[{ name: "Billing", companyid: "c-9", allowremote: true }], [{ email: "dev@acme.com" }]];
    h.ensureCompanyRoom.mockResolvedValue({ conversationId: "r-1", minted: false, operatorEmail: "dev@acme.com", ownerYappchattId: "y-co" });
    const r = await svc.projectAgentRoom(TOKEN, "KAIN", { createCompanyAccount: true });
    expect(h.ensureCompanyRoom).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: "c-9", projectId: "p-1", projectName: "Billing", agentName: "KAIN", actorUserId: "u-1", createCompanyAccount: true }),
    );
    expect(r.room).toMatchObject({ conversationId: "r-1", ownerYappchattId: "y-co" });
  });

  it("no company account → AgentConnectError 409 with contactEmail, and no MCP token minted", async () => {
    h.selectResults = [[{ name: "Billing", companyid: "c-1", allowremote: true }], [{ email: "dev@acme.com" }]];
    h.ensureCompanyRoom.mockRejectedValue(new CompanyYappchattError("no_company_account", 409, "x", { contactEmail: "info@acme.com" }));
    const err = await svc.projectAgentRoom(TOKEN, "KAIN").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AgentConnectError);
    expect(err).toMatchObject({ code: "no_company_account", status: 409, extra: { contactEmail: "info@acme.com" } });
    expect(h.transaction).not.toHaveBeenCalled();
  });
});

// [SCOPE 145 / T003] BEGIN — remote_not_allowed refusal tests (FR-003)
describe("projectAgentRoom when the project does not allow remote (SPEC-145 FR-003)", () => {
  it("refuses 403 remote_not_allowed before any room or token work, and records the refusal", async () => {
    h.selectResults = [[{ name: "Billing", companyid: "c-9", allowremote: false }], [{ email: "dev@acme.com" }]];
    const err = await svc.projectAgentRoom(TOKEN, "KAIN").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AgentConnectError);
    expect(err).toMatchObject({ code: "remote_not_allowed", status: 403 });
    expect(h.ensureCompanyRoom).not.toHaveBeenCalled();
    expect(h.transaction).not.toHaveBeenCalled();
    expect(h.recordRefused).toHaveBeenCalledTimes(1);
    expect(h.recordRefused).toHaveBeenCalledWith(
      expect.objectContaining({ id: "p-1", name: "Billing", companyid: "c-9" }),
      "u-1",
    );
    // The operator lookup never ran: the second queued select result is still there.
    expect(h.selectResults).toHaveLength(1);
  });

  it("an allowed project records no refusal", async () => {
    h.selectResults = [[{ name: "Billing", companyid: "c-9", allowremote: true }], [{ email: "dev@acme.com" }]];
    h.ensureCompanyRoom.mockResolvedValue({ conversationId: "r-1", minted: false, operatorEmail: "dev@acme.com", ownerYappchattId: "y-co" });
    await svc.projectAgentRoom(TOKEN, "KAIN");
    expect(h.recordRefused).not.toHaveBeenCalled();
  });
});
// [SCOPE 145 / T003] END

describe("connect (KAIN)", () => {
  beforeEach(() => {
    h.findInAgentReach.mockResolvedValue(REACHED);
  });

  it("resolves the room BEFORE minting the MCP token, so a refusal revokes nothing", async () => {
    h.selectResults = [[{ email: "ops@acme.com" }]];
    h.ensureCompanyRoom.mockRejectedValue(new CompanyYappchattError("no_company_account", 409, "x", { contactEmail: "info@acme.com" }));
    await expect(svc.connect(DEVICE, "p-1")).rejects.toMatchObject({ code: "no_company_account" });
    expect(h.transaction).not.toHaveBeenCalled();
    // The room belongs to the Project's company, joined as the signed-in person (SPEC-152 OQ-1, FR-068).
    expect(h.ensureCompanyRoom).toHaveBeenCalledWith(expect.objectContaining({ companyId: "c-1", actorUserId: "u-2" }));
  });

  it("mints the MCP token after a room is resolved, and audits agent.connect under the Project's company", async () => {
    h.selectResults = [[{ email: "ops@acme.com" }]];
    h.ensureCompanyRoom.mockResolvedValue({ conversationId: "r-1", minted: false, operatorEmail: "ops@acme.com", ownerYappchattId: "y-co" });
    const r = await svc.connect(DEVICE, "p-1");
    expect(h.findInAgentReach).toHaveBeenCalledWith("u-2", "p-1");
    expect(h.transaction).toHaveBeenCalledTimes(1);
    expect(r.room.conversationId).toBe("r-1");
    expect(h.recordAgentAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "agent.connect",
        companyid: "c-1",
        changedby: "u-2",
        newvalue: expect.objectContaining({ deviceId: "d-1", via: "engagement" }),
      }),
    );
  });

  // [SCOPE 152 / T006] FR-070: out of reach is one answer, and nothing is created, minted or revoked.
  it("a Project outside the person's reach → 404 not_granted with no room and no token", async () => {
    h.findInAgentReach.mockResolvedValue(null);
    await expect(svc.connect(DEVICE, "p-1")).rejects.toMatchObject({ code: "not_granted", status: 404 });
    expect(h.ensureCompanyRoom).not.toHaveBeenCalled();
    expect(h.transaction).not.toHaveBeenCalled();
    expect(h.recordAgentAudit).not.toHaveBeenCalled();
  });
});
// [SCOPE 144 / T008] END

// [SCOPE 152 / T014] BEGIN — the device service revokes by the name connect mints (FR-065, FR-068)
describe("device MCP token names", () => {
  it("the prefix the device service revokes by is the one connect mints with", async () => {
    const { AGENT_GRANT_TOKEN_PREFIX } = await import("../../src/server/services/AgentConnectService.js");
    const real = await vi.importActual<typeof import("../../src/server/services/AgentDeviceTokenService.js")>(
      "../../src/server/services/AgentDeviceTokenService.js",
    );
    expect(real.DEVICE_MCP_TOKEN_PREFIX).toBe(AGENT_GRANT_TOKEN_PREFIX);
  });
});
// [SCOPE 152 / T014] END
