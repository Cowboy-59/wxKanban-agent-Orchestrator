/**
 * SPEC-144 (SCOPE-144) T006–T009, T013 — CompanyYappchattService rules, no database and
 * no network: an in-memory store stands in for Postgres and a fake YappChatt for the
 * consumer API (contract C1). The repo `.env` points at PRODUCTION, so the db client and
 * the broker module are mocked and `fetch` is stubbed to fail loudly.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/db/client.js", () => ({ db: {} }));

vi.mock("../../src/server/lib/yappchattBroker.js", () => {
  class YappchattBrokerError extends Error {
    constructor(
      readonly code: string,
      readonly status: number,
      message: string,
      readonly details: Record<string, unknown> = {},
    ) {
      super(message);
    }
  }
  const unusable = (): never => {
    throw new Error("the real broker must not be called from unit tests");
  };
  return {
    YappchattBrokerError,
    COMPANION_UNAVAILABLE: "companion_unavailable",
    isCompanionUnavailable: (err: unknown) => err instanceof YappchattBrokerError && err.code === "companion_unavailable",
    consumerLookupAccount: unusable,
    consumerAccount: unusable,
    consumerCreateGroup: unusable,
    consumerPutGroupMember: unusable,
    consumerRemoveGroupMember: unusable,
    consumerCreateRoom: unusable,
    consumerAddRoomMember: unusable,
    consumerRemoveRoomMember: unusable,
    consumerRetireRoom: unusable,
    operatorSession: unusable,
    mintAgentToken: unusable,
  };
});

import {
  CompanyYappchattService,
  CompanyYappchattError,
  matchSyncTrigger,
  type CompanionClient,
  type CompanyChatRecord,
  type CompanyYappchattStore,
  type ConsultingMember,
  type CompanyUser,
  type LiveRoom,
  type YappchattAuditEntry,
} from "../../src/server/services/CompanyYappchattService.js";
import { YappchattBrokerError } from "../../src/server/lib/yappchattBroker.js";
import type { AuthRequest } from "../../src/server/middleware/auth.js";

// [SCOPE 144 / T006] BEGIN — CompanyYappchattService unit tests
vi.stubGlobal("fetch", () => {
  throw new Error("network is not allowed in unit tests");
});

const COMPANY = "c0000000-0000-4000-8000-000000000001";
const PROJECT_A = "a0000000-0000-4000-8000-00000000000a";
const PROJECT_B = "b0000000-0000-4000-8000-00000000000b";

interface PersonRow {
  userid: string;
  email: string;
  name: string | null;
  usertype: string;
  active: boolean;
  companyid: string;
  yappchattuserid: string | null;
}

interface AssignmentRow {
  userid: string;
  projectid: string;
  current: boolean;
}

/** In-memory stand-in for the Postgres store. */
class MemoryStore implements CompanyYappchattStore {
  company: CompanyChatRecord = {
    id: COMPANY,
    name: "Acme",
    contactemail: "info@acme.com",
    yappchattuserid: null,
    yappchattemail: null,
    yappchattlinkedat: null,
    yappchattgroupid: null,
  };
  seats: number | null = null;
  people: PersonRow[] = [];
  assignments: AssignmentRow[] = [];
  projectMembers: Array<{ projectid: string; userid: string; removed: boolean }> = [];
  rooms: Array<LiveRoom & { retiredat: Date | null }> = [];
  audits: YappchattAuditEntry[] = [];
  invitations = new Map<string, string>();
  engagementCompanies = new Map<string, string>();
  linkCalls = 0;

