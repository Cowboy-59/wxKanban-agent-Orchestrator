import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// [SCOPE 043 / T031] BEGIN — FR-027: the feedback tool says who the channel is for
//
// The tool description is the only text a free-form agent reads before calling
// project.submit_feedback. When it said "submit a bug report" with no owner, an
// agent filed a defect in its OWN application here, and FR-010 routed it to the
// vendor's queue, where nobody could fix it (feedback 3e394ca1). server.ts cannot
// be imported offline, so this reads the advertised definition from source, the
// same way tool-matrix-parity.test.ts does.

const serverSource = readFileSync(join(__dirname, "..", "src/server.ts"), "utf8");

function advertisedDescription(tool: string): string {
  const start = serverSource.indexOf(`name: '${tool}'`);
  expect(start, `${tool} is not advertised in server.ts`).toBeGreaterThan(-1);
  const block = serverSource.slice(start, serverSource.indexOf("inputSchema:", start));
  const match = block.match(/description:\s*\n?\s*"([^"]+)"/);
  expect(match, `${tool} has no double-quoted description literal`).not.toBeNull();
  return match?.[1] ?? "";
}

describe("SCOPE-043 FR-027 project.submit_feedback names its owner", () => {
  const description = advertisedDescription("project.submit_feedback");

  it("says the channel is for wxKanban itself", () => {
    expect(description).toContain("wxKanban itself");
  });

  it("says the report goes to the wxKanban team, not the caller's project", () => {
    expect(description).toContain("not to your project");
  });

  it("turns away a defect in the caller's own application", () => {
    expect(description).toContain("Do NOT use this for a bug in the application you are building");
  });

  it("names where the caller's own defect belongs instead", () => {
    expect(description).toContain("project.create_task");
  });
});
// [SCOPE 043 / T031] END
