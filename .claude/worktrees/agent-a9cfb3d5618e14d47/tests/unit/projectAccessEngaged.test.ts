// SPEC-143 T031 / FR-019 — companyReachesProject: owner, or a consultant with a live engagement.
// The db client is mocked; nothing here opens a connection (the local .env points at production).
import { describe, it, expect, vi, beforeEach } from "vitest";

/** Live engagements as the SQL would find them: (consultant, client, project). */
interface Assignment {
  consultant: string;
  client: string;
  projectid: string;
  state: "active" | "ended";
  removed: boolean;
}
let assignments: Assignment[] = [];
const queries: string[] = [];

vi.mock("../../src/db/client.js", () => ({
  db: {
    execute: (q: { queryChunks: unknown[] }) => {
      const chunks = q.queryChunks;
      queries.push(JSON.stringify(chunks));
      // Params arrive in order: project id, consulting company, client company.
      const params = chunks.filter((c) => typeof c === "string") as string[];
      const [projectid, consultant, client] = params;
      const live = assignments.some(
        (a) => a.projectid === projectid && a.consultant === consultant && a.client === client && a.state !== "ended" && !a.removed,
      );
      return Promise.resolve({ rows: live ? [{ "?column?": 1 }] : [] });
    },
  },
}));

import { companyReachesProject } from "../../src/server/lib/projectAccess.js";

const ECM = "01a19dd8-3328-72dd-ab0e-db65af4a49e7";
const HAS = "019d4ff7-527e-7627-92a0-13eaf5e16ee8";
const OTHER = "0192f0a8-0000-7000-8000-00000000ffff";
const BREEZE = { id: "65094501-deb6-4170-962c-fd2abeac2d67", companyid: ECM };

beforeEach(() => {
  assignments = [{ consultant: HAS, client: ECM, projectid: BREEZE.id, state: "active", removed: false }];
  queries.length = 0;
});

// [SCOPE 143 / T031] BEGIN — companyReachesProject tests (FR-019)
describe("companyReachesProject (FR-019)", () => {
  it("the owner company reaches its project without a query", async () => {
    expect(await companyReachesProject(ECM, BREEZE)).toBe(true);
    expect(queries).toHaveLength(0);
  });

  it("a consultant with a live engagement on the project reaches it", async () => {
    expect(await companyReachesProject(HAS, BREEZE)).toBe(true);
    expect(queries[0]).toContain("e.state <> 'ended'");
    expect(queries[0]).toContain("ea.removedat IS NULL");
  });

  it("a company with no engagement does not", async () => {
    expect(await companyReachesProject(OTHER, BREEZE)).toBe(false);
  });

  it("an ended engagement or a removed assignment does not", async () => {
    assignments = [{ consultant: HAS, client: ECM, projectid: BREEZE.id, state: "ended", removed: false }];
    expect(await companyReachesProject(HAS, BREEZE)).toBe(false);
    assignments = [{ consultant: HAS, client: ECM, projectid: BREEZE.id, state: "active", removed: true }];
    expect(await companyReachesProject(HAS, BREEZE)).toBe(false);
  });

  it("an engagement on another project of the same client does not", async () => {
    assignments = [{ consultant: HAS, client: ECM, projectid: "0192f0a8-0000-7000-8000-000000000abc", state: "active", removed: false }];
    expect(await companyReachesProject(HAS, BREEZE)).toBe(false);
  });

  it("a caller with no company never reaches anything", async () => {
    expect(await companyReachesProject(undefined, BREEZE)).toBe(false);
  });
});
// [SCOPE 143 / T031] END
