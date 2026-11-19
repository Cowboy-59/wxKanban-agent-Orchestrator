// SPEC-129 / T008, T009, T010 and rule delivery.
//
// Written directly: the fencer rejects test files with no top-level declaration.
import { describe, expect, it } from "vitest";

import type { BrandSchema } from "../../src/shared/brand-schema.js";
import {
  describeStructuralViolations,
  isModeScoped,
  lintStructuralProperties,
  passesStructuralLint,
} from "../../src/shared/brand-lint-structure.js";
import {
  describeLiteralViolations,
  isTokenFile,
  lintStyleLiterals,
  lintStyleLiteralsAcross,
} from "../../src/shared/brand-lint-literals.js";
import { announceBrand, mustAnnounce } from "../../src/shared/brand-announce.js";
import {
  deliverRules,
  renderRulesForDesign,
  renderRulesForImplement,
  renderRulesForReview,
} from "../../src/shared/brand-rule-delivery.js";

function schema(): BrandSchema {
  return {
    name: "ProActive",
    version: "1.0",
    source: "authored",
    sourceRef: null,
    base: {} as BrandSchema["base"],
    extensions: {},
    typefaces: {
      display: { family: "Lexend Deca", fallback: ["Inter", "sans-serif"] },
      body: { family: "Inter", fallback: ["system-ui", "sans-serif"] },
      data: { family: "JetBrains Mono", fallback: ["ui-monospace", "monospace"] },
      figure: { family: "Lexend Deca", fallback: ["Inter", "sans-serif"] },
    },
    contract: [
      { name: "--m-paper", kind: "color" },
      { name: "--m-ink", kind: "color" },
      { name: "--m-body", kind: "color" },
      { name: "--m-accent", kind: "color" },
      { name: "--m-rail-bar", kind: "color" },
    ],
    roles: {
      surface: "--m-paper",
      body: "--m-body",
      ink: "--m-ink",
      accent: "--m-accent",
      identity: "--m-rail-bar",
      identitySurface: "--m-paper",
      semantic: [{ name: "crit", fg: "--m-crit", bg: "--m-crit-bg" }],
    },
    modes: {
      standard: { name: "standard", axis: "light", resting: true, tokens: { "--m-paper": "#EEF1F4" } },
      workshop: { name: "workshop", axis: "dark", resting: false, tokens: { "--m-paper": "#0E1216" } },
    },
    closed: true,
    rules: [
      { id: "i-1", text: "Blue leads, gold identifies. Gold is never a primary action.", kind: "invariant", mechanical: false },
      { id: "p-1", text: "Never use a native browser input, select or file control.", kind: "prohibition", mechanical: false },
      { id: "c-1", text: "Every mode declares all contract tokens.", kind: "check", mechanical: true },
      { id: "pr-1", text: "Warnings are advisory only. Access is never blocked by a prestart result.", kind: "product", mechanical: false },
    ],
    exceptions: [],
  };
}

describe("T008 — structure is not a theme", () => {
  it("passes a stylesheet where modes set only tokens", () => {
    const css = `.app-shell[data-mode="workshop"] { --m-paper: #0E1216; --m-ink: #F0F4F7; }`;
    expect(passesStructuralLint(css)).toBe(true);
  });

  it("fails a mode selector that sets display", () => {
    const css = `.app-shell[data-mode="field"] { display: none; }`;
    const v = lintStructuralProperties(css);
    expect(v).toHaveLength(1);
    expect(v[0]?.property).toBe("display");
    expect(v[0]?.message).toContain("redesign, not a theme");
  });

  it("fails grid-template, order, position and content too", () => {
    const css = [
      `.app-shell[data-mode="a"] { grid-template-columns: 1fr; }`,
      `.app-shell[data-mode="b"] { order: 2; }`,
      `.app-shell[data-mode="c"] { position: absolute; }`,
      `.app-shell[data-mode="d"] { content: ""; }`,
    ].join("\n");
    expect(lintStructuralProperties(css)).toHaveLength(4);
  });

  it("ignores the shell's own rules, which may legitimately lay things out", () => {
    // Otherwise the lint is noise, and a noisy lint gets switched off.
    const css = `.app-shell { display: grid; grid-template-columns: 224px 1fr; }`;
    expect(passesStructuralLint(css)).toBe(true);
  });

  it("does not treat a custom property as a structural set", () => {
    const css = `.app-shell[data-mode="x"] { --display-density: compact; }`;
    expect(passesStructuralLint(css)).toBe(true);
  });

  it("recognises a mode-scoped selector by its attribute", () => {
    expect(isModeScoped('.app-shell[data-mode="x"]', "data-mode")).toBe(true);
    expect(isModeScoped(".app-shell", "data-mode")).toBe(false);
  });

  it("reports the line so a violation can be found", () => {
    const css = `.a { color: red; }\n\n.app-shell[data-mode="x"] { display: flex; }`;
    const described = describeStructuralViolations(lintStructuralProperties(css));
    expect(described[0]).toContain("line 3");
  });
});

