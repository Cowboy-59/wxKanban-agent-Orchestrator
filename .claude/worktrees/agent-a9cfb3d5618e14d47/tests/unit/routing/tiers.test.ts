// SPEC-143 / T008, T009 — tier table reader and escalation (FR-005, FR-006, contract C2).
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { escalate, escalateTask, kitDefaults, parseYamlSubset, readRoutingSettings, resolveTier, shouldEscalate } from "../../../_wxAI/routing/tiers.mjs";

let root = "";
const writeSettings = (text: string) => {
  mkdirSync(join(root, "decisions"), { recursive: true });
  writeFileSync(join(root, "decisions", "settings.yaml"), text);
};
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "routing-tiers-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("kit default", () => {
  it("is easy Haiku, moderate Sonnet, heavy Opus", () => {
    expect(kitDefaults().tiers).toEqual({ easy: "claude-haiku-5-5", moderate: "claude-sonnet-5-5", heavy: "claude-opus-5-5" });
  });

  it("declares the starting command list", () => {
    const { commands } = kitDefaults();
    expect(commands).toMatchObject({ dbpush: "easy", "kit:status": "easy", auditfences: "easy", wxLedger: "moderate", help: "moderate", buildscope: "heavy", createSpecs: "heavy", "wxG-O-D": "heavy", implement: "heavy" });
  });
});

describe("resolveTier", () => {
  it("a project with no settings file gets the kit default", () => {
    expect(resolveTier({ difficulty: "easy", root })).toEqual({ model: "claude-haiku-5-5", tier: "easy", source: "kit" });
    expect(resolveTier({ difficulty: "moderate", root })).toEqual({ model: "claude-sonnet-5-5", tier: "moderate", source: "kit" });
    expect(resolveTier({ difficulty: "heavy", root })).toEqual({ model: "claude-opus-5-5", tier: "heavy", source: "kit" });
  });

  it("a settings file with only SPEC-142 sections gets the kit default", () => {
    writeSettings("gate:\n  mode: enforce\n  matchThreshold: 0.8\nminimalCode:\n  level: lite\nlinks:\n  - ../other\n");
    expect(resolveTier({ difficulty: "heavy", root })).toEqual({ model: "claude-opus-5-5", tier: "heavy", source: "kit" });
  });

  it("a project override wins per key; missing keys fall back to the kit", () => {
    writeSettings("gate:\n  mode: observe\nmodels:\n  tiers:\n    easy: claude-sonnet-5-5   # we prefer Sonnet for small work\n");
    expect(resolveTier({ difficulty: "easy", root })).toEqual({ model: "claude-sonnet-5-5", tier: "easy", source: "project" });
    expect(resolveTier({ difficulty: "heavy", root })).toEqual({ model: "claude-opus-5-5", tier: "heavy", source: "kit" });
  });

  it("a command uses its declared tier; the project commands entry wins", () => {
    expect(resolveTier({ command: "dbpush", root })).toEqual({ model: "claude-haiku-5-5", tier: "easy", source: "kit" });
    expect(resolveTier({ command: "/implement", root }).tier).toBe("heavy");
    expect(resolveTier({ command: "createspecs", root }).tier).toBe("heavy");
    writeSettings('models:\n  commands:\n    dbpush: moderate\n    "kit:status": heavy\n    auditfences: bogus\n');
    expect(resolveTier({ command: "dbpush", root })).toEqual({ model: "claude-sonnet-5-5", tier: "moderate", source: "project" });
    expect(resolveTier({ command: "kit:status", root }).tier).toBe("heavy");
    expect(resolveTier({ command: "auditfences", root }).tier).toBe("easy"); // invalid override ignored
  });

  it("an explicit difficulty wins over the command's tier", () => {
    expect(resolveTier({ difficulty: "easy", command: "implement", root }).tier).toBe("easy");
  });

  it("an undeclared command is moderate", () => {
    expect(resolveTier({ command: "someNewCommand", root }).tier).toBe("moderate");
  });

  it("a settings file that will not parse falls back to the kit default", () => {
    writeSettings("models:\n  tiers:\n    easy: [unclosed\n");
    expect(resolveTier({ difficulty: "easy", root })).toEqual({ model: "claude-haiku-5-5", tier: "easy", source: "kit" });
    expect(readRoutingSettings(root).readable).toBe(false);
  });

  it("rejects a bad difficulty and a call with nothing to resolve", () => {
    expect(() => resolveTier({ difficulty: "extreme" as never, root })).toThrow(TypeError);
    expect(() => resolveTier({ root })).toThrow(TypeError);
  });
});

