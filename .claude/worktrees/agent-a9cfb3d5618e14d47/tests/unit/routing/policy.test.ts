// SPEC-143 / T010, T012, T029 — provider policy: Anthropic only, on the official Claude client
// (FR-007, Amendment A), with refusal fallback, and the rule that the Claude subscription never
// leaves the official client (FR-009).
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { assertSubscriptionOfficial, checkRoute, ROUTES, validateRunRecord } from "../../../_wxAI/routing/policy.mjs";

let root = "";
const settingsFile = () => join(root, "decisions", "settings.yaml");
const logFile = () => join(root, "decisions", "routing-log.jsonl");
const writeSettings = (text: string) => {
  mkdirSync(join(root, "decisions"), { recursive: true });
  writeFileSync(settingsFile(), text);
};
const events = () => (existsSync(logFile()) ? readFileSync(logFile(), "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "routing-policy-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("checkRoute (T010, T029)", () => {
  it("the only route is official", () => {
    expect(ROUTES).toEqual(["official"]);
  });

  it("allows Anthropic providers on the official client, with or without a Claude model named", () => {
    expect(checkRoute({ provider: "anthropic-subscription", root })).toMatchObject({ allowed: true, fallbackModel: null });
    expect(checkRoute({ provider: "anthropic-api", root, route: "official" })).toMatchObject({ allowed: true });
    expect(checkRoute({ provider: "anthropic-subscription", model: "claude-haiku-5-5", root }).allowed).toBe(true);
    expect(events()).toEqual([]);
  });

  it("US4: a non-Anthropic provider is refused, falls back to the task's Claude tier, and is logged", () => {
    const out = checkRoute({ provider: "groq", difficulty: "moderate", taskid: "T5", command: "implement", root });
    expect(out.allowed).toBe(false);
    expect(out.fallbackModel).toBe("claude-sonnet-5-5");
    expect(out.reason).toContain("groq");
    const ev = events();
    expect(ev).toHaveLength(1);
    expect(Object.keys(ev[0])).toEqual(["time", "event", "taskid", "command", "from", "to", "reason", "evidence"]);
    expect(ev[0]).toMatchObject({ event: "refusal", taskid: "T5", command: "implement", from: "groq", to: "claude-sonnet-5-5" });
    expect(ev[0].evidence).toContain("Anthropic only");
  });

  it("no setting can allow another provider: a leftover allowedProviders list is ignored", () => {
    writeSettings("allowedProviders:\n  - provider: groq\n    kinds: [docs, synthetic-tests, code]\n");
    for (const kind of ["docs", "synthetic-tests", "code"]) {
      expect(checkRoute({ provider: "groq", kind, root, log: false } as never).allowed).toBe(false);
    }
  });

  it("any route other than official is refused, for every provider", () => {
    for (const route of ["omniroute", "sideways", "proxy"]) {
      expect(checkRoute({ provider: "anthropic-api", route, root, log: false }).allowed).toBe(false);
      expect(checkRoute({ provider: "anthropic-subscription", route, root, log: false }).allowed).toBe(false);
    }
  });

  it("a model that is not a Claude model is refused", () => {
    const out = checkRoute({ provider: "anthropic-api", model: "llama-4-scout", difficulty: "easy", root });
    expect(out).toMatchObject({ allowed: false, fallbackModel: "claude-haiku-5-5" });
    expect(out.reason).toContain("not a Claude model");
    expect(checkRoute({ provider: "anthropic-api", model: "omniroute/claude-haiku-5-5", root, log: false }).allowed).toBe(false);
  });

  it("with no difficulty and no command, the fallback is the cheapest Claude tier", () => {
    expect(checkRoute({ provider: "groq", root }).fallbackModel).toBe("claude-haiku-5-5");
  });

  it("the fallback follows a command's declared tier", () => {
    expect(checkRoute({ provider: "groq", command: "buildscope", root }).fallbackModel).toBe("claude-opus-5-5");
  });

  it("refuses a missing provider", () => {
    expect(checkRoute({ provider: "", root }).allowed).toBe(false);
  });

  it("the fallback is always a Claude model, even when the project maps a tier to another model", () => {
    writeSettings("models:\n  tiers:\n    easy: llama-4-scout\n");
    expect(checkRoute({ provider: "groq", difficulty: "easy", root }).fallbackModel).toBe("claude-haiku-5-5");
  });

  it("log: false writes nothing", () => {
    checkRoute({ provider: "groq", root, log: false });
    expect(events()).toEqual([]);
  });

  it("never changes decisions/settings.yaml", () => {
    writeSettings("gate:\n  mode: observe\n");
    const before = createHash("sha256").update(readFileSync(settingsFile())).digest("hex");
    for (const provider of ["groq", "deepseek", "anthropic-api", "anthropic-subscription"]) {
      for (const route of ["official", "omniroute"]) checkRoute({ provider, route, root });
    }
    expect(createHash("sha256").update(readFileSync(settingsFile())).digest("hex")).toBe(before);
  });

  it("no routing script writes the settings file", () => {
    const dir = join(process.cwd(), "_wxAI", "routing");
    const mine = ["tiers.mjs", "policy.mjs", "difficulty.mjs", "hook-settings-guard.mjs"];
    expect(readdirSync(dir)).toEqual(expect.arrayContaining(mine));
    expect(readdirSync(dir)).not.toContain("omniroute");
    for (const f of mine) {
      const src = readFileSync(join(dir, f), "utf8");
      expect(src, f).not.toMatch(/\b(?:writeFileSync|renameSync|createWriteStream)\s*\(/);
      expect(src, f).not.toMatch(/\bappendFileSync\s*\(/); // the only write goes through log.mjs logEvent
    }
    expect(readFileSync(join(dir, "tiers.mjs"), "utf8")).toMatch(/import \{ logEvent \} from '\.\/log\.mjs';/);
  });
});

describe("the subscription stays official (T012, FR-009)", () => {
  const configs = [
    "",
    "allowedProviders: []\n",
    "allowedProviders:\n  - provider: anthropic-subscription\n    kinds: [docs, scaffolding, synthetic-tests, code]\n",
    "models:\n  tiers:\n    easy: omniroute/claude-haiku-5-5\n    moderate: omniroute/claude-sonnet-5-5\n    heavy: omniroute/claude-opus-5-5\n",
    "models: [docs\n",
  ];

  it.each(configs.map((c, i) => [i, c]))("config %i: anthropic-subscription off the official client is always refused", (_i, text) => {
    if (text) writeSettings(text as string);
    for (const provider of ["anthropic-subscription", "Anthropic-Subscription", " anthropic-subscription "]) {
      for (const route of ["omniroute", "OmniRoute", "proxy"]) {
        const out = checkRoute({ provider, route, difficulty: "moderate", root, log: false });
        expect(out.allowed).toBe(false);
        expect(out.fallbackModel).toMatch(/^claude-/);
        expect(out.reason).toContain("FR-009");
      }
    }
  });

  it("the refusal is logged", () => {
    checkRoute({ provider: "anthropic-subscription", route: "omniroute", taskid: "T12", root });
    expect(events()[0]).toMatchObject({ event: "refusal", taskid: "T12", from: "anthropic-subscription via omniroute" });
  });

  it("assertSubscriptionOfficial throws only for the subscription off the official client", () => {
    expect(() => assertSubscriptionOfficial({ provider: "anthropic-subscription", route: "omniroute" })).toThrow(/FR-009/);
    expect(assertSubscriptionOfficial({ provider: "anthropic-subscription", route: "official" })).toBe(true);
    expect(assertSubscriptionOfficial({ provider: "anthropic-subscription" })).toBe(true);
  });

  const record = {
    id: "0192f0a8-0000-7000-8000-000000000000",
    projectid: null,
    aispecsessionid: null,
    taskid: null,
    command: "dbpush",
    kind: "command",
    difficulty: "easy",
    model: "claude-haiku-5-5",
    provider: "anthropic-subscription",
    route: "official",
    inputtokens: 0,
    outputtokens: 0,
    cachereadtokens: 0,
    cachewritetokens: 0,
    activeseconds: 0,
    waitingseconds: 0,
    escalated: false,
    comparisonid: null,
    starttime: "2026-10-23T17:00:00.000Z",
    endtime: "2026-10-23T17:12:00.000Z",
  };

  it("a C1 record with anthropic-subscription and a route other than official is a violation", () => {
    const out = validateRunRecord({ ...record, route: "omniroute" });
    expect(out.valid).toBe(false);
    expect(out.violations.join(" ")).toContain("FR-009");
  });

  it("a subscription record with no route is a violation too (C1: route is official)", () => {
    expect(validateRunRecord({ ...record, route: null }).valid).toBe(false);
  });

  it("valid records pass; another provider or route never does", () => {
    expect(validateRunRecord(record)).toEqual({ valid: true, violations: [] });
    expect(validateRunRecord({ ...record, provider: "groq", model: "llama-4", route: "official" }).valid).toBe(false);
    expect(validateRunRecord({ ...record, provider: "anthropic-api", route: "omniroute" }).valid).toBe(false);
  });

  it("reports bad enum values and a non-object", () => {
    expect(validateRunRecord({ ...record, difficulty: "huge", kind: "batch", route: "teleport" }).violations).toHaveLength(4);
    expect(validateRunRecord(null).valid).toBe(false);
  });
});
