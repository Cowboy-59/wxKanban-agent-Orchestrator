import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  TEST_LIFECYCLE_TOOLS,
  TEST_LIFECYCLE_TOOL_DEFS,
  isTestLifecycleTool,
} from "../src/tools/test-lifecycle.js";

// [SCOPE 111 / T028] BEGIN — Registration parity
//
// Registering an MCP tool takes TWO edits: the advertised list in server.ts and
// PERMISSION_MATRIX in auth/role-checker.ts. Doing one without the other is not
// a loud failure — the tool simply reports "Unknown tool" at call time, which
// reads like a client problem and has cost real debugging time on this project
// before. This test makes the drift fail here instead.

const root = join(__dirname, "..");
const matrixSource = readFileSync(join(root, "src/auth/role-checker.ts"), "utf8");
const serverSource = readFileSync(join(root, "src/server.ts"), "utf8");

describe("SCOPE-111 MCP tool registration parity", () => {
  it.each(TEST_LIFECYCLE_TOOLS)("%s has a PERMISSION_MATRIX entry", (tool) => {
    expect(matrixSource).toContain(`'${tool}'`);
  });

  it.each(TEST_LIFECYCLE_TOOLS)("%s has an advertised tool definition", (tool) => {
    const def = TEST_LIFECYCLE_TOOL_DEFS.find((d) => d.name === tool);
    expect(def, `${tool} is missing from TEST_LIFECYCLE_TOOL_DEFS`).toBeDefined();
    expect(def?.description?.length ?? 0).toBeGreaterThan(40);
    expect(def?.inputSchema).toBeDefined();
  });

  it.each(TEST_LIFECYCLE_TOOLS)("%s is project-scoped", (tool) => {
    // Every one of these reads or writes project data, so none may escape the
    // scope guard that keeps one project's suite out of another's reach.
    expect(serverSource).toContain(`'${tool}'`);
  });

  it("routes exactly the declared tools to the handler", () => {
    for (const tool of TEST_LIFECYCLE_TOOLS) {
      expect(isTestLifecycleTool(tool)).toBe(true);
    }
    expect(isTestLifecycleTool("project.create_task")).toBe(false);
    expect(isTestLifecycleTool("project.upsert_test_planX")).toBe(false);
  });

  it("advertises no tool it cannot handle", () => {
    for (const def of TEST_LIFECYCLE_TOOL_DEFS) {
      expect(isTestLifecycleTool(def.name)).toBe(true);
    }
  });

  it("spreads the definitions into the advertised list", () => {
    // A definition array that exists but is never spread into ListTools would
    // pass every check above and still leave the tools invisible to clients.
    expect(serverSource).toContain("...TEST_LIFECYCLE_TOOL_DEFS");
  });

  it("wires the handler into the tool switch", () => {
    expect(serverSource).toContain("isTestLifecycleTool(name)");
    expect(serverSource).toContain("handleTestLifecycleTool");
  });
});

describe("SCOPE-111 tool contract", () => {
  it("requires a commit on the impact graph", () => {
    // The commit check is the only thing standing between a graph computed
    // against different code and confidently wrong Retest marking.
    const def = TEST_LIFECYCLE_TOOL_DEFS.find((d) => d.name === "project.report_change_impact");
    const graph = (def?.inputSchema as { properties?: { graph?: { required?: string[] } } })
      ?.properties?.graph;
    expect(graph?.required).toContain("commitsha");
  });

  it("tells the runner to declare the list before executing", () => {
    const def = TEST_LIFECYCLE_TOOL_DEFS.find((d) => d.name === "project.start_test_run");
    expect(def?.description).toMatch(/ordered list/i);
  });

  it("tells the runner that broad beats truncation", () => {
    const def = TEST_LIFECYCLE_TOOL_DEFS.find((d) => d.name === "project.report_change_impact");
    expect(def?.description).toMatch(/rather than truncating/i);
  });

  it("makes executor a required field when filing items", () => {
    const def = TEST_LIFECYCLE_TOOL_DEFS.find((d) => d.name === "project.upsert_test_plan");
    const items = (
      def?.inputSchema as {
        properties?: { items?: { items?: { required?: string[] } } };
      }
    )?.properties?.items?.items;
    expect(items?.required).toContain("executor");
  });
});
// [SCOPE 111 / T028] END
