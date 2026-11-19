// [SCOPE 152 / T007] BEGIN — the app's and the MCP's agent reach rules must agree (FR-067, FR-075 test 6)
//
// Reach is decided twice: by the app (grants, connect) and by the MCP (the per-call re-check,
// list_agent_connections). The two rules are copies, because the MCP is a separate package. This
// runs both on the same facts — every branch and every FR-070 event — and fails on any difference.
import { describe, it, expect, vi } from "vitest";

vi.mock("~/db/client.js", () => ({ db: {} }));

import { computeAgentReach as appRule, type ReachFacts } from "~/server/lib/agentReach.js";
import { computeAgentReach as mcpRule } from "../../mcp-server/src/utils/agent-reach.js";

const OWN = "own";
const A = "client-a";
const B = "client-b";

function project(id: string, companyid: string, over: Record<string, unknown> = {}) {
  return { id, name: `P ${id}`, companyid, companyName: `Co ${companyid}`, allowremote: true, currentphase: "DEV", ...over };
}

function assignment(assignmentId: string, p: ReturnType<typeof project>, over: Record<string, unknown> = {}) {
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

const people = ["ADMIN", "TEAM_MANAGER", "TEAM_MEMBER"].flatMap((usertype) =>
  [true, false].map((active) => ({ id: "u", companyid: OWN, usertype, active })),
);

const engagementVariants: Array<Record<string, unknown>> = [
  {},
  { engagementState: "paused" },
  { engagementState: "disabled" },
  { engagementState: "ended" },
  { assignmentRemoved: true },
  { scopeid: "017" },
  { taskid: "t-1" },
  { consultingCompanyId: "stranger" },
  { clientCompanyId: "stranger" },
];

const projectVariants: Array<Record<string, unknown>> = [{}, { allowremote: false }, { currentphase: "ARCHIVED" }];

describe("agent reach — app and MCP rules agree", () => {
  const cases: Array<{ name: string; facts: ReachFacts }> = [];
  for (const person of people) {
    for (const ev of engagementVariants) {
      for (const pv of projectVariants) {
        for (const subs of [new Set<string>(), new Set(["a1"])]) {
          cases.push({
            name: `${person.usertype}/${person.active ? "active" : "inactive"} ${JSON.stringify(ev)} ${JSON.stringify(pv)} subs=${subs.size}`,
            facts: {
              person,
              ownProjects: [project("o1", OWN, pv), project("o2", OWN), project("x", "stranger")],
              memberProjectIds: new Set(["o2"]),
              engagementRows: [assignment("a1", project("ca", A, pv), ev), assignment("b1", project("cb", B))],
              liveSubassignmentIds: subs,
            },
          });
        }
      }
    }
  }
  cases.push({
    name: "no person",
    facts: { person: null, ownProjects: [], memberProjectIds: new Set(), engagementRows: [], liveSubassignmentIds: new Set() },
  });

  it(`gives identical answers on ${cases.length} fact sets`, () => {
    for (const c of cases) {
      expect(mcpRule(c.facts), c.name).toEqual(appRule(c.facts));
    }
  });
});
// [SCOPE 152 / T007] END