  async getCompany(id: string) {
    return id === this.company.id ? { ...this.company } : null;
  }
  async seatLimit() {
    return this.seats;
  }
  async linkCompany(_id: string, v: { userid: string; email: string; groupid: string; linkedat: Date }) {
    this.linkCalls++;
    if (this.company.yappchattgroupid) return false;
    Object.assign(this.company, {
      yappchattuserid: v.userid,
      yappchattemail: v.email,
      yappchattgroupid: v.groupid,
      yappchattlinkedat: v.linkedat,
    });
    return true;
  }
  async companyUsers(): Promise<CompanyUser[]> {
    return this.people
      .filter((p) => p.companyid === COMPANY && p.active)
      .map(({ userid, email, name, usertype, yappchattuserid }) => ({ userid, email, name, usertype, yappchattuserid }));
  }
  async consultingMembers(): Promise<ConsultingMember[]> {
    const out = new Map<string, ConsultingMember>();
    for (const a of this.assignments.filter((x) => x.current)) {
      const p = this.people.find((x) => x.userid === a.userid && x.active);
      if (!p) continue;
      const m = out.get(p.userid) ?? { userid: p.userid, email: p.email, name: p.name, yappchattuserid: p.yappchattuserid, projectids: [] };
      m.projectids.push(a.projectid);
      out.set(p.userid, m);
    }
    return [...out.values()];
  }
  async knownPeople() {
    const ids = new Set([
      ...this.people.filter((p) => p.companyid === COMPANY).map((p) => p.userid),
      ...this.assignments.map((a) => a.userid),
    ]);
    return this.people
      .filter((p) => ids.has(p.userid) && p.yappchattuserid)
      .map(({ userid, email, name, yappchattuserid }) => ({ userid, email, name, yappchattuserid }));
  }
  async setPersonYappchattId(userid: string, id: string) {
    const p = this.people.find((x) => x.userid === userid);
    if (p) p.yappchattuserid = id;
  }
  async lastGroupRoles() {
    const roles = new Map<string, "admin" | "member">();
    for (const a of this.audits) {
      if (a.action !== "yappchatt.member.added" && a.action !== "yappchatt.member.role") continue;
      if (a.newvalue.scope !== "group") continue;
      const role = a.newvalue.role;
      if (role === "admin" || role === "member") roles.set(String(a.newvalue.yappchattuserid), role);
    }
    return roles;
  }
  async liveRooms() {
    return this.rooms.filter((r) => !r.retiredat).map(({ retiredat: _r, ...room }) => room);
  }
  async liveRoom(projectId: string, agentName: string) {
    const r = this.rooms.find((x) => x.projectid === projectId && x.agentname === agentName && !x.retiredat);
    if (!r) return null;
    const { retiredat: _r, ...room } = r;
    return room;
  }
  async markRoomRetired(id: string, at: Date) {
    const r = this.rooms.find((x) => x.id === id);
    if (r) r.retiredat = at;
  }
  async insertRoom(v: { projectid: string; agentname: string; conversationid: string; owneryappchattid: string }) {
    if (this.rooms.some((x) => x.projectid === v.projectid && x.agentname === v.agentname && !x.retiredat)) return null;
    const id = `row-${this.rooms.length + 1}`;
    this.rooms.push({ id, ...v, retiredat: null });
    return id;
  }
  async touchRoomMint() {}
  async projectCompany() {
    return COMPANY;
  }
  async personByYappchattId(companyId: string, id: string) {
    const p = this.people.find((x) => x.companyid === companyId && x.yappchattuserid === id && x.active);
    return p ? { userid: p.userid, name: p.name ?? p.email, usertype: p.usertype } : null;
  }
  async isCurrentProjectMember(projectId: string, userid: string) {
    return this.projectMembers.some((m) => m.projectid === projectId && m.userid === userid && !m.removed);
  }
  async companyForInvitationToken(token: string) {
    return this.invitations.get(token) ?? null;
  }
  async companyForEngagement(id: string) {
    return this.engagementCompanies.get(id) ?? null;
  }
  async audit(entry: YappchattAuditEntry) {
    this.audits.push(entry);
  }
}

/** A fake YappChatt consumer API with the C1 semantics (idempotent adds/removes, seat limit). */
class FakeYappchatt implements CompanionClient {
  unavailable = false;
  accounts = new Map<string, string>(); // email → userid
  groups = new Map<string, { owner: string; seatlimit: number | null; members: Map<string, string> }>();
  rooms = new Map<string, { owner: string; title: string; members: Set<string>; retiredat: string | null }>();
  calls: string[] = [];
  minted: Array<{ session: string; conversationid: string }> = [];
  private n = 0;

