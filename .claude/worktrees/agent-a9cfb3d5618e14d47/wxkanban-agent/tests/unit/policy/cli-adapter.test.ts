// Spec 030 FR-015 — CLI adapter coverage. Tests the name-mapping table,
// customCommands pass-through, result-shape preservation, and the
// stage-only vs full-evaluation distinction.
//
// SCOPE-123 — the stage in every call is the NAMED SCOPE's stage. Both CLI
// refusal sites (evaluateCommand, evaluateStageOnly) give an unknown command
// UNKNOWN_COMMAND and a stage-blocked one STAGE_DENIED, never the same string.

import { describe, it, expect } from "vitest";
import { LifecycleStage } from "../../../core/schemas/lifecycle";
import {
  describeCommands,
  evaluateCommand,
  evaluateCommandAllowed,
  evaluateStageOnly,
  getCommandScoping,
  isSpecGatedCommand,
  getAllowedCommandsForStage,
  ScopeStageFacts,
} from "../../../core/policy/adapters/cli-adapter";

function scopeIn(stage: LifecycleStage): ScopeStageFacts {
  return {
    scopeId: "scope-a",
    specNumber: "101",
    label: "SPEC-101",
    stage,
    taskCount: 3,
    openTaskCount: 1,
    blockers: [{ kind: "open_tasks", message: "1 of 3 tasks still open." }],
  };
}

describe("cli-adapter — name mapping table", () => {
  // Every CLI command maps to a Capability and runs in the right stages of the
  // scope it names. This is the executable spec of the CLI surface.
  const SCOPED: Array<{ command: string; stages: LifecycleStage[] }> = [
    { command: "implement", stages: [LifecycleStage.Implementation, LifecycleStage.QATesting, LifecycleStage.HumanTesting] },
    { command: "createtesttasks", stages: [LifecycleStage.Implementation] },
    { command: "runqa", stages: [LifecycleStage.QATesting] },
    { command: "runhuman", stages: [LifecycleStage.HumanTesting] },
    { command: "prepareRelease", stages: [LifecycleStage.Beta] },
    { command: "finalizeRelease", stages: [LifecycleStage.Release] },
  ];
  const ANY_STAGE = [
    "buildscope",
    // Amendment C, decision 10.
    "createspecs",
    "dbpush",
    "pipeline-agent",
    "auditfences",
    "kit:status",
    // SCOPE-095 Amendment A / T007 — bootstrap command, cross-cutting.
    "kit:configure",
    "scaffold:frontend",
    "archive:files",
    // SCOPE-123 FR-008 — scope-creating: what they make starts in Design.
    "wxconversion",
    "wxconversionscope",
    "cwconversion",
    "cwconversionscope",
    "vbconversion",
    "vbconversionscope",
  ];

  for (const command of ANY_STAGE) {
    it(`${command} runs with no scope named and on a scope in any stage`, () => {
      expect(evaluateStageOnly(undefined, command).allowed).toBe(true);
      for (const phase of Object.values(LifecycleStage)) {
        expect(evaluateStageOnly(scopeIn(phase), command).allowed).toBe(true);
      }
    });
  }

  for (const { command, stages } of SCOPED) {
    it(`${command} runs on a scope in ${stages.join("/")} and is STAGE_DENIED elsewhere`, () => {
      for (const phase of Object.values(LifecycleStage)) {
        const result = evaluateStageOnly(scopeIn(phase), command);
        if (stages.includes(phase)) {
          expect(result.allowed).toBe(true);
        } else {
          expect(result.allowed).toBe(false);
          expect(result.refusal?.code).toBe("STAGE_DENIED");
          expect(result.reason).toContain(`SPEC-101 is in ${phase}`);
          expect(result.reason).toContain("1 of 3 task(s) still open");
        }
      }
    });

    it(`${command} with no scope named is SCOPE_REQUIRED`, () => {
      const result = evaluateStageOnly(undefined, command);
      expect(result.allowed).toBe(false);
      expect(result.refusal?.code).toBe("SCOPE_REQUIRED");
    });
  }
});

describe("cli-adapter — PolicyEvaluation shape preservation", () => {
  it("returns all fields the legacy PolicyEvaluation interface defines", () => {
    const result = evaluateStageOnly(scopeIn(LifecycleStage.Implementation), "implement");
    expect(result).toMatchObject({
      allowed: true,
      stage: LifecycleStage.Implementation,
      command: "implement",
      requiresSpecCheck: true,
      overrideUsed: false,
    });
    expect(Array.isArray(result.allowedCommands)).toBe(true);
    expect(result.allowedCommands.length).toBeGreaterThan(0);
  });

  it("allowedCommands includes the scope stage's commands + every-stage commands + custom", () => {
    const result = evaluateStageOnly(scopeIn(LifecycleStage.Design), "createspecs", ["myCustom"]);
    expect(result.allowedCommands).toContain("buildscope");
    expect(result.allowedCommands).toContain("createspecs");
    expect(result.allowedCommands).toContain("dbpush");
    expect(result.allowedCommands).toContain("myCustom");
    expect(result.allowedCommands).not.toContain("runqa");
  });

  it("a command acting on no scope reports a null stage", () => {
    expect(evaluateStageOnly(undefined, "dbpush").stage).toBeNull();
  });
});

