// Base seed — the company, consultant and project that almost every scope needs.
//
// WHY DETERMINISTIC IDS
// Two reasons, both practical. Assertions can name a row without querying for it first,
// and — more importantly — when the operator opens the app against the clone, the same
// company and user appear every run. A screen full of freshly-random UUIDs is
// technically seeded and practically unreadable.
//
// The IDs below are fixed UUID v7 values with a recognisable prefix so they are obvious
// as fixtures in a log or a URL, and can never collide with production rows.

import { companies } from "../../../src/db/schema/company.js";
import { userprofiles } from "../../../src/db/schema/userprofiles.js";
import type { Seed, SeedContext } from "../harness.js";

// [SCOPE 120 / T005] BEGIN — Fixed identities for the base fixture rows
export const BASE_IDS = {
  company: "01998000-0000-7000-8000-000000000001",
  consultant: "01998000-0000-7000-8000-000000000002",
  teamMember: "01998000-0000-7000-8000-000000000003",
} as const;

/**
 * bcrypt hash of "pretest-password". Fixed rather than generated so a seeded run is
 * reproducible and the operator can actually log in as the fixture user to look around.
 * Only ever written to a wxktest_ clone.
 */
export const BASE_PASSWORD_HASH =
  "$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";
// [SCOPE 120 / T005] END

// [SCOPE 120 / T005] BEGIN — The base seed: one company, one consultant, one team member
export interface BaseSeedResult {
  companyId: string;
  consultantId: string;
  teamMemberId: string;
}

export const baseSeed: Seed<BaseSeedResult> = {
  name: "_base",

  async run(ctx: SeedContext): Promise<BaseSeedResult> {
    // onConflictDoNothing keeps the seed idempotent, so re-running against a clone that
    // already carries it is harmless — the same property the migrations rely on.
    await ctx.db
      .insert(companies)
      .values({
        id: BASE_IDS.company,
        name: "Pre-Test Consulting",
        contactemail: "base@pretest.invalid",
        billingplan: "CONSULTANT",
        maxusers: 25,
        activeflag: true,
        billingexempt: true,
      })
      .onConflictDoNothing();

    await ctx.db
      .insert(userprofiles)
      .values([
        {
          id: BASE_IDS.consultant,
          emailaddr: "consultant@pretest.invalid",
          password: BASE_PASSWORD_HASH,
          companyid: BASE_IDS.company,
          // TEAM_MANAGER, not "CONSULTANT" — the latter is a valid *billingplan* but not
          // a usertype. Live values are TEAM_MANAGER / TEAM_MEMBER / ADMIN / SYSADMIN,
          // and no check constraint enforces that, so an invented value would insert
          // cleanly and then fail somewhere far away.
          usertype: "TEAM_MANAGER",
          securitylevel: 3,
          active: true,
        },
        {
          id: BASE_IDS.teamMember,
          emailaddr: "member@pretest.invalid",
          password: BASE_PASSWORD_HASH,
          companyid: BASE_IDS.company,
          usertype: "TEAM_MEMBER",
          securitylevel: 7,
          active: true,
        },
      ])
      .onConflictDoNothing();

    return {
      companyId: BASE_IDS.company,
      consultantId: BASE_IDS.consultant,
      teamMemberId: BASE_IDS.teamMember,
    };
  },
};

export default baseSeed;
// [SCOPE 120 / T005] END