  private gate(name: string): void {
    this.calls.push(name);
    if (this.unavailable) throw new YappchattBrokerError("companion_unavailable", 503, "YappChatt companion not available");
  }
  private id(prefix: string): string {
    this.n++;
    return `${prefix}${String(this.n).padStart(4, "0")}-0000-4000-8000-000000000000`;
  }
  idFor(email: string): string {
    const id = this.accounts.get(email);
    if (!id) throw new Error(`no account for ${email}`);
    return id;
  }
  async lookup(email: string) {
    this.gate("lookup");
    const userid = this.accounts.get(email) ?? null;
    return { exists: userid !== null, userid, displayName: userid ? `Name of ${email}` : null };
  }
  async account(email: string) {
    this.gate("account");
    const existing = this.accounts.get(email);
    if (existing) return { userid: existing, created: false };
    const userid = this.id("y");
    this.accounts.set(email, userid);
    return { userid, created: true };
  }
  async createGroup(owner: string, _name: string, seatlimit: number | null) {
    this.gate("createGroup");
    const orgid = this.id("g");
    this.groups.set(orgid, { owner, seatlimit, members: new Map([[owner, "owner"]]) });
    return { orgid };
  }
  async putGroupMember(orgid: string, userid: string, role: "admin" | "member") {
    this.gate("putGroupMember");
    const g = this.groups.get(orgid);
    if (!g) throw new YappchattBrokerError("org_not_found", 404, "org_not_found");
    const current = g.members.get(userid);
    if (current === "owner") throw new YappchattBrokerError("owner_protected", 409, "owner_protected");
    if (current) {
      g.members.set(userid, role);
      return { added: false };
    }
    const used = g.members.size - 1;
    if (g.seatlimit !== null && used + 1 > g.seatlimit) {
      throw new YappchattBrokerError("seat_limit_reached", 409, "seat_limit_reached", { missing: used + 1 - g.seatlimit });
    }
    g.members.set(userid, role);
    return { added: true };
  }
  async removeGroupMember(orgid: string, userid: string) {
    this.gate("removeGroupMember");
    const g = this.groups.get(orgid);
    if (!g) throw new YappchattBrokerError("org_not_found", 404, "org_not_found");
    return { removed: g.members.delete(userid) };
  }
  async createRoom(owner: string, title: string, memberIds: string[]) {
    this.gate("createRoom");
    const conversationid = this.id("r");
    this.rooms.set(conversationid, { owner, title, members: new Set([owner, ...memberIds]), retiredat: null });
    return { conversationid };
  }
  async addRoomMember(conversationid: string, userid: string) {
    this.gate("addRoomMember");
    const r = this.rooms.get(conversationid);
    if (!r) throw new YappchattBrokerError("room_not_found", 404, "room_not_found");
    if (r.retiredat) throw new YappchattBrokerError("room_retired", 409, "room_retired");
    const had = r.members.has(userid);
    r.members.add(userid);
    return { added: !had };
  }
  async removeRoomMember(conversationid: string, userid: string) {
    this.gate("removeRoomMember");
    const r = this.rooms.get(conversationid);
    if (!r) throw new YappchattBrokerError("room_not_found", 404, "room_not_found");
    return { removed: r.members.delete(userid) };
  }
  async retireRoom(conversationid: string) {
    this.gate("retireRoom");
    const r = this.rooms.get(conversationid) ?? { owner: "", title: "", members: new Set<string>(), retiredat: null };
    r.retiredat = r.retiredat ?? "2026-10-24T12:00:00.000Z";
    this.rooms.set(conversationid, r);
    return { retiredat: r.retiredat };
  }
  async session(email: string) {
    this.gate("session");
    return `session-for:${email}`;
  }
  async mintAgentToken(session: string, conversationid: string) {
    this.gate("mintAgentToken");
    this.minted.push({ session, conversationid });
    return `yca_${conversationid}`;
  }
}

let store: MemoryStore;
let yc: FakeYappchatt;
let svc: CompanyYappchattService;

const person = (userid: string, usertype: string, extra: Partial<PersonRow> = {}): PersonRow => ({
  userid,
  email: `${userid}@acme.com`,
  name: `Name ${userid}`,
  usertype,
  active: true,
  companyid: COMPANY,
  yappchattuserid: null,
  ...extra,
});

/** 5 company users (US1) + consultant c1 on Billing (A) + consultant c2 only on B (US2). */
function seedTeam(): void {
  store.people.push(
    person("admin1", "ADMIN"),
    person("mgr1", "TEAM_MANAGER"),
    person("mem1", "TEAM_MEMBER"),
    person("mem2", "TEAM_MEMBER"),
    person("mem3", "TEAM_MEMBER"),
    person("c1", "TEAM_MEMBER", { companyid: "consulting-co", email: "c1@consult.com" }),
    person("c2", "TEAM_MEMBER", { companyid: "consulting-co", email: "c2@consult.com" }),
  );
  store.assignments.push({ userid: "c1", projectid: PROJECT_A, current: true });
  store.assignments.push({ userid: "c2", projectid: PROJECT_B, current: true });
}

const ycOf = (userid: string): string => {
  const p = store.people.find((x) => x.userid === userid);
  if (!p?.yappchattuserid) throw new Error(`no yappchatt id stored for ${userid}`);
  return p.yappchattuserid;
};
const groupOf = () => {
  const g = yc.groups.get(store.company.yappchattgroupid ?? "");
  if (!g) throw new Error("no group");
  return g;
};
const actions = (a: string) => store.audits.filter((x) => x.action === a);

