/**
 * SPEC-154 (SCOPE-132 Amendment H) T002 — ProjectAutopilotService rules with an in-memory store:
 * who may change Autopilot (the "Allow remote" rule, reused), the refusal while remote is off, the
 * audited change in the "Allow remote" row shape, the no-op, and the remote-off cascade in the
 * drizzle store's write. No database: the repo .env points at production.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ setValues: [] as Record<string, unknown>[] }));

vi.mock("../../src/db/client.js", () => ({
  db: {
    update: () => ({
      set: (values: Record<string, unknown>) => {
        h.setValues.push(values);
        return { where: async () => undefined };
      },
    }),
  },
}));
vi.mock("../../src/server/services/AutopilotReleaseGate.js", () => ({ AUTOPILOT_RELEASE_GATE_OPEN: true }));

import {
  ProjectAutopilotService,
  type AutopilotProject,
  type AutopilotStore,
} from "../../src/server/services/ProjectAutopilotService.js";
import {
  drizzleRemoteAccessStore,
  projectRemoteAccessService,
} from "../../src/server/services/ProjectRemoteAccessService.js";

// [SCOPE 154 / T002] BEGIN — ProjectAutopilotService unit tests (FR-001)
type AuditEntry = Parameters<AutopilotStore["audit"]>[0];

class MemoryStore implements AutopilotStore {
  projects = new Map<string, AutopilotProject>();
  audits: AuditEntry[] = [];
  writes = 0;
  failAudit = false;

  async project(projectId: string) {
    return this.projects.get(projectId) ?? null;
  }
  async setAutopilotEnabled(projectId: string, enabled: boolean) {
    this.writes++;
    const p = this.projects.get(projectId);
    if (p) p.autopilotenabled = enabled;
  }
  async audit(entry: AuditEntry) {
    if (this.failAudit) throw new Error("audit store down");
    this.audits.push(entry);
  }
}

let store: MemoryStore;
let svc: ProjectAutopilotService;
const P = (allowremote: boolean, autopilotenabled = false): AutopilotProject => ({
  id: "p-1",
  name: "Billing",
  companyid: "c-1",
  allowremote,
  autopilotenabled,
});

beforeEach(() => {
  vi.restoreAllMocks();
  h.setValues = [];
  store = new MemoryStore();
  store.projects.set("p-1", P(true));
  svc = new ProjectAutopilotService(store);
});

describe("canManage (FR-001, SOC 2 CC6.3)", () => {
  it("is exactly ProjectRemoteAccessService.canManage — one rule for both switches", async () => {
    const spy = vi.spyOn(projectRemoteAccessService, "canManage").mockResolvedValue(true);
    const actor = { userid: "tm-on", usertype: "TEAM_MANAGER" };
    expect(await svc.canManage("p-1", actor)).toBe(true);
    expect(spy).toHaveBeenCalledWith("p-1", actor);
    spy.mockResolvedValue(false);
    expect(await svc.canManage("p-1", { userid: "m", usertype: "TEAM_MEMBER" })).toBe(false);
  });
});

describe("setAutopilotEnabled (FR-001, SOC 2 CC7.2)", () => {
  it("a change saves and writes one project.autopilot.enabled row in the Allow-remote row shape", async () => {
    const r = await svc.setAutopilotEnabled((await store.project("p-1"))!, true, "a");
    expect(r).toEqual({ autopilotEnabled: true, changed: true });
    expect(store.projects.get("p-1")!.autopilotenabled).toBe(true);
    expect(store.audits).toEqual([
      {
        companyid: "c-1",
        action: "project.autopilot.enabled",
        changedby: "a",
        previousvalue: { autopilotenabled: false },
        newvalue: { projectid: "p-1", autopilotenabled: true },
        description: 'Autopilot enabled on project "Billing".',
      },
    ]);
  });

  it("switching off writes project.autopilot.disabled", async () => {
    store.projects.set("p-1", P(true, true));
    await svc.setAutopilotEnabled((await store.project("p-1"))!, false, "tm-on");
    expect(store.audits).toHaveLength(1);
    expect(store.audits[0]).toMatchObject({
      action: "project.autopilot.disabled",
      changedby: "tm-on",
      previousvalue: { autopilotenabled: true },
      newvalue: { projectid: "p-1", autopilotenabled: false },
    });
  });

  it("turning it on while Allow remote is off is refused; nothing is written or audited", async () => {
    store.projects.set("p-1", P(false));
    const r = await svc.setAutopilotEnabled((await store.project("p-1"))!, true, "a");
    expect(r).toEqual({ error: "remote_not_allowed" });
    expect(store.writes).toBe(0);
    expect(store.audits).toHaveLength(0);
  });

  it("the same value again changes nothing and writes no audit row", async () => {
    const r = await svc.setAutopilotEnabled((await store.project("p-1"))!, false, "a");
    expect(r).toEqual({ autopilotEnabled: false, changed: false });
    expect(store.writes).toBe(0);
    expect(store.audits).toHaveLength(0);
  });

  it("an audit write failure is logged, never thrown", async () => {
    store.failAudit = true;
    await expect(svc.setAutopilotEnabled((await store.project("p-1"))!, true, "a")).resolves.toEqual({
      autopilotEnabled: true,
      changed: true,
    });
  });

  it("a project with no company is not audited", async () => {
    store.projects.set("p-1", { ...P(true), companyid: null });
    await svc.setAutopilotEnabled((await store.project("p-1"))!, true, "a");
    expect(store.audits).toHaveLength(0);
  });
});

describe("Allow remote off cascades Autopilot off (FR-001)", () => {
  it("disallowing remote writes autopilotenabled: false in the same update", async () => {
    await drizzleRemoteAccessStore.setAllowRemote("p-1", false);
    expect(h.setValues).toHaveLength(1);
    expect(h.setValues[0]).toMatchObject({ allowremote: false, autopilotenabled: false });
  });

  it("allowing remote leaves Autopilot as it was", async () => {
    await drizzleRemoteAccessStore.setAllowRemote("p-1", true);
    expect(h.setValues[0]).toMatchObject({ allowremote: true });
    expect(h.setValues[0]).not.toHaveProperty("autopilotenabled");
  });
});
// [SCOPE 154 / T002] END