describe("Anthropic only (T029, FR-007)", () => {
  const routingLog = () => join(root, "decisions", "routing-log.jsonl");

  it("a project tier naming a non-Claude model is refused: the kit's Claude model is used and the refusal logged", () => {
    writeSettings("models:\n  tiers:\n    easy: llama-4-scout\n    heavy: omniroute/claude-opus-5-5\n");
    expect(resolveTier({ difficulty: "easy", root })).toEqual({ model: "claude-haiku-5-5", tier: "easy", source: "kit" });
    expect(resolveTier({ difficulty: "heavy", root }).model).toBe("claude-opus-5-5");
    const ev = readFileSync(routingLog(), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(ev).toHaveLength(2);
    expect(ev[0]).toMatchObject({ event: "refusal", from: "llama-4-scout", to: "claude-haiku-5-5" });
    expect(ev[1]).toMatchObject({ event: "refusal", from: "omniroute/claude-opus-5-5", to: "claude-opus-5-5" });
  });

  it("log: false resolves the same model and writes nothing", () => {
    writeSettings("models:\n  tiers:\n    easy: llama-4-scout\n");
    expect(resolveTier({ difficulty: "easy", root, log: false }).model).toBe("claude-haiku-5-5");
    expect(() => readFileSync(routingLog(), "utf8")).toThrow();
  });

  it("the settings reader has no allowedProviders; a leftover section is ignored", () => {
    writeSettings("allowedProviders:\n  - provider: groq\n    kinds: [docs]\n");
    const s = readRoutingSettings(root);
    expect(s.readable).toBe(true);
    expect("allowedProviders" in s).toBe(false);
  });
});

describe("settings reader", () => {

  it("parses the YAML subset", () => {
    expect(parseYamlSubset("a:\n  b:\n    c: 'x # not a comment'\nl:\n- 1\n- two\n")).toEqual({ a: { b: { c: "x # not a comment" } }, l: ["1", "two"] });
  });
});

describe("escalation (T009)", () => {
  it("easy -> moderate -> heavy, heavy stays heavy", () => {
    expect(escalate("easy")).toBe("moderate");
    expect(escalate("moderate")).toBe("heavy");
    expect(escalate("heavy")).toBe("heavy");
    expect(() => escalate("huge" as never)).toThrow(TypeError);
  });

  it("shouldEscalate is true at two failed test cycles", () => {
    expect(shouldEscalate(0)).toBe(false);
    expect(shouldEscalate(1)).toBe(false);
    expect(shouldEscalate(2)).toBe(true);
    expect(shouldEscalate(3)).toBe(true);
    expect(() => shouldEscalate(-1)).toThrow(TypeError);
    expect(() => shouldEscalate(1.5)).toThrow(TypeError);
  });

  it("US3: a moderate task on Sonnet that fails twice runs on Opus, and the escalation is logged", () => {
    expect(escalateTask({ root, taskid: "T9", command: "implement", tier: "moderate", failedTestCycles: 1 })).toEqual({ tier: "moderate", model: "claude-sonnet-5-5", escalated: false, from: "moderate" });
    const out = escalateTask({ root, taskid: "T9", command: "implement", tier: "moderate", failedTestCycles: 2 });
    expect(out).toEqual({ tier: "heavy", model: "claude-opus-5-5", escalated: true, from: "moderate" });
    const lines = readFileSync(join(root, "decisions", "routing-log.jsonl"), "utf8").trim().split("\n");
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toMatchObject({ event: "escalation", taskid: "T9", command: "implement", from: "moderate (claude-sonnet-5-5)", to: "heavy (claude-opus-5-5)" });
  });

  it("a heavy task that keeps failing stays heavy", () => {
    expect(escalateTask({ root, tier: "heavy", failedTestCycles: 2, log: false })).toMatchObject({ tier: "heavy", escalated: true });
  });
});