const roomArgs = (over: Partial<Parameters<CompanyYappchattService["ensureCompanyRoom"]>[0]> = {}) => ({
  companyId: COMPANY,
  projectId: PROJECT_A,
  projectName: "Billing",
  agentName: "KAIN",
  operatorEmail: "mem1@acme.com",
  actorUserId: "mem1",
  ...over,
});

beforeEach(() => {
  store = new MemoryStore();
  yc = new FakeYappchatt();
  svc = new CompanyYappchattService(store, yc);
});

describe("connectCompany (POST /api/company/yappchatt, FR-002, FR-003)", () => {
  it("creates the account from the contact email, creates the group, adds everyone directly and stores each id (US1)", async () => {
    seedTeam();
    store.seats = 10;
    const r = await svc.connectCompany(COMPANY, "admin1");

    expect(r.outcome).toBe("created");
    expect(r.email).toBe("info@acme.com");
    expect(store.company.yappchattuserid).toBe(yc.idFor("info@acme.com"));
    expect(store.company.yappchattgroupid).toBe(r.groupId);
    expect(store.company.yappchattlinkedat).toBeInstanceOf(Date);

    const g = groupOf();
    expect(g.owner).toBe(r.yappchattUserId);
    expect(g.seatlimit).toBe(10);
    // 5 users + the 2 consulting members on the company's projects, plus the owner.
    expect(g.members.size).toBe(8);
    expect(g.members.get(ycOf("admin1"))).toBe("admin");
    expect(g.members.get(ycOf("mgr1"))).toBe("member");
    expect(g.members.get(ycOf("c1"))).toBe("member");
    for (const id of ["admin1", "mgr1", "mem1", "mem2", "mem3", "c1", "c2"]) expect(ycOf(id)).toBeTruthy();

    expect(r.members).toEqual({ added: 7, updated: 0, removed: 0, failed: [] });
    expect(actions("yappchatt.account.created")).toHaveLength(1);
    expect(actions("yappchatt.member.added")).toHaveLength(7);
    expect(actions("yappchatt.account.created")[0].changedby).toBe("admin1");
  });

  it("links an existing YappChatt account for the contact email instead of creating one", async () => {
    yc.accounts.set("info@acme.com", "y9999000-0000-4000-8000-000000000000");
    const r = await svc.connectCompany(COMPANY, "admin1");
    expect(r.outcome).toBe("linked");
    expect(r.yappchattUserId).toBe("y9999000-0000-4000-8000-000000000000");
    expect(actions("yappchatt.account.linked")).toHaveLength(1);
    expect(actions("yappchatt.account.created")).toHaveLength(0);
  });

  it("a second press is idempotent: no account or group call, nothing relinked (FR-002)", async () => {
    seedTeam();
    const first = await svc.connectCompany(COMPANY, "admin1");
    const callsBefore = yc.calls.length;
    const auditsBefore = store.audits.length;

    const second = await svc.connectCompany(COMPANY, "admin1");
    expect(second.outcome).toBe("already");
    expect(second.yappchattUserId).toBe(first.yappchattUserId);
    expect(second.groupId).toBe(first.groupId);
    const newCalls = yc.calls.slice(callsBefore);
    expect(newCalls).not.toContain("account");
    expect(newCalls).not.toContain("createGroup");
    expect(store.linkCalls).toBe(1);
    expect(second.members).toEqual({ added: 0, updated: 0, removed: 0, failed: [] });
    expect(store.audits.length).toBe(auditsBefore);
  });

  it("with the companion missing, nothing changes locally (FR-011)", async () => {
    seedTeam();
    yc.unavailable = true;
    await expect(svc.connectCompany(COMPANY, "admin1")).rejects.toMatchObject({ code: "companion_unavailable" });
    expect(store.company.yappchattuserid).toBeNull();
    expect(store.company.yappchattgroupid).toBeNull();
    expect(store.linkCalls).toBe(0);
    expect(store.audits).toHaveLength(0);
    expect(store.people.every((p) => p.yappchattuserid === null)).toBe(true);
  });

  it("uses an unlimited group when the company has no subscription seat count", async () => {
    store.seats = null;
    await svc.connectCompany(COMPANY, "admin1");
    expect(groupOf().seatlimit).toBeNull();
  });

  it("reports seat_limit_reached in the result, never silently", async () => {
    seedTeam();
    store.seats = 3;
    const r = await svc.connectCompany(COMPANY, "admin1");
    const seatFailures = r.members.failed.filter((f) => f.reason === "seat_limit_reached");
    expect(seatFailures).toHaveLength(4); // 7 people, 3 seats
    expect(r.members.added).toBe(3);
  });

  it("status reports connected, the email and the ids, and canManage for ADMIN only (FR-001)", async () => {
    const before = await svc.status(COMPANY, "TEAM_MEMBER");
    expect(before).toEqual({ connected: false, email: null, contactEmail: "info@acme.com", yappchattUserId: null, groupId: null, linkedAt: null, canManage: false });
    await svc.connectCompany(COMPANY, "admin1");
    const after = await svc.status(COMPANY, "ADMIN");
    expect(after.connected).toBe(true);
    expect(after.email).toBe("info@acme.com");
    expect(after.contactEmail).toBe("info@acme.com");
    expect(after.yappchattUserId).toBe(store.company.yappchattuserid);
    expect(after.groupId).toBe(store.company.yappchattgroupid);
    expect(after.canManage).toBe(true);
    expect(typeof after.linkedAt).toBe("string");
  });
});

