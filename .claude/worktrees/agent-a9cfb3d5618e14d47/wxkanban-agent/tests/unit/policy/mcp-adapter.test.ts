// Spec 030 FR-015 — MCP adapter coverage, rewritten for SCOPE-123.
//
// The gate resolves the stage of the SCOPE the tool call names (specNumber /
// specId), never a project-wide value. The fake database throws if any gate
// path reads `projectphases`, so the old project-stage read cannot creep back.

import { describe, it, expect } from "vitest";
import { enforceTool } from "../../../core/policy/adapters/mcp-adapter";
import { advanceScope, ScopeGateChecker } from "../../../core/stage/scope-stage";
import { LifecycleStage } from "../../../core/schemas/lifecycle";
import { FakeStageDb } from "../stage/fake-stage-db";

const allClear: ScopeGateChecker = async () => ({ passed: true, skipped: false, itemCount: 1, blocking: [] });
const advanceOpts = { gates: allClear, actor: "t", source: "test", trigger: "task_status" };

// Two scopes in one project: A in Implementation (tasks open), B in Design (no tasks).
async function twoScopes(): Promise<FakeStageDb> {
  const db = new FakeStageDb();
  db.addSpec({ id: "a", specnumber: "101", status: "implementing" });
  db.addSpec({ id: "b", specnumber: "102", status: "draft" });
  db.addTasks("a", ["todo", "done"]);
  db.documents.push({ specid: "a" });
  await advanceScope(db, "a", advanceOpts);
  return db;
}

describe("SCOPE-123 FR-001 — two scopes at different stages each accept their own stage's commands", () => {
  it("project.implement on SCOPE-A (Implementation) is allowed while SCOPE-B sits in Design", async () => {
    const db = await twoScopes();
    const result = await enforceTool(db, "project-1", "project.implement", { args: { specNumber: "101" } });
    expect(result.allowed).toBe(true);
    expect(result.currentStage).toBe(LifecycleStage.Implementation);
  });

  it("project.runqa on SCOPE-B (Design) is refused while implement on SCOPE-A runs, in the same session", async () => {
    const db = await twoScopes();
    const result = await enforceTool(db, "project-1", "project.runqa", { args: { specNumber: "102" } });
    expect(result.allowed).toBe(false);
    expect(result.currentStage).toBe(LifecycleStage.Design);
  });

  it("the same implement against SCOPE-B is refused, naming SCOPE-B and its stage", async () => {
    const db = await twoScopes();
    const result = await enforceTool(db, "project-1", "project.implement", { args: { specNumber: "102" } });
    expect(result.allowed).toBe(false);
    expect(result.refusal?.code).toBe("STAGE_DENIED");
    expect(result.reason).toContain("SPEC-102 is in Design");
    expect(result.reason).toContain("0 of 0 task(s) still open");
  });

  it("neither decision changed either scope", async () => {
    const db = await twoScopes();
    const before = JSON.stringify(db.phases);
    await enforceTool(db, "project-1", "project.implement", { args: { specNumber: "101" } });
    await enforceTool(db, "project-1", "project.implement", { args: { specNumber: "102" } });
    expect(JSON.stringify(db.phases)).toBe(before);
  });

  it("no gate path reads projectphases (the fake throws if one does)", async () => {
    const db = await twoScopes();
    for (const tool of ["project.implement", "project.create_specs", "project.buildscope", "project.dbpush", "project.runqa"]) {
      await enforceTool(db, "project-1", tool, { args: { specNumber: "101" } });
    }
    expect(db.statements.some((s) => /projectphases/.test(s))).toBe(false);
  });
});

describe("SCOPE-123 FR-001 / SPEC-136 T019 — verification checks the NAMED scope", () => {
  it("two specs in progress no longer block each other's implement", async () => {
    const db = await twoScopes();
    db.addSpec({ id: "c", specnumber: "103", status: "implementing" });
    db.addTasks("c", ["todo"]);
    db.documents.push({ specid: "c" });
    await advanceScope(db, "c", advanceOpts);
    for (const specNumber of ["101", "103"]) {
      const result = await enforceTool(db, "project-1", "project.implement", { args: { specNumber } });
      expect(result.allowed).toBe(true);
    }
  });

  it("implement on a named scope with no documents is blocked for that reason", async () => {
    const db = await twoScopes();
    db.documents = [];
    const result = await enforceTool(db, "project-1", "project.implement", { args: { specNumber: "101" } });
    expect(result.allowed).toBe(false);
    expect(result.refusal?.code).toBe("SPEC_UNVERIFIED");
    expect(result.reason).toContain("Missing: documents");
  });

  it("implement naming no scope is SCOPE_REQUIRED, not judged on a project value", async () => {
    const db = await twoScopes();
    const result = await enforceTool(db, "project-1", "project.implement", { args: {} });
    expect(result.allowed).toBe(false);
    expect(result.refusal?.code).toBe("SCOPE_REQUIRED");
  });

  it("create_specs for a scope not created yet reads as Design and is allowed", async () => {
    const db = await twoScopes();
    const result = await enforceTool(db, "project-1", "project.create_specs", { args: { specNumber: "150" } });
    expect(result.allowed).toBe(true);
    expect(result.currentStage).toBeNull();
  });
});

describe("SCOPE-123 FR-013 — implement runs in QA for fix work", () => {
  it("a scope in QA accepts implement", async () => {
    const db = new FakeStageDb();
    db.addSpec({ id: "q", specnumber: "201", status: "qa" });
    db.addTasks("q", ["done"]);
    db.documents.push({ specid: "q" });
    await advanceScope(db, "q", { ...advanceOpts, gates: async () => ({ passed: false, skipped: false, itemCount: 1, blocking: [{ itemKey: "MT-1", title: "x", why: "failing" }] }) });
    const result = await enforceTool(db, "project-1", "project.implement", { args: { specNumber: "201" } });
    expect(result.currentStage).toBe(LifecycleStage.QATesting);
    expect(result.allowed).toBe(true);
  });
});