describe("cli-adapter — customCommands pass-through", () => {
  it("custom command not in the mapping is allowed when in customCommands", () => {
    const result = evaluateStageOnly(undefined, "myCustomCmd", ["myCustomCmd"]);
    expect(result.allowed).toBe(true);
  });
});

describe("SCOPE-123 FR-005 — unknown command vs stage denial, at both CLI refusal sites", () => {
  it("evaluateStageOnly: an unregistered command is UNKNOWN_COMMAND, naming no stage", () => {
    const result = evaluateStageOnly(scopeIn(LifecycleStage.Design), "madeUpCommand");
    expect(result.allowed).toBe(false);
    expect(result.refusal?.code).toBe("UNKNOWN_COMMAND");
    expect(result.reason).toMatch(/^UNKNOWN_COMMAND — 'madeUpCommand' is not a recognised command/);
    expect(result.reason).toContain("implement");
    expect(result.reason).not.toContain("Design");
    expect(result.stage).toBeNull();
  });

  it("evaluateCommand: same", () => {
    // HumanTesting appears in no command name, so its absence is meaningful.
    const result = evaluateCommand(scopeIn(LifecycleStage.HumanTesting), "madeUpCommand");
    expect(result.refusal?.code).toBe("UNKNOWN_COMMAND");
    expect(result.reason).not.toMatch(/\bHumanTesting\b/);
  });

  it("the two strings are not equal — the failure behind report bd756151", () => {
    const unknown = evaluateStageOnly(scopeIn(LifecycleStage.Design), "kit:configur").reason;
    const denied = evaluateStageOnly(scopeIn(LifecycleStage.Design), "runqa").reason;
    expect(unknown).toBeDefined();
    expect(denied).toBeDefined();
    expect(unknown).not.toBe(denied);
    expect(unknown).not.toMatch(/not permitted in the/);
  });
});

describe("cli-adapter — full evaluateCommand (spec-first applies)", () => {
  it("blocks spec-gated command without verification", () => {
    const result = evaluateCommand(scopeIn(LifecycleStage.Implementation), "implement");
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/IMPLEMENTATION BLOCKED/);
  });

  it("allows spec-gated command with valid verification", () => {
    const result = evaluateCommand(scopeIn(LifecycleStage.Implementation), "implement", {
      specExists: true,
      tasksExist: true,
      documentsExist: true,
      specStatus: "tasks_generated",
    });
    expect(result.allowed).toBe(true);
  });

  it("allows non-spec-gated command (cross-cutting) without verification or scope", () => {
    expect(evaluateCommand(undefined, "dbpush").allowed).toBe(true);
  });
});

describe("cli-adapter — isSpecGatedCommand", () => {
  it("returns true for spec-gated commands", () => {
    for (const cmd of ["implement", "createtesttasks", "runqa", "runhuman", "prepareRelease", "finalizeRelease"]) {
      expect(isSpecGatedCommand(cmd)).toBe(true);
    }
  });

  it("returns false for non-spec-gated commands", () => {
    for (const cmd of ["buildscope", "createspecs", "dbpush", "pipeline-agent", "auditfences", "kit:status"]) {
      expect(isSpecGatedCommand(cmd)).toBe(false);
    }
  });

  it("returns false for unknown commands", () => {
    expect(isSpecGatedCommand("not-a-real-command")).toBe(false);
  });
});

describe("cli-adapter — evaluateCommandAllowed (boolean shim)", () => {
  it("matches the .allowed field of evaluateCommand", () => {
    expect(evaluateCommandAllowed(scopeIn(LifecycleStage.QATesting), "createspecs")).toBe(true);
    expect(evaluateCommandAllowed(scopeIn(LifecycleStage.Implementation), "runqa")).toBe(false);
    expect(evaluateCommandAllowed(undefined, "buildscope")).toBe(true);
  });
});

describe("cli-adapter — getAllowedCommandsForStage", () => {
  it("returns the commands a scope in the given stage can run", () => {
    const designCommands = getAllowedCommandsForStage(LifecycleStage.Design);
    expect(designCommands).toContain("buildscope");
    expect(designCommands).toContain("createspecs");
    expect(designCommands).toContain("dbpush");
    expect(designCommands).not.toContain("implement");
    expect(getAllowedCommandsForStage(LifecycleStage.QATesting)).toContain("implement");
  });

  it("includes custom commands when provided", () => {
    const cmds = getAllowedCommandsForStage(LifecycleStage.Design, ["customA", "customB"]);
    expect(cmds).toContain("customA");
    expect(cmds).toContain("customB");
  });
});

describe("SCOPE-123 FR-008 — classification surfaces", () => {
  it("getCommandScoping classifies every registered command and returns null for unknown ones", () => {
    expect(getCommandScoping("implement")).toBe("scoped");
    expect(getCommandScoping("buildscope")).toBe("scope-creating");
    expect(getCommandScoping("dbpush")).toBe("cross-cutting");
    expect(getCommandScoping("nope")).toBeNull();
  });

  it("describeCommands lists every command with its stages, none with a project stage", () => {
    const described = describeCommands(["mine"]);
    expect(described.find((d) => d.command === "implement")!.stages).toEqual([
      LifecycleStage.Implementation,
      LifecycleStage.QATesting,
      LifecycleStage.HumanTesting,
    ]);
    expect(described.find((d) => d.command === "buildscope")!.stages).toEqual([]);
    expect(described.find((d) => d.command === "mine")!.scoping).toBe("custom");
  });
});