describe("previewConnect (POST { confirm: false }, D5)", () => {
  it("no YappChatt account for the contact email: exists false, and nothing is created, stored or audited", async () => {
    seedTeam();
    const r = await svc.previewConnect(COMPANY);
    expect(r).toEqual({ wouldLink: { email: "info@acme.com", exists: false, displayName: null } });
    expect(yc.calls).toEqual(["lookup"]);
    expect(store.linkCalls).toBe(0);
    expect(store.company.yappchattuserid).toBeNull();
    expect(store.audits).toHaveLength(0);
  });

  it("an existing account: exists true with its display name, still nothing changed", async () => {
    yc.accounts.set("info@acme.com", "y9999000-0000-4000-8000-000000000000");
    const r = await svc.previewConnect(COMPANY);
    expect(r).toEqual({ wouldLink: { email: "info@acme.com", exists: true, displayName: "Name of info@acme.com" } });
    expect(yc.calls).toEqual(["lookup"]);
    expect(store.audits).toHaveLength(0);
  });

  it("already connected: names the linked account without asking YappChatt", async () => {
    await svc.connectCompany(COMPANY, "admin1");
    const callsBefore = yc.calls.length;
    const r = await svc.previewConnect(COMPANY);
    expect(r.wouldLink).toMatchObject({ email: "info@acme.com", exists: true });
    expect(yc.calls.length).toBe(callsBefore);
  });

  it("companion missing: companion_unavailable, nothing changed (FR-011)", async () => {
    yc.unavailable = true;
    await expect(svc.previewConnect(COMPANY)).rejects.toMatchObject({ code: "companion_unavailable" });
    expect(store.linkCalls).toBe(0);
  });
});

describe("syncCompany (FR-004)", () => {
  beforeEach(async () => {
    seedTeam();
    await svc.connectCompany(COMPANY, "admin1");
  });

  it("a removed user leaves the group and every company room in one sync (US5)", async () => {
    await svc.ensureCompanyRoom(roomArgs({ projectId: PROJECT_A }));
    await svc.ensureCompanyRoom(roomArgs({ projectId: PROJECT_B, projectName: "Other" }));
    const mem2 = ycOf("mem2");
    store.people.find((p) => p.userid === "mem2")!.active = false;

    const r = await svc.syncCompany(COMPANY, "admin1");
    expect(groupOf().members.has(mem2)).toBe(false);
    for (const room of yc.rooms.values()) expect(room.members.has(mem2)).toBe(false);
    expect(r.removed).toBe(3); // group + 2 rooms
    expect(actions("yappchatt.member.removed")).toHaveLength(3);
  });

  it("an ended engagement takes the consultant out of the group and the project's room", async () => {
    await svc.ensureCompanyRoom(roomArgs());
    const c1 = ycOf("c1");
    const roomA = [...yc.rooms.values()].find((r) => r.title === "Billing · KAIN")!;
    expect(roomA.members.has(c1)).toBe(true);

    store.assignments.find((a) => a.userid === "c1")!.current = false;
    await svc.syncCompany(COMPANY, null);
    expect(groupOf().members.has(c1)).toBe(false);
    expect(roomA.members.has(c1)).toBe(false);
  });

  it("a role change re-roles the group member and is audited once", async () => {
    const mem1 = ycOf("mem1");
    store.people.find((p) => p.userid === "mem1")!.usertype = "ADMIN";
    const r = await svc.syncCompany(COMPANY, "admin1");
    expect(groupOf().members.get(mem1)).toBe("admin");
    expect(r.updated).toBe(1);
    expect(actions("yappchatt.member.role")).toHaveLength(1);

    const again = await svc.syncCompany(COMPANY, "admin1");
    expect(again.updated).toBe(0);
    expect(actions("yappchatt.member.role")).toHaveLength(1);
  });

  it("leaves a room with another owner alone (the next connect retires it)", async () => {
    store.rooms.push({ id: "old", projectid: PROJECT_A, agentname: "KAIN", conversationid: "r-old", owneryappchattid: null, retiredat: null });
    yc.rooms.set("r-old", { owner: "someone", title: "Billing · KAIN", members: new Set(["someone"]), retiredat: null });
    await svc.syncCompany(COMPANY, null);
    expect(yc.rooms.get("r-old")!.members.size).toBe(1);
  });

  it("does nothing for a company with no account", async () => {
    const other = new CompanyYappchattService(new MemoryStore(), yc);
    const before = yc.calls.length;
    expect(await other.syncCompany(COMPANY, null)).toMatchObject({ skipped: "no_company_account" });
    expect(yc.calls.length).toBe(before);
  });

  it("syncQuietly never throws when the companion disappears", async () => {
    yc.unavailable = true;
    await expect(svc.syncQuietly(COMPANY, null, "test")).resolves.toBeNull();
  });
});

