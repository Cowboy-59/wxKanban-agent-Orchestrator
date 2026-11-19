// [SCOPE 152 / T004] BEGIN — agent reach rule tests (FR-066, FR-070)
import { describe, it, expect, vi } from "vitest";

// The rule is pure; the loader's database is never touched here (the repo .env is production).
vi.mock("~/db/client.js", () => ({ db: {} }));

import {
  computeAgentReach,
  type ReachFacts,
  type ReachProjectRow,
  type ReachEngagementRow,
} from "~/server/lib/agentReach.js";

const OWN = "c0000000-0000-7000-8000-000000000001";
const CLIENT_A = "c0000000-0000-7000-8000-00000000000a";
const CLIENT_B = "c0000000-0000-7000-8000-00000000000b";
const STRANGER = "c0000000-0000-7000-8000-00000000000f";

function project(id: string, companyid: string, over: Partial<ReachProjectRow> = {}): ReachProjectRow {
  const companyName = { [OWN]: "Own Co", [CLIENT_A]: "Alpha Client", [CLIENT_B]: "Beta Client", [STRANGER]: "Stranger" }[companyid] ?? "?";
  return { id, name: `Project ${id}`, companyid, companyName, allowremote: true, currentphase: "DEVELOPMENT", ...over };
}

function assignment(
  assignmentId: string,
  p: ReachProjectRow,
  over: Partial<Omit<ReachEngagementRow, "project">> = {},
): ReachEngagementRow {
  return {
    engagementId: `e-${p.companyid}`,
    engagementState: "active",
    consultingCompanyId: OWN,
    clientCompanyId: p.companyid,
    assignmentId,
    assignmentRemoved: false,
    scopeid: null,
    taskid: null,
    project: p,
    ...over,
  };
}

function facts(over: Partial<ReachFacts> = {}): ReachFacts {
  return {
    person: { id: "u1", companyid: OWN, usertype: "ADMIN", active: true },
    ownProjects: [project("own1", OWN), project("own2", OWN)],
    memberProjectIds: new Set(),
    engagementRows: [assignment("a1", project("ca1", CLIENT_A)), assignment("b1", project("cb1", CLIENT_B))],
    liveSubassignmentIds: new Set(),
    ...over,
  };
}

const ids = (f: ReachFacts) => computeAgentReach(f).map((p) => p.projectId);

describe("computeAgentReach — own company", () => {
  it("an ADMIN reaches every own Project with Allow remote on", () => {
    expect(ids(facts({ engagementRows: [] }))).toEqual(["own1", "own2"]);
  });

  it("a TEAM_MEMBER reaches only assigned or phase-led Projects", () => {
    const f = facts({
      person: { id: "u2", companyid: OWN, usertype: "TEAM_MEMBER", active: true },
      memberProjectIds: new Set(["own2"]),
      engagementRows: [],
    });
    expect(ids(f)).toEqual(["own2"]);
  });

  it("a TEAM_MEMBER with no assignment reaches nothing (showAll is never a permission)", () => {
    const f = facts({ person: { id: "u2", companyid: OWN, usertype: "TEAM_MEMBER", active: true }, engagementRows: [] });
    expect(ids(f)).toEqual([]);
  });

  it("Allow remote off or ARCHIVED drops a Project", () => {
    const f = facts({
      ownProjects: [project("own1", OWN, { allowremote: false }), project("own2", OWN, { currentphase: "ARCHIVED" })],
      engagementRows: [],
    });
    expect(ids(f)).toEqual([]);
  });

  it("a Project of another company in ownProjects is never reached", () => {
    expect(ids(facts({ ownProjects: [project("x", STRANGER)], engagementRows: [] }))).toEqual([]);
  });
});

