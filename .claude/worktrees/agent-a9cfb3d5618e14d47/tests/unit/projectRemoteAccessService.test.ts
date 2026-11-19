/**
 * SPEC-145 (SCOPE-132 Amendment B) T002, T003 — ProjectRemoteAccessService rules with an
 * in-memory store: who may change "Allow remote", the audited change, the no-op, and the
 * refused-start row. No database: the repo .env points at production.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/db/client.js", () => ({ db: {} }));

import {
  ProjectRemoteAccessService,
  type RemoteAccessAuditEntry,
  type RemoteAccessProject,
  type RemoteAccessStore,
} from "../../src/server/services/ProjectRemoteAccessService.js";

// [SCOPE 145 / T002] BEGIN — ProjectRemoteAccessService unit tests
type AuditEntry = RemoteAccessAuditEntry;

class MemoryStore implements RemoteAccessStore {
  projects = new Map<string, RemoteAccessProject>();
  members = new Set<string>(); // `${projectId}:${userid}`
  audits: AuditEntry[] = [];
  writes = 0;
  failAudit = false;

  async project(projectId: string) {
    return this.projects.get(projectId) ?? null;
  }
  async setAllowRemote(projectId: string, allow: boolean) {
    this.writes++;
    const p = this.projects.get(projectId);
    if (p) p.allowremote = allow;
  }
  async isCurrentProjectMember(projectId: string, userid: string) {
    return this.members.has(`${projectId}:${userid}`);
  }
  async audit(entry: AuditEntry) {
    if (this.failAudit) throw new Error("audit store down");
    this.audits.push(entry);
  }
}

let store: MemoryStore;
let svc: ProjectRemoteAccessService;
const P = (allowremote = false): RemoteAccessProject => ({ id: "p-1", name: "Billing", companyid: "c-1", allowremote });

beforeEach(() => {
  store = new MemoryStore();
  store.projects.set("p-1", P());
  store.members.add("p-1:tm-on");
  svc = new ProjectRemoteAccessService(store);
});

describe("canManage (FR-002, SOC 2 CC6.3)", () => {
  it("a company ADMIN may", async () => {
    expect(await svc.canManage("p-1", { userid: "a", usertype: "ADMIN" })).toBe(true);
  });
  it("a TEAM_MANAGER on the project may", async () => {
    expect(await svc.canManage("p-1", { userid: "tm-on", usertype: "TEAM_MANAGER" })).toBe(true);
  });
  it("a TEAM_MANAGER not on the project may not", async () => {
    expect(await svc.canManage("p-1", { userid: "tm-off", usertype: "TEAM_MANAGER" })).toBe(false);
  });
  it("a TEAM_MEMBER on the project may not", async () => {
    store.members.add("p-1:mem");
    expect(await svc.canManage("p-1", { userid: "mem", usertype: "TEAM_MEMBER" })).toBe(false);
  });
  it("no usertype may not", async () => {
    expect(await svc.canManage("p-1", { userid: "x", usertype: undefined })).toBe(false);
  });
});

describe("setAllowRemote (FR-002, SOC 2 CC7.2)", () => {
  it("a change saves and writes one project.remote.allowed row naming the actor, old and new value", async () => {
    const r = await svc.setAllowRemote((await store.project("p-1"))!, true, "a");
    expect(r).toEqual({ allowRemote: true, changed: true });
    expect(store.projects.get("p-1")!.allowremote).toBe(true);
    expect(store.audits).toHaveLength(1);
    expect(store.audits[0]).toMatchObject({
      companyid: "c-1",
      action: "project.remote.allowed",
      changedby: "a",
      previousvalue: { allowremote: false },
      newvalue: { projectid: "p-1", allowremote: true },
    });
  });

  it("switching off writes project.remote.disallowed", async () => {
    store.projects.set("p-1", P(true));
    await svc.setAllowRemote((await store.project("p-1"))!, false, "tm-on");
    expect(store.audits[0]).toMatchObject({ action: "project.remote.disallowed", changedby: "tm-on" });
  });

  it("the same value again changes nothing and writes no audit row", async () => {
    const r = await svc.setAllowRemote((await store.project("p-1"))!, false, "a");
    expect(r).toEqual({ allowRemote: false, changed: false });
    expect(store.writes).toBe(0);
    expect(store.audits).toHaveLength(0);
  });

  it("an audit write failure is logged, never thrown", async () => {
    store.failAudit = true;
    await expect(svc.setAllowRemote((await store.project("p-1"))!, true, "a")).resolves.toEqual({ allowRemote: true, changed: true });
  });
});

// [SCOPE 154 / T002] BEGIN — Autopilot cascade audit (SPEC-154 FR-001)
describe("setAllowRemote off cascades Autopilot off (SPEC-154 FR-001)", () => {
  it("writes the remote.disallowed row, then a project.autopilot.disabled row, in that order", async () => {
    store.projects.set("p-1", { ...P(true), autopilotenabled: true });
    await svc.setAllowRemote((await store.project("p-1"))!, false, "tm-on");
    expect(store.audits).toHaveLength(2);
    expect(store.audits[0]).toMatchObject({
      action: "project.remote.disallowed",
      changedby: "tm-on",
      previousvalue: { allowremote: true },
      newvalue: { projectid: "p-1", allowremote: false },
    });
    expect(store.audits[1]).toEqual({
      companyid: "c-1",
      action: "project.autopilot.disabled",
      changedby: "tm-on",
      previousvalue: { autopilotenabled: true },
      newvalue: { projectid: "p-1", autopilotenabled: false },
      description: 'Autopilot disabled on project "Billing" because remote was disallowed.',
    });
  });

  it("writes only the remote row when Autopilot was already off", async () => {
    store.projects.set("p-1", { ...P(true), autopilotenabled: false });
    await svc.setAllowRemote((await store.project("p-1"))!, false, "a");
    expect(store.audits.map((a) => a.action)).toEqual(["project.remote.disallowed"]);
  });

  it("allowing remote never writes an Autopilot row", async () => {
    store.projects.set("p-1", { ...P(false), autopilotenabled: true });
    await svc.setAllowRemote((await store.project("p-1"))!, true, "a");
    expect(store.audits.map((a) => a.action)).toEqual(["project.remote.allowed"]);
  });
});
// [SCOPE 154 / T002] END

describe("recordRefused (FR-003)", () => {
  it("writes one project.remote.refused row with the project and the token's issuer", async () => {
    await svc.recordRefused(P(), "u-issuer");
    expect(store.audits).toHaveLength(1);
    expect(store.audits[0]).toMatchObject({ action: "project.remote.refused", changedby: "u-issuer", newvalue: { projectid: "p-1" } });
  });

  it("a project with no company is not audited (nothing to attach the row to)", async () => {
    await svc.recordRefused({ ...P(), companyid: null }, "u-issuer");
    expect(store.audits).toHaveLength(0);
  });
});
// [SCOPE 145 / T002] END