describe("ensureCompanyRoom (FR-005, FR-006, FR-007)", () => {
  it("with no company account: 409 no_company_account with the contact email, and nothing created (US4)", async () => {
    seedTeam();
    const err = await svc.ensureCompanyRoom(roomArgs()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CompanyYappchattError);
    expect(err).toMatchObject({ code: "no_company_account", status: 409, extra: { contactEmail: "info@acme.com" } });
    expect(yc.calls).toHaveLength(0);
    expect(store.rooms).toHaveLength(0);
    expect(store.audits).toHaveLength(0);
  });

  it("createCompanyAccount: true creates the account first, then a company-owned room", async () => {
    seedTeam();
    const room = await svc.ensureCompanyRoom(roomArgs({ createCompanyAccount: true }));
    expect(store.company.yappchattuserid).toBeTruthy();
    expect(room.ownerYappchattId).toBe(store.company.yappchattuserid);
    expect(store.rooms[0].owneryappchattid).toBe(store.company.yappchattuserid);
  });

  it("creates the room under the company account with the company users plus ONLY that project's consultants (US2)", async () => {
    seedTeam();
    await svc.connectCompany(COMPANY, "admin1");
    const room = await svc.ensureCompanyRoom(roomArgs());

    expect(room.minted).toBe(true);
    expect(room.agentToken).toBe(`yca_${room.conversationId}`);
    expect(room.ownerYappchattId).toBe(store.company.yappchattuserid);
    const yRoom = yc.rooms.get(room.conversationId)!;
    expect(yRoom.owner).toBe(store.company.yappchattuserid);
    expect(yRoom.title).toBe("Billing · KAIN");
    for (const u of ["admin1", "mgr1", "mem1", "mem2", "mem3", "c1"]) expect(yRoom.members.has(ycOf(u))).toBe(true);
    expect(yRoom.members.has(ycOf("c2"))).toBe(false); // consultant not on the project is never added
    expect(yRoom.members.size).toBe(7); // owner + 6

    // The agent token is minted with the COMPANY account's session, not the operator's.
    expect(yc.minted[0].session).toBe("session-for:info@acme.com");
    expect(store.rooms[0].owneryappchattid).toBe(store.company.yappchattuserid);
    expect(actions("yappchatt.room.created")).toHaveLength(1);
  });

  it("a consultant not on the project stays out after a sync too", async () => {
    seedTeam();
    await svc.connectCompany(COMPANY, "admin1");
    const room = await svc.ensureCompanyRoom(roomArgs());
    await svc.syncCompany(COMPANY, null);
    expect(yc.rooms.get(room.conversationId)!.members.has(ycOf("c2"))).toBe(false);
  });

  it("retires an old room with no recorded owner and replaces it (US5, FR-007)", async () => {
    seedTeam();
    await svc.connectCompany(COMPANY, "admin1");
    store.rooms.push({ id: "old", projectid: PROJECT_A, agentname: "KAIN", conversationid: "r-old", owneryappchattid: null, retiredat: null });
    yc.rooms.set("r-old", { owner: "personal", title: "Billing · KAIN", members: new Set(["personal"]), retiredat: null });

    const room = await svc.ensureCompanyRoom(roomArgs());
    expect(room.replacedConversationId).toBe("r-old");
    expect(room.conversationId).not.toBe("r-old");
    expect(yc.rooms.get("r-old")!.retiredat).toBeTruthy(); // retired, not deleted
    expect(store.rooms.find((r) => r.id === "old")!.retiredat).toEqual(new Date("2026-10-24T12:00:00.000Z"));
    const live = await store.liveRoom(PROJECT_A, "KAIN");
    expect(live!.owneryappchattid).toBe(store.company.yappchattuserid);
    expect(actions("yappchatt.room.retired")).toHaveLength(1);
    expect(actions("yappchatt.room.created")).toHaveLength(1);
  });

  it("retires a room owned by another account", async () => {
    seedTeam();
    await svc.connectCompany(COMPANY, "admin1");
    store.rooms.push({ id: "old", projectid: PROJECT_A, agentname: "KAIN", conversationid: "r-old", owneryappchattid: "y-someone-else", retiredat: null });
    yc.rooms.set("r-old", { owner: "y-someone-else", title: "t", members: new Set(), retiredat: null });
    const room = await svc.ensureCompanyRoom(roomArgs());
    expect(room.replacedConversationId).toBe("r-old");
  });

  it("an existing company-owned room is reused without a YappChatt room call", async () => {
    seedTeam();
    await svc.connectCompany(COMPANY, "admin1");
    const first = await svc.ensureCompanyRoom(roomArgs());
    const calls = yc.calls.length;
    const again = await svc.ensureCompanyRoom(roomArgs());
    expect(again).toMatchObject({ conversationId: first.conversationId, minted: false });
    expect(again.agentToken).toBeUndefined();
    const newCalls = yc.calls.slice(calls);
    expect(newCalls).not.toContain("createRoom");
    expect(newCalls).not.toContain("retireRoom");
    expect(newCalls).not.toContain("mintAgentToken");
  });

  it("re-mints for an existing company room when the agent lost its token", async () => {
    seedTeam();
    await svc.connectCompany(COMPANY, "admin1");
    const first = await svc.ensureCompanyRoom(roomArgs());
    const again = await svc.ensureCompanyRoom(roomArgs({ mintAgentToken: true }));
    expect(again).toMatchObject({ conversationId: first.conversationId, minted: true });
    expect(yc.minted).toHaveLength(2);
  });

  it("with the companion missing, an old room is neither retired nor replaced locally", async () => {
    seedTeam();
    await svc.connectCompany(COMPANY, "admin1");
    store.rooms.push({ id: "old", projectid: PROJECT_A, agentname: "KAIN", conversationid: "r-old", owneryappchattid: null, retiredat: null });
    const auditsBefore = store.audits.length;
    yc.unavailable = true;
    await expect(svc.ensureCompanyRoom(roomArgs())).rejects.toMatchObject({ code: "companion_unavailable" });
    expect(store.rooms).toHaveLength(1);
    expect(store.rooms[0].retiredat).toBeNull();
    expect(store.audits.length).toBe(auditsBefore);
  });
});