describe("SCOPE-123 FR-010 — a refusal names the open gate when the server passes its gate", () => {
  it("names the missing machine tests on a QA scope", async () => {
    const db = new FakeStageDb();
    db.addSpec({ id: "q", specnumber: "201", status: "qa" });
    db.addTasks("q", ["done"]);
    db.documents.push({ specid: "q" });
    const noTests: ScopeGateChecker = async () => ({ passed: true, skipped: false, itemCount: 0, blocking: [] });
    await advanceScope(db, "q", { ...advanceOpts, gates: noTests });
    const result = await enforceTool(db, "project-1", "project.runhuman", { args: { specNumber: "201" }, gates: noTests });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("/wxCreateTestPlan");
  });
});

describe("mcp-adapter — scope-creating, cross-cutting and unmapped tools", () => {
  it("project.buildscope runs whatever stage the scopes are in, scope named or not", async () => {
    const db = await twoScopes();
    expect((await enforceTool(db, "project-1", "project.buildscope", {})).allowed).toBe(true);
    expect((await enforceTool(db, "project-1", "project.buildscope", { args: { editSpecNumber: "101" } })).allowed).toBe(true);
  });

  it("conversion tools run in every stage", async () => {
    const db = await twoScopes();
    for (const tool of ["project.wxconversion", "project.wxconversionscope"]) {
      expect((await enforceTool(db, "project-1", tool, {})).allowed).toBe(true);
    }
  });

  it("cross-cutting tools are allowed and report no stage", async () => {
    const db = await twoScopes();
    const result = await enforceTool(db, "project-1", "project.dbpush", {});
    expect(result.allowed).toBe(true);
    expect(result.currentStage).toBeNull();
  });

  it("unmapped tools pass through ungated without touching the database", async () => {
    const db = await twoScopes();
    const before = db.statements.length;
    for (const tool of ["project.help", "project.create_task", "project.imaginary_tool"]) {
      const result = await enforceTool(db, "project-1", tool);
      expect(result.allowed).toBe(true);
      expect(result.currentStage).toBeNull();
    }
    expect(db.statements.length).toBe(before);
  });

  it("a mapped tool on an unknown project is refused with ProjectNotFoundError's message", async () => {
    const db = await twoScopes();
    const result = await enforceTool(db, "missing-project", "project.buildscope", {});
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("missing-project");
  });

  it("uses the CLI display name in messages", async () => {
    const db = await twoScopes();
    db.addSpec({ id: "i", specnumber: "300" });
    db.addTasks("i", ["todo"]);
    await advanceScope(db, "i", advanceOpts);
    const result = await enforceTool(db, "project-1", "project.runqa", { args: { specNumber: "300" } });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("'runqa'");
  });
});

describe("SCOPE-123 Amendment C — createspecs re-pushes an amended scope in any stage", () => {
  it("project.create_specs on a scope already in Implementation is allowed", async () => {
    const db = await twoScopes();
    const result = await enforceTool(db, "project-1", "project.create_specs", { args: { specNumber: "101" } });
    expect(result.allowed).toBe(true);
  });
});

describe("SCOPE-123 Amendment C, decision 9 — an untracked scope is judged on its inferred stage", () => {
  it("implement on a scope with open tasks and NO stage row is allowed (no deploy-day regression), and nothing is written", async () => {
    const db = new FakeStageDb();
    db.addSpec({ id: "u", specnumber: "400", status: "implementing" });
    db.addTasks("u", ["todo", "done"]);
    db.documents.push({ specid: "u" });
    const result = await enforceTool(db, "project-1", "project.implement", { args: { specNumber: "400" } });
    expect(result.allowed).toBe(true);
    expect(result.currentStage).toBe(LifecycleStage.Implementation);
    expect(db.phases).toHaveLength(0);
  });

  it("a refusal on an untracked scope says its stage is inferred and how to record it", async () => {
    const db = new FakeStageDb();
    db.addSpec({ id: "u", specnumber: "400" });
    db.addTasks("u", ["todo"]);
    const result = await enforceTool(db, "project-1", "project.runqa", { args: { specNumber: "400" } });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("inferred");
  });
});

describe("SCOPE-123 review fixes — tenancy and inactive scopes", () => {
  it("refuses a gated tool naming a project other than the token's, before reading anything", async () => {
    const db = await twoScopes();
    const before = db.statements.length;
    const result = await enforceTool(db, "project-1", "project.implement", {
      args: { specNumber: "101" },
      boundProjectId: "project-2",
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("scope-mismatch");
    expect(result.reason).not.toContain("SPEC-101");
    expect(db.statements.length).toBe(before);
  });

  it("the token's own project passes the tenancy check", async () => {
    const db = await twoScopes();
    const result = await enforceTool(db, "project-1", "project.implement", {
      args: { specNumber: "101" },
      boundProjectId: "project-1",
    });
    expect(result.allowed).toBe(true);
  });

  it("refuses implement on an archived scope with SCOPE_INACTIVE", async () => {
    const db = new FakeStageDb();
    db.addSpec({ id: "x", specnumber: "500", status: "archived" });
    db.addTasks("x", ["todo"]);
    db.documents.push({ specid: "x" });
    const result = await enforceTool(db, "project-1", "project.implement", { args: { specNumber: "500" } });
    expect(result.allowed).toBe(false);
    expect(result.refusal?.code).toBe("SCOPE_INACTIVE");
  });
});
