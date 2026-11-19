// Scope seed for SCOPE-132 Amendment H (Project Agent Autopilot), implemented by SPEC-154.
//
// Builds on the shared base (`_base`) rather than re-authoring a company/consultant: the
// consultant seeded there is a TEAM_MANAGER, which is exactly the role allowed to flip
// "Allow remote" / "Autopilot" on a project (ProjectRemoteAccessService.canManage).
//
// Two companyprojects rows cover the two branches a test needs:
//   - one with both switches already ON, to exercise the Allow-Remote-off cascade and to
//     give the heartbeat/missed-heartbeat path a real, actively-running connection to read;
//   - one with both OFF (explicit, even though they match the schema defaults), to exercise
//     the `remote_not_allowed` refusal when Autopilot is requested without Allow Remote.
//
// IDs are fixed UUID v7-shaped values under a `01998154-...` block, distinct from `_base`'s
// `01998000-...` block and from any other scope's, so this seed can never collide.

import { companyprojects } from "../../../src/db/schema/companyproject.js";
import { projectagentconnections } from "../../../src/db/schema/projectagentconnection.js";
import { baseSeed, BASE_IDS } from "../_base/seed.js";
import type { Seed, SeedContext, SeedResults } from "../harness.js";

// [SCOPE 154 / T020] BEGIN — Fixed identities for the Amendment H fixture rows
export const SCOPE132_IDS = {
  projectAutopilotOn: "01998154-0000-7000-8000-000000000001",
  projectRemoteOff: "01998154-0000-7000-8000-000000000002",
  connectionActive: "01998154-0000-7000-8000-000000000003",
} as const;
// [SCOPE 154 / T020] END

// [SCOPE 154 / T020] BEGIN — The SCOPE-132 Amendment H seed: autopilot + remote-access fixtures
export interface Scope132SeedResult {
  projectAutopilotOnId: string;
  projectRemoteOffId: string;
  connectionActiveId: string;
}

export const scope132Seed: Seed<Scope132SeedResult> = {
  name: "132-kain-autonomous-driver",
  requires: [baseSeed],

  async run(ctx: SeedContext, _resolved: SeedResults): Promise<Scope132SeedResult> {
    await ctx.db
      .insert(companyprojects)
      .values([
        {
          id: SCOPE132_IDS.projectAutopilotOn,
          userid: BASE_IDS.consultant,
          companyid: BASE_IDS.company,
          name: "Autopilot — already on",
          status: "ACTIVE",
          currentphase: "Design",
          allowremote: true,
          autopilotenabled: true,
        },
        {
          id: SCOPE132_IDS.projectRemoteOff,
          userid: BASE_IDS.consultant,
          companyid: BASE_IDS.company,
          name: "Autopilot — remote not allowed",
          status: "ACTIVE",
          currentphase: "Design",
          allowremote: false,
          autopilotenabled: false,
        },
      ])
      .onConflictDoNothing();

    await ctx.db
      .insert(projectagentconnections)
      .values({
        id: SCOPE132_IDS.connectionActive,
        projectid: SCOPE132_IDS.projectAutopilotOn,
        conversationid: "pretest-autopilot-conversation",
        agenttag: "kain",
        machine: "pretest-machine",
        repo: "wxKanban",
        kitversion: "0.0.0-pretest",
        state: "working",
        lastseenat: new Date(),
        disconnectedat: null,
        endreason: null,
        autopilotrunactive: true,
      })
      .onConflictDoNothing();

    return {
      projectAutopilotOnId: SCOPE132_IDS.projectAutopilotOn,
      projectRemoteOffId: SCOPE132_IDS.projectRemoteOff,
      connectionActiveId: SCOPE132_IDS.connectionActive,
    };
  },
};

export default scope132Seed;
// [SCOPE 154 / T020] END