describe("approver (FR-008, GET /api/project-agent/approver)", () => {
  const token = { projectid: PROJECT_A, customerid: COMPANY };

  beforeEach(() => {
    store.people.push(
      person("admin1", "ADMIN", { yappchattuserid: "y-admin" }),
      person("mgr1", "TEAM_MANAGER", { yappchattuserid: "y-mgr", name: "Mia Manager" }),
      person("mgr2", "TEAM_MANAGER", { yappchattuserid: "y-mgr2" }),
      person("mem1", "TEAM_MEMBER", { yappchattuserid: "y-mem" }),
    );
    store.projectMembers.push({ projectid: PROJECT_A, userid: "mgr1", removed: false });
    store.projectMembers.push({ projectid: PROJECT_A, userid: "mgr2", removed: true });
    store.projectMembers.push({ projectid: PROJECT_A, userid: "mem1", removed: false });
  });

  it("a company ADMIN is an approver", async () => {
    expect(await svc.approver(token, "y-admin")).toEqual({ approver: true, name: "Name admin1", role: "ADMIN" });
  });

  it("a TEAM_MANAGER who is a current member of the project is an approver, under their name (US3)", async () => {
    expect(await svc.approver(token, "y-mgr")).toEqual({ approver: true, name: "Mia Manager", role: "TEAM_MANAGER" });
    expect(actions("yappchatt.decision.accepted")).toHaveLength(1);
    expect(actions("yappchatt.decision.accepted")[0].changedby).toBe("mgr1");
  });

  it("a TEAM_MANAGER removed from the project is not", async () => {
    expect(await svc.approver(token, "y-mgr2")).toEqual({ approver: false, name: null, role: null });
  });

  it("a TEAM_MEMBER is not an approver, even on the project (US3)", async () => {
    expect(await svc.approver(token, "y-mem")).toEqual({ approver: false, name: null, role: null });
    expect(actions("yappchatt.decision.refused")).toHaveLength(1);
  });

  it("an unknown YappChatt id is not an approver, and the refusal is audited", async () => {
    expect(await svc.approver(token, "y-nobody")).toEqual({ approver: false, name: null, role: null });
    const [row] = actions("yappchatt.decision.refused");
    expect(row.changedby).toBeNull();
    expect(row.newvalue).toMatchObject({ projectid: PROJECT_A, yappchattuserid: "y-nobody" });
  });

  it("an inactive ADMIN is not an approver", async () => {
    store.people.find((p) => p.userid === "admin1")!.active = false;
    expect((await svc.approver(token, "y-admin")).approver).toBe(false);
  });
});