describe("computeAgentReach — consulting company (D2)", () => {
  it("a consulting ADMIN reaches every live whole-Project assignment, own first then clients by name", () => {
    const reach = computeAgentReach(facts());
    expect(reach.map((p) => p.projectId)).toEqual(["own1", "own2", "ca1", "cb1"]);
    expect(reach[2]).toMatchObject({ via: "engagement", companyName: "Alpha Client", engagementId: `e-${CLIENT_A}` });
    expect(reach[0]).toMatchObject({ via: "own", engagementId: null });
  });

  it("a TEAM_MANAGER covers every assignment without subassignments", () => {
    const f = facts({ person: { id: "u3", companyid: OWN, usertype: "TEAM_MANAGER", active: true }, ownProjects: [] });
    expect(ids(f)).toEqual(["ca1", "cb1"]);
  });

  it("a consulting TEAM_MEMBER reaches only sub-assigned Projects", () => {
    const f = facts({
      person: { id: "u4", companyid: OWN, usertype: "TEAM_MEMBER", active: true },
      ownProjects: [],
      liveSubassignmentIds: new Set(["b1"]),
    });
    expect(ids(f)).toEqual(["cb1"]);
  });

  it("scope- and task-level assignments grant nothing", () => {
    const f = facts({
      ownProjects: [],
      engagementRows: [
        assignment("a1", project("ca1", CLIENT_A), { scopeid: "017" }),
        assignment("b1", project("cb1", CLIENT_B), { taskid: "t-1" }),
      ],
    });
    expect(ids(f)).toEqual([]);
  });

  it("another consulting company's engagement is never reached", () => {
    const f = facts({ ownProjects: [], engagementRows: [assignment("a1", project("ca1", CLIENT_A), { consultingCompanyId: STRANGER })] });
    expect(ids(f)).toEqual([]);
  });

  it("an assignment whose Project is not the client's own is never reached", () => {
    const f = facts({ ownProjects: [], engagementRows: [assignment("a1", project("x", STRANGER), { clientCompanyId: CLIENT_A })] });
    expect(ids(f)).toEqual([]);
  });

  it("a Project reached both ways is listed once, as own", () => {
    const own1 = project("own1", OWN);
    const f = facts({ engagementRows: [assignment("o1", own1, { clientCompanyId: OWN })] });
    expect(computeAgentReach(f).filter((p) => p.projectId === "own1")).toEqual([
      expect.objectContaining({ via: "own" }),
    ]);
  });
});

describe("computeAgentReach — FR-070, each event stops reach", () => {
  const consultant = { id: "u4", companyid: OWN, usertype: "TEAM_MEMBER", active: true };
  const base = (): ReachFacts =>
    facts({ person: consultant, ownProjects: [], liveSubassignmentIds: new Set(["a1"]), engagementRows: [assignment("a1", project("ca1", CLIENT_A))] });

  it("baseline: the sub-assigned consultant reaches the client Project", () => {
    expect(ids(base())).toEqual(["ca1"]);
  });

  it.each(["paused", "disabled", "ended"])("engagement %s", (state) => {
    const f = base();
    f.engagementRows = [assignment("a1", project("ca1", CLIENT_A), { engagementState: state })];
    expect(ids(f)).toEqual([]);
  });

  it("assignment removed", () => {
    const f = base();
    f.engagementRows = [assignment("a1", project("ca1", CLIENT_A), { assignmentRemoved: true })];
    expect(ids(f)).toEqual([]);
  });

  it("subassignment removed", () => {
    expect(ids({ ...base(), liveSubassignmentIds: new Set() })).toEqual([]);
  });

  it("Allow remote turned off", () => {
    const f = base();
    f.engagementRows = [assignment("a1", project("ca1", CLIENT_A, { allowremote: false }))];
    expect(ids(f)).toEqual([]);
  });

  it("person deactivated", () => {
    expect(ids({ ...base(), person: { ...consultant, active: false } })).toEqual([]);
  });

  it("person removed (no profile)", () => {
    expect(ids({ ...base(), person: null })).toEqual([]);
  });
});
// [SCOPE 152 / T004] END
