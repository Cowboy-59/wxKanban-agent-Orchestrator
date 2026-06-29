// Spec 030 FR-015 — CLI adapter coverage. Tests the name-mapping table,
// customCommands pass-through, result-shape preservation, and the
// stage-only vs full-evaluation distinction.

import { describe, it, expect } from "vitest";
import { LifecycleStage } from "../../../core/schemas/lifecycle";
import { Capability } from "../../../core/policy/capabilities";
import {
  evaluateCommand,
  evaluateCommandAllowed,
  evaluateStageOnly,
  isSpecGatedCommand,
  getAllowedCommandsForStage,
} from "../../../core/policy/adapters/cli-adapter";

describe("cli-adapter — name mapping table", () => {
  // All 12 CLI command names must map to a Capability and be allowed in
  // the right phase. This is the executable spec of the CLI surface.
  const PAIRS: Array<{ command: string; allowedPhase: LifecycleStage | "all" }> = [
    { command: "buildscope", allowedPhase: LifecycleStage.Design },
    { command: "createspecs", allowedPhase: LifecycleStage.Design },
    { command: "implement", allowedPhase: LifecycleStage.Implementation },
    { command: "createtesttasks", allowedPhase: LifecycleStage.Implementation },
    { command: "runqa", allowedPhase: LifecycleStage.QATesting },
    { command: "runhuman", allowedPhase: LifecycleStage.HumanTesting },
    { command: "prepareRelease", allowedPhase: LifecycleStage.Beta },
    { command: "finalizeRelease", allowedPhase: LifecycleStage.Release },
    { command: "dbpush", allowedPhase: "all" },
    { command: "pipeline-agent", allowedPhase: "all" },
    { command: "auditfences", allowedPhase: "all" },
    { command: "kit:status", allowedPhase: "all" },
    { command: "wxconversion", allowedPhase: LifecycleStage.Design },
    { command: "wxconversionscope", allowedPhase: LifecycleStage.Design },
    { command: "cwconversion", allowedPhase: LifecycleStage.Design },
    { command: "cwconversionscope", allowedPhase: LifecycleStage.Design },
    { command: "vbconversion", allowedPhase: LifecycleStage.Design },
    { command: "vbconversionscope", allowedPhase: LifecycleStage.Design },
  ];

  for (const { command, allowedPhase } of PAIRS) {
    if (allowedPhase === "all") {
      it(`${command} is allowed in every phase (cross-cutting)`, () => {
        for (const phase of Object.values(LifecycleStage)) {
          const result = evaluateStageOnly(phase, command);
          expect(result.allowed).toBe(true);
        }
      });
    } else {
      it(`${command} is allowed in ${allowedPhase} and blocked elsewhere (stage-only)`, () => {
        for (const phase of Object.values(LifecycleStage)) {
          const result = evaluateStageOnly(phase, command);
          if (phase === allowedPhase) {
            expect(result.allowed).toBe(true);
          } else {
            expect(result.allowed).toBe(false);
            expect(result.reason).toBe(
              `Command '${command}' is not permitted in the '${phase}' stage.`,
            );
          }
        }
      });
    }
  }
});

describe("cli-adapter — PolicyEvaluation shape preservation", () => {
  it("returns all fields the legacy PolicyEvaluation interface defines", () => {
    const result = evaluateStageOnly(LifecycleStage.Design, "buildscope");
    expect(result).toMatchObject({
      allowed: true,
      stage: LifecycleStage.Design,
      command: "buildscope",
      requiresSpecCheck: false,
      overrideUsed: false,
    });
    expect(Array.isArray(result.allowedCommands)).toBe(true);
    expect(result.allowedCommands.length).toBeGreaterThan(0);
  });

  it("allowedCommands includes stage-allowed + cross-cutting + custom", () => {
    const result = evaluateStageOnly(LifecycleStage.Design, "buildscope", ["myCustom"]);
    expect(result.allowedCommands).toContain("buildscope");
    expect(result.allowedCommands).toContain("createspecs"); // Design stage
    expect(result.allowedCommands).toContain("dbpush"); // cross-cutting
    expect(result.allowedCommands).toContain("myCustom"); // custom
  });
});

describe("cli-adapter — customCommands pass-through", () => {
  it("custom command not in the mapping is allowed when in customCommands", () => {
    const result = evaluateStageOnly(LifecycleStage.Design, "myCustomCmd", ["myCustomCmd"]);
    expect(result.allowed).toBe(true);
  });

  it("command not in mapping AND not in customCommands is rejected", () => {
    const result = evaluateStageOnly(LifecycleStage.Design, "madeUpCommand");
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      "Command 'madeUpCommand' is not permitted in the 'Design' stage.",
    );
  });
});

describe("cli-adapter — full evaluateCommand (spec-first applies)", () => {
  it("blocks spec-gated command without verification", () => {
    const result = evaluateCommand(LifecycleStage.Implementation, "implement");
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/IMPLEMENTATION BLOCKED/);
  });

  it("allows spec-gated command with valid verification", () => {
    const result = evaluateCommand(
      LifecycleStage.Implementation,
      "implement",
      { specExists: true, tasksExist: true, documentsExist: true, specStatus: "tasks_generated" },
    );
    expect(result.allowed).toBe(true);
  });

  it("allows non-spec-gated command (cross-cutting) without verification", () => {
    const result = evaluateCommand(LifecycleStage.Beta, "dbpush");
    expect(result.allowed).toBe(true);
  });
});

describe("cli-adapter — isSpecGatedCommand", () => {
  it("returns true for spec-gated commands", () => {
    for (const cmd of [
      "implement",
      "createtesttasks",
      "runqa",
      "runhuman",
      "prepareRelease",
      "finalizeRelease",
    ]) {
      expect(isSpecGatedCommand(cmd)).toBe(true);
    }
  });

  it("returns false for non-spec-gated commands", () => {
    for (const cmd of [
      "buildscope",
      "createspecs",
      "dbpush",
      "pipeline-agent",
      "auditfences",
      "kit:status",
    ]) {
      expect(isSpecGatedCommand(cmd)).toBe(false);
    }
  });

  it("returns false for unknown commands", () => {
    expect(isSpecGatedCommand("not-a-real-command")).toBe(false);
  });
});

describe("cli-adapter — evaluateCommandAllowed (boolean shim)", () => {
  it("matches the .allowed field of evaluateCommand", () => {
    expect(evaluateCommandAllowed(LifecycleStage.Design, "buildscope")).toBe(true);
    expect(evaluateCommandAllowed(LifecycleStage.Implementation, "buildscope")).toBe(false);
  });
});

describe("cli-adapter — getAllowedCommandsForStage", () => {
  it("returns exactly the commands allowed in the given stage + cross-cutting", () => {
    const designCommands = getAllowedCommandsForStage(LifecycleStage.Design);
    expect(designCommands).toContain("buildscope");
    expect(designCommands).toContain("createspecs");
    expect(designCommands).toContain("dbpush"); // cross-cutting
    expect(designCommands).not.toContain("implement"); // wrong stage
  });

  it("includes custom commands when provided", () => {
    const cmds = getAllowedCommandsForStage(LifecycleStage.Design, ["customA", "customB"]);
    expect(cmds).toContain("customA");
    expect(cmds).toContain("customB");
  });
});
