// Spec 030 FR-015 — MCP adapter coverage. Tests:
// - Live MCP tool names (3 registered handlers) map to the correct Capability
//   and gate correctly across phases.
// - Inert MCP tool names (9 reserved for the parity scope) still resolve
//   correctly — when the parity scope registers the handlers, gate behavior
//   is already validated.
// - Unmapped tool names pass through ungated (preserves enforceStage behavior
//   for the 30+ non-gated MCP tools).
// - Resolvers are stubbed; adapter is tested as a pure function over those
//   stubs. No live DB.

import { describe, it, expect } from "vitest";
import {
  enforceTool,
  McpDbClient,
} from "../../../core/policy/adapters/mcp-adapter";

// Stub DB client that returns canned rows. Each test constructs a stub
// configured for the specific scenario it exercises.
function stubDb(handlers: {
  // SELECT phasename FROM projectphases ...
  activePhase?: string | null;
  // SELECT id FROM companyprojects ...
  projectExists?: boolean;
  // SELECT id, status FROM projectspecifications ... (active scope)
  activeScope?: { id: string; status: string } | null;
  // COUNT(*) FROM projecttasks WHERE specid = ...
  taskCount?: number;
  // COUNT(*) FROM projectdocuments WHERE specid = ...
  docCount?: number;
}): McpDbClient {
  return {
    query: async <T>(sql: string, _params?: unknown[]): Promise<{ rows: T[] }> => {
      if (/FROM projectphases/i.test(sql)) {
        if (handlers.activePhase) {
          return { rows: [{ phasename: handlers.activePhase } as unknown as T] };
        }
        return { rows: [] };
      }
      if (/FROM companyprojects/i.test(sql)) {
        if (handlers.projectExists === false) return { rows: [] };
        return { rows: [{ id: "stub-project-id" } as unknown as T] };
      }
      if (/FROM projectspecifications/i.test(sql)) {
        if (handlers.activeScope === null || handlers.activeScope === undefined) {
          return { rows: [] };
        }
        return { rows: [handlers.activeScope as unknown as T] };
      }
      if (/FROM projecttasks/i.test(sql)) {
        return { rows: [{ c: String(handlers.taskCount ?? 0) } as unknown as T] };
      }
      if (/FROM projectdocuments/i.test(sql)) {
        return { rows: [{ c: String(handlers.docCount ?? 0) } as unknown as T] };
      }
      throw new Error(`Unexpected query in stub: ${sql.slice(0, 80)}`);
    },
  };
}

describe("mcp-adapter — currently-registered tools", () => {
  it("project.buildscope is allowed when active phase is Design", async () => {
    const db = stubDb({ activePhase: "Design" });
    const result = await enforceTool(db, "test-project", "project.buildscope");
    expect(result.allowed).toBe(true);
    expect(result.currentStage).toBe("Design");
    expect(result.requestedTool).toBe("project.buildscope");
  });

  it("project.buildscope is blocked when active phase is Implementation", async () => {
    const db = stubDb({ activePhase: "Implementation" });
    const result = await enforceTool(db, "test-project", "project.buildscope");
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/Command 'buildscope' is not permitted in the 'Implementation' stage/);
  });

  it("project.create_specs uses CLI displayName 'createspecs' in messages", async () => {
    const db = stubDb({ activePhase: "Implementation" });
    const result = await enforceTool(db, "test-project", "project.create_specs");
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/Command 'createspecs'/);
  });

  it("project.implement allowed in Implementation with valid spec verification", async () => {
    const db = stubDb({
      activePhase: "Implementation",
      activeScope: { id: "scope-1", status: "tasks_generated" },
      taskCount: 5,
      docCount: 2,
    });
    const result = await enforceTool(db, "test-project", "project.implement");
    expect(result.allowed).toBe(true);
  });

  it("project.implement blocked when active scope has no tasks (FR-008 spec-first now applies to MCP)", async () => {
    const db = stubDb({
      activePhase: "Implementation",
      activeScope: { id: "scope-1", status: "tasks_generated" },
      taskCount: 0,
      docCount: 2,
    });
    const result = await enforceTool(db, "test-project", "project.implement");
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/Missing: tasks/);
  });

  it("project.implement blocked when no active scope is found (corner case)", async () => {
    const db = stubDb({
      activePhase: "Implementation",
      activeScope: null,
    });
    const result = await enforceTool(db, "test-project", "project.implement");
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/Missing: spec, tasks, documents/);
  });
});

describe("mcp-adapter — inert tools (registered in policy, handler pending parity scope)", () => {
  it("project.runqa resolves to RunQa and gates correctly", async () => {
    const db = stubDb({
      activePhase: "QA",
      activeScope: { id: "scope-1", status: "tasks_generated" },
      taskCount: 5,
      docCount: 2,
    });
    const result = await enforceTool(db, "test-project", "project.runqa");
    expect(result.allowed).toBe(true);
  });

  it("project.runqa blocked in wrong phase", async () => {
    const db = stubDb({ activePhase: "Design" });
    const result = await enforceTool(db, "test-project", "project.runqa");
    expect(result.allowed).toBe(false);
  });

  it("project.dbpush allowed in any phase (cross-cutting)", async () => {
    for (const phase of ["Design", "Implementation", "QA", "HumanTesting", "Beta", "Release"]) {
      const db = stubDb({ activePhase: phase });
      const result = await enforceTool(db, "test-project", "project.dbpush");
      expect(result.allowed).toBe(true);
    }
  });
});

describe("mcp-adapter — unmapped tool pass-through", () => {
  it("project.help passes through ungated", async () => {
    const db = stubDb({});
    const result = await enforceTool(db, "test-project", "project.help");
    expect(result.allowed).toBe(true);
    expect(result.currentStage).toBe(null);
    expect(result.requestedTool).toBe("project.help");
  });

  it("project.create_task (an existing non-gated tool) passes through", async () => {
    const db = stubDb({});
    const result = await enforceTool(db, "test-project", "project.create_task");
    expect(result.allowed).toBe(true);
  });

  it("totally fictional tool name passes through (legacy enforceStage behavior)", async () => {
    const db = stubDb({});
    const result = await enforceTool(db, "test-project", "project.imaginary_tool");
    expect(result.allowed).toBe(true);
  });
});

describe("mcp-adapter — corner cases", () => {
  it("project not found returns allowed=false with error message", async () => {
    const db = stubDb({ projectExists: false });
    const result = await enforceTool(db, "missing-project", "project.buildscope");
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/Project 'missing-project' not found/);
  });

  it("no active phase defaults to Design (kit-wide default for fresh projects)", async () => {
    const db = stubDb({ projectExists: true });
    const result = await enforceTool(db, "test-project", "project.buildscope");
    // Defaults to Design; project.buildscope is Design-allowed
    expect(result.allowed).toBe(true);
  });
});
