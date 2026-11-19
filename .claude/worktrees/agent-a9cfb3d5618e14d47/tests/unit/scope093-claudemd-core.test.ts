// [SCOPE 093 / T004] BEGIN — Guard: mandatory rules stay in the always-on CLAUDE.md core
// FR-004 (mandatory anchors) + FR-005 (cache-stable preamble). Backstop for the exact
// failures SCOPE-093 uncovered: governance rules silently leaving the editor's always-on
// context, and per-session churn (a dated header) busting the prompt cache. If a future
// edit thins CLAUDE.md too far, re-adds the false "no imports needed" claim, or puts a
// "Last Updated: <date>" field back at the top, this test fails.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLAUDE_MD = readFileSync(resolve(__dirname, "../../CLAUDE.md"), "utf-8");

describe("SCOPE-093 — CLAUDE.md always-on core guard (FR-004)", () => {
  // Substrings that MUST remain inline in CLAUDE.md — never moved behind an on-demand read.
  const REQUIRED_ANCHORS: Array<[string, string]> = [
    ["SPEC-FIRST rule", "SPEC-FIRST Development (MANDATORY RULE)"],
    ["Scope-vs-Spec numbering", "Scope vs Spec Numbering — TWO Namespaces (MANDATORY)"],
    ["Code fencing", "Code Fencing Convention (MANDATORY"],
    ["Orchestrator-first", "Orchestrator-First (MANDATORY)"],
    ["Database conventions", "## Database Conventions"],
    ["Rules Enforcement block", "### Rules Enforcement"],
    ["AI Behavior block", "### AI Behavior (MANDATORY)"],
    ["Search-before-suggest rule", "Search before suggest"],
    ["Never-proactively-git rule", "Never proactively run git"],
    ["Token-saving advisor rule", "Token-saving advisor"],
    ["TypeScript constraint", "TypeScript"],
    ["Pino logging constraint", "Pino only"],
  ];

  for (const [label, needle] of REQUIRED_ANCHORS) {
    it(`keeps the ${label} in the always-on core`, () => {
      expect(CLAUDE_MD.includes(needle), `CLAUDE.md core must still contain: "${needle}"`).toBe(
        true,
      );
    });
  }

  it("does not reintroduce the false 'no imports needed' auto-load claim", () => {
    // The legacy phrasing that misled: it implied _wxAI/rules loads automatically. It does not.
    expect(CLAUDE_MD.includes("no imports needed")).toBe(false);
  });

  it("declares the on-demand reference and rules indexes", () => {
    expect(CLAUDE_MD.includes("Reference Modules — Read On Demand")).toBe(true);
    expect(CLAUDE_MD.includes("Rules — Read On Demand")).toBe(true);
  });
});

describe("SCOPE-093 — CLAUDE.md cache-stability (FR-005)", () => {
  // The always-on preamble must be byte-stable within/across sessions so Anthropic's
  // prompt cache reuses it. The one churn vector we removed was a dated header field.
  const header = CLAUDE_MD.split(/\n#{2,3}\s/, 1)[0]; // everything before the first ##/### section

  it("has no dated 'Last Updated' field", () => {
    expect(/Last Updated/i.test(CLAUDE_MD)).toBe(false);
  });

  it("carries no ISO date in the header block", () => {
    expect(/\d{4}-\d{2}-\d{2}/.test(header)).toBe(false);
  });

  it("documents the cache-stability intent", () => {
    expect(/prompt-cache/i.test(CLAUDE_MD)).toBe(true);
  });
});
// [SCOPE 093 / T004] END

// [SCOPE 093 / T010-T011] BEGIN — Guard: the in-the-moment token-saving advisor (FR-010–012)
// and its measurement surface (FR-013–014) stay wired. The advisor is an always-on editor-AI
// behavior — if its trigger set, the apply/skip/silence protocol, its on-demand rule, or the
// token-footprint script disappears, these fail.
describe("SCOPE-093 — token-saving advisor (FR-010–FR-012)", () => {
  it("offers the apply / skip / silence-for-session protocol in the core", () => {
    expect(/apply\s*\/\s*skip\s*\/\s*silence-for-session/i.test(CLAUDE_MD)).toBe(true);
  });

  it("names all four minimum detection classes in the core", () => {
    // FR-012 minimum set — a representative phrase for each of the four.
    expect(/an existing scope already substantially covers/i.test(CLAUDE_MD)).toBe(true);
    expect(/deterministic generator/i.test(CLAUDE_MD)).toBe(true);
    expect(/context grown well beyond/i.test(CLAUDE_MD)).toBe(true);
    expect(/batching within the prompt-cache window/i.test(CLAUDE_MD)).toBe(true);
  });

  it("states the never-auto-apply / no-action-on-no-response guarantee (FR-011)", () => {
    expect(/never auto-apply/i.test(CLAUDE_MD)).toBe(true);
    expect(/no action on no response/i.test(CLAUDE_MD)).toBe(true);
  });

  it("lists the token-advisor rule in the read-on-demand index", () => {
    expect(CLAUDE_MD.includes("_wxAI/rules/token-advisor.md")).toBe(true);
  });

  it("ships the token-advisor rule file with the four classes and per-class silence", () => {
    const rule = readFileSync(resolve(__dirname, "../../_wxAI/rules/token-advisor.md"), "utf-8");
    for (const cls of [
      "covered-buildscope",
      "deterministic-doc",
      "context-bloat",
      "cold-command-batching",
    ]) {
      expect(rule.includes(cls), `token-advisor.md must document the ${cls} class`).toBe(true);
    }
    expect(/per-session and per-suggestion-class|per class/i.test(rule)).toBe(true);
  });
});

describe("SCOPE-093 — token measurement surface (FR-013–FR-014)", () => {
  const script = readFileSync(resolve(__dirname, "../../scripts/token-footprint.mjs"), "utf-8");

  it("reports the per-session preamble and a per-flow estimate", () => {
    expect(/PER-SESSION PREAMBLE/.test(script)).toBe(true);
    expect(/PER-FLOW ESTIMATE/.test(script)).toBe(true);
  });

  it("supports a baseline snapshot for before/after attribution", () => {
    expect(script.includes("--baseline")).toBe(true);
    expect(/vs baseline/i.test(script)).toBe(true);
  });
});
// [SCOPE 093 / T010-T011] END