describe("T009 — no style literal in a component", () => {
  it("fails a hard-coded hex colour and explains the cost", () => {
    const v = lintStyleLiterals("src/Button.tsx", `const s = { color: "#FF0000" };`);
    expect(v).toHaveLength(1);
    expect(v[0]?.kind).toBe("color");
    expect(v[0]?.message).toContain("will not follow a mode");
  });

  it("fails rgb() and hsl() colours", () => {
    const v = lintStyleLiterals("src/Card.css", `.c { color: rgb(1,2,3); background: hsl(1 2% 3%); }`);
    expect(v.filter((x) => x.kind === "color")).toHaveLength(2);
  });

  it("fails a directly set radius, row height and font stack", () => {
    const src = [
      `.a { border-radius: 8px; }`,
      `.b { height: 38px; }`,
      `.c { font-family: Inter, sans-serif; }`,
    ].join("\n");
    const kinds = lintStyleLiterals("src/x.css", src).map((v) => v.kind);
    expect(kinds).toContain("radius");
    expect(kinds).toContain("row-height");
    expect(kinds).toContain("font-stack");
  });

  it("passes a declaration that reads a token", () => {
    const src = `.a { color: var(--m-ink); border-radius: var(--m-radius); font-family: var(--brand-font-body); }`;
    expect(lintStyleLiterals("src/x.css", src)).toEqual([]);
  });

  it("exempts token files, where literals belong", () => {
    expect(isTokenFile("dist/brand.css")).toBe(true);
    expect(isTokenFile("src/theme.css")).toBe(true);
    expect(isTokenFile("src/Button.tsx")).toBe(false);
    expect(lintStyleLiterals("dist/brand.css", `.a { color: #fff; }`)).toEqual([]);
  });

  it("ignores comments, so documenting a colour is not a violation", () => {
    expect(lintStyleLiterals("src/x.ts", `// brand gold is #FFC700`)).toEqual([]);
  });

  it("reports every violation in a file, not just the first", () => {
    const src = `.a { color: #111; }\n.b { color: #222; }\n.c { color: #333; }`;
    expect(lintStyleLiterals("src/x.css", src)).toHaveLength(3);
  });

  it("groups a report by file so a developer sees each file once", () => {
    const out = describeLiteralViolations(
      lintStyleLiteralsAcross([
        { path: "src/a.tsx", source: `color: "#111"` },
        { path: "src/b.tsx", source: `color: "#222"` },
      ]),
    );
    expect(out[0]).toContain("src/a.tsx — 1 style literal(s)");
    expect(out[2]).toContain("src/b.tsx — 1 style literal(s)");
  });
});

describe("T010 — an active or missing schema announces itself", () => {
  it("names the brand and what was delivered when active", () => {
    const a = announceBrand({ schema: schema(), declared: true, tier: "company" });
    expect(a.presence).toBe("active");
    expect(mustAnnounce(a)).toBe(true);
    expect(a.line).toContain("ProActive");
    expect(a.line).toContain("(company)");
    expect(a.line).toContain("2 mode(s)");
    expect(a.line).toContain("4 rule(s)");
    expect(a.isProblem).toBe(false);
  });

  it("says so loudly when a schema is declared but did not resolve", () => {
    const a = announceBrand({ schema: null, declared: true });
    expect(a.presence).toBe("declared-but-missing");
    expect(mustAnnounce(a)).toBe(true);
    expect(a.isProblem).toBe(true);
    expect(a.line).toContain("DECLARED BUT NOT RESOLVED");
    expect(a.line).toContain("nothing downstream will say so again");
  });

  it("stays silent when there is genuinely no brand", () => {
    // Announcing "no brand" on every run would train people to ignore the line, and then the
    // one run that mattered would be ignored too.
    const a = announceBrand({ schema: null, declared: false });
    expect(a.presence).toBe("none");
    expect(a.line).toBeNull();
    expect(mustAnnounce(a)).toBe(false);
  });

  it("is one line, because a paragraph gets skimmed", () => {
    const a = announceBrand({ schema: schema(), declared: true });
    expect(a.line?.includes("\n")).toBe(false);
  });
});

describe("rule delivery — one source, three renderings", () => {
  const s = schema();

  it("leads the implementation agent with what it must never do", () => {
    const { context } = renderRulesForImplement(s);
    expect(context.indexOf("Never do these")).toBeLessThan(context.indexOf("Tokens —"));
    expect(context).toContain("native browser input");
  });

  it("gives the implementation agent the product rules, which change what gets built", () => {
    expect(renderRulesForImplement(s).context).toContain("Access is never blocked by a prestart result");
  });

  it("warns the design step that identity is never an action", () => {
    expect(renderRulesForDesign(s).context).toContain("IDENTITY ONLY");
  });

  it("tells the design step a mode changes appearance only", () => {
    expect(renderRulesForDesign(s).context).toContain("only the appearance differs");
  });

  it("tells the reviewer which rules a gate already decided", () => {
    const { context } = renderRulesForReview(s);
    expect(context).toContain("do not spend attention here");
    expect(context).toContain("Every mode declares all contract tokens");
  });

  it("delivers the same rule count to all three consumers", () => {
    const d = deliverRules(s);
    expect(d.implement.ruleCount).toBe(d.design.ruleCount);
    expect(d.design.ruleCount).toBe(d.review.ruleCount);
    expect(d.implement.mechanicalCount).toBe(1);
  });

  it("states the honest split rather than implying everything is enforced", () => {
    for (const d of Object.values(deliverRules(s))) {
      expect(d.context).toContain("cannot");
    }
  });
});
