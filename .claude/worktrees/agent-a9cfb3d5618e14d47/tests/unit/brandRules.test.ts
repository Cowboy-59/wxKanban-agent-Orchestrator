// SPEC-127 / T004 — brand rule extraction.
//
// Written directly: the fencer rejects test files with no top-level declaration.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  advisoryChecklist,
  classifyHeading,
  extractRules,
  isMechanical,
  mechanicalSubset,
} from "../../src/ingest/brandschema/rules.js";

const DOC = readFileSync(
  join(process.cwd(), "docs", "ProActive_Brand_Schema_Instruction.md"),
  "utf-8",
);

describe("rule extraction against the reference document", () => {
  const extracted = extractRules(DOC);

  it("finds all four kinds of rule", () => {
    const kinds = new Set(extracted.rules.map((r) => r.kind));
    expect([...kinds].sort()).toEqual(["check", "invariant", "product", "prohibition"].sort());
  });

  it("captures the product rule, which is written as a blockquote", () => {
    // This is the regression that matters. The single most important statement in the document
    // is a blockquote, not a bullet; an extractor that only read list items found ZERO product
    // rules while the document plainly states one.
    const product = extracted.rules.filter((r) => r.kind === "product");
    expect(product).toHaveLength(1);
    expect(product[0]?.text).toContain("Warnings are advisory only");
    expect(product[0]?.text).toContain("Access is never blocked");
    expect(product[0]?.text).toContain("RED raises an investigation");
  });

  it("joins a blockquote that wraps across lines into one statement", () => {
    const product = extracted.rules.find((r) => r.kind === "product");
    // The quote spans two source lines; the rule must not be truncated at the wrap.
    expect(product?.text.endsWith("instead.")).toBe(true);
    expect(product?.text).not.toContain(">");
  });

  it("leaves no rule heading unclassified", () => {
    expect(extracted.unclassifiedHeadings).toEqual([]);
  });

  it("splits mechanical from advisory, and keeps the advisory majority", () => {
    const mech = mechanicalSubset(extracted);
    expect(mech.length).toBeGreaterThan(0);
    expect(mech.length).toBeLessThan(extracted.rules.length);
    // Understating what a gate enforces is the safe direction; most brand rules need a person.
    expect(mech.length).toBeLessThan(extracted.rules.length / 2);
  });

  it("gives every rule a unique id and a readable statement", () => {
    const ids = extracted.rules.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of extracted.rules) {
      expect(r.text.length).toBeGreaterThan(10);
      expect(r.text).not.toContain("**");
      expect(r.text).not.toContain("`");
    }
  });

  it("never reads inside a CSS mode block", () => {
    // Mode blocks are full of lines a naive scanner would treat as content. The guard is that no
    // rule is a CSS DECLARATION — `--m-paper:#EEF1F4;`. A rule may legitimately *begin* with a
    // token name, because B7's acceptance checks do exactly that when they talk about a token's
    // behaviour, and rejecting those would throw away real rules.
    for (const r of extracted.rules) {
      expect(r.text, `rule ${r.id} should not be a CSS declaration`).not.toMatch(/^--[a-z-]+\s*:\s*\S/);
      expect(r.text).not.toContain(";--");
    }
  });

  it("keeps a rule that begins with a token name but is prose", () => {
    const hazard = extracted.rules.find((r) => r.text.startsWith("--m-hazard renders"));
    expect(hazard?.kind).toBe("check");
  });

  it("produces an advisory checklist a person can work through", () => {
    const checklist = advisoryChecklist(extracted);
    expect(checklist.length).toBeGreaterThan(0);
    expect(checklist.every((l) => l.startsWith("[ ] ("))).toBe(true);
  });
});

describe("classification is by heading, never by sentence", () => {
  it("recognises the headings the format defines", () => {
    expect(classifyHeading("What not to do")).toBe("prohibition");
    expect(classifyHeading("B5. Invariants — no mode may touch these")).toBe("invariant");
    expect(classifyHeading("B7. Acceptance checks")).toBe("check");
    expect(classifyHeading("A6. Product rule carried in the UI")).toBe("product");
  });

  it("returns null for a heading that names no kind", () => {
    expect(classifyHeading("Identity and hierarchy")).toBeNull();
    expect(classifyHeading("Type")).toBeNull();
  });

  it("reports a rule-looking heading it cannot classify, rather than defaulting", () => {
    const doc = ["## Some Rules About Things", "", "- A statement that is long enough to count", ""].join("\n");
    const r = extractRules(doc);
    expect(r.unclassifiedHeadings).toHaveLength(1);
    // And nothing is filed under a guessed kind.
    expect(r.rules).toEqual([]);
  });
});

describe("mechanical classification is conservative", () => {
  it("treats measurable statements as mechanical", () => {
    expect(isMechanical("Every mode declares all 41 tokens.")).toBe(true);
    expect(isMechanical("Grep the component layer for hex literals: zero results.")).toBe(true);
  });

  it("refuses to call a judgement mechanical, even when it mentions a token", () => {
    // An advisory signal always wins — otherwise the gate promises something it cannot deliver.
    expect(isMechanical("--m-rail-bar and --m-accent are distinguishable at a glance.")).toBe(false);
    expect(isMechanical("instrument must be checked on the actual wall screen.")).toBe(false);
  });

  it("treats an unmeasurable statement as advisory", () => {
    expect(isMechanical("Blue leads, gold identifies.")).toBe(false);
    expect(isMechanical("Density by default.")).toBe(false);
  });
});

describe("robustness", () => {
  it("never throws, whatever it is handed", () => {
    for (const junk of ["", "## What not to do", "> orphan quote", "```\n- not a rule\n```"]) {
      expect(() => extractRules(junk)).not.toThrow();
    }
  });

  it("ignores list fragments too short to be a rule", () => {
    const doc = ["## What not to do", "", "- No.", "- A genuine prohibition stated in full words", ""].join("\n");
    const r = extractRules(doc);
    expect(r.rules).toHaveLength(1);
  });
});