describe("audit rows never carry a token or secret (FR-010)", () => {
  it("no newvalue holds an agent token or session", async () => {
    seedTeam();
    await svc.connectCompany(COMPANY, "admin1");
    await svc.ensureCompanyRoom(roomArgs());
    const blob = JSON.stringify(store.audits);
    expect(blob).not.toContain("yca_");
    expect(blob).not.toContain("session-for:");
  });
});

describe("sync triggers (T007)", () => {
  it("matches the user and engagement change routes, and nothing else", () => {
    expect(matchSyncTrigger("POST", "/api/team/u1/remove")).toMatchObject({ kind: "session-company" });
    expect(matchSyncTrigger("POST", "/api/team/u1/status")).toMatchObject({ kind: "session-company" });
    expect(matchSyncTrigger("POST", "/api/team/u1/role")).toMatchObject({ kind: "session-company" });
    expect(matchSyncTrigger("POST", "/api/team/invite/tok1/accept")).toMatchObject({ kind: "invitation", id: "tok1" });
    expect(matchSyncTrigger("POST", "/api/invitations/accept/tok2?x=1")).toMatchObject({ kind: "invitation", id: "tok2" });
    expect(matchSyncTrigger("POST", "/api/admin/users")).toMatchObject({ kind: "session-company" });
    expect(matchSyncTrigger("PUT", "/api/admin/users/u1/role")).toMatchObject({ kind: "session-company" });
    expect(matchSyncTrigger("DELETE", "/api/admin/users/u1")).toMatchObject({ kind: "session-company" });
    expect(matchSyncTrigger("POST", "/api/engagements/e1/end")).toMatchObject({ kind: "engagement", id: "e1" });
    expect(matchSyncTrigger("POST", "/api/engagements/e1/assignments")).toMatchObject({ kind: "engagement", id: "e1" });
    expect(matchSyncTrigger("DELETE", "/api/engagements/e1/assignments/a1")).toMatchObject({ kind: "engagement" });
    expect(matchSyncTrigger("POST", "/api/engagements/e1/assignments/a1/subassign")).toMatchObject({ kind: "engagement" });
    expect(matchSyncTrigger("DELETE", "/api/engagements/e1/subassignments/s1")).toMatchObject({ kind: "engagement" });

    expect(matchSyncTrigger("GET", "/api/team/u1/remove")).toBeNull();
    expect(matchSyncTrigger("GET", "/api/engagements/e1")).toBeNull();
    expect(matchSyncTrigger("POST", "/api/team/invite")).toBeNull();
    expect(matchSyncTrigger("POST", "/api/projects/p1/tasks")).toBeNull();
  });

  it("syncAfterRequest resolves the company from the session, an invitation or an engagement", async () => {
    seedTeam();
    await svc.connectCompany(COMPANY, "admin1");
    const spy = vi.spyOn(svc, "syncQuietly");
    store.invitations.set("tok1", COMPANY);
    store.engagementCompanies.set("e1", COMPANY);
    const req = { companyid: COMPANY, userid: "admin1" } as AuthRequest;

    await svc.syncAfterRequest({ kind: "session-company", id: "u1", name: "t" }, req);
    await svc.syncAfterRequest({ kind: "invitation", id: "tok1", name: "t" }, {} as AuthRequest);
    await svc.syncAfterRequest({ kind: "engagement", id: "e1", name: "t" }, {} as AuthRequest);
    await svc.syncAfterRequest({ kind: "engagement", id: "unknown", name: "t" }, {} as AuthRequest);
    expect(spy).toHaveBeenCalledTimes(3);
    expect(spy.mock.calls.every((c) => c[0] === COMPANY)).toBe(true);
  });
});
// [SCOPE 144 / T006] END
