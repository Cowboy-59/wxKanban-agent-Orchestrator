// SPEC-126 / T010 — brand schema model, contract, contrast and distinguishability.
//
// Written directly rather than through the orchestrator: the fencer rejects test files that
// declare nothing at top level, exactly as the existing theme-tokens tests are.
//
// The reference corpus is the real customer document on disk. Its measured failures ARE the
// fixture — a report that passes this brand is broken, which is the whole reason the shipped
// two-pair check was insufficient.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import type { BrandSchema, ContractToken, ModeTokenSet } from "../../src/shared/brand-schema.js";
import {
  advisoryRules,
  contractTokenNames,
  contractTokensOfKind,
  declaredFaces,
  isBrandSchema,
  mechanicalRules,
  restingMode,
} from "../../src/shared/brand-schema.js";
import {
  canAddMode,
  missingContractTokens,
  undeclaredContractTokens,
  validateContract,
} from "../../src/shared/brand-schema-contract.js";
import {
  AA_NON_TEXT,
  AA_TEXT,
  brandContrastReport,
  describeContrastFailures,
  hexContrastRatio,
  parseHexColor,
  relativeLuminance,
} from "../../src/shared/brand-contrast.js";
import {
  MIN_DISTINGUISHABLE_DELTA_E,
  brandDistinguishabilityReport,
  deltaE76,
  hexToLab,
} from "../../src/shared/brand-distinguishability.js";
import { suspectedAxisMismatches, validateDeclarations } from "../../src/shared/brand-declarations.js";

const DOC_PATH = join(process.cwd(), "docs", "ProActive_Brand_Schema_Instruction.md");

function kindFor(name: string): ContractToken["kind"] {
  if (name === "--m-hazard") return "paint";
  if (name.startsWith("--m-font-")) return "fontstack";
  if (name === "--m-disp-case") return "keyword";
  if (/(-w|-track|-scale|-size)$/.test(name)) return "number";
  if (/(-radius|-row|-pad|-fs|-rail-w|-brandmark-r)$/.test(name)) return "length";
  return "color";
}

/** Build the reference schema straight from the document. Deliberately minimal — the real parser is SPEC-127. */
function referenceSchema(): BrandSchema {
  const src = readFileSync(DOC_PATH, "utf-8");

  const contractBlock = /```\nCOLOUR[\s\S]*?```/.exec(src);
  if (!contractBlock) throw new Error("contract block not found in the reference document");
  const contractNames = Array.from(new Set(contractBlock[0].match(/--m-[a-z-]+/g) ?? []));

  const modes: Record<string, ModeTokenSet> = {};
  const blockRe = /### `(\w+)`[\s\S]*?```css\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(src)) !== null) {
    const name = String(m[1]);
    const tokens: Record<string, string> = {};
    for (const match of String(m[2]).matchAll(/(--m-[a-z-]+)\s*:\s*([^;]+);/g)) {
      tokens[String(match[1])] = String(match[2]).trim();
    }
    modes[name] = {
      name,
      axis: name === "instrument" || name === "psikiq" ? "dark" : "light",
      resting: name === "standard",
      tokens,
    };
  }

  return {
    name: "ProActive by DDES",
    version: "1.0",
    source: "authored",
    sourceRef: "docs/ProActive_Brand_Schema_Instruction.md",
    base: {} as BrandSchema["base"],
    extensions: {},
    typefaces: {
      display: { family: "Lexend Deca", fallback: ["Inter", "system-ui", "sans-serif"] },
      body: { family: "Inter", fallback: ["system-ui", "sans-serif"] },
      data: { family: "JetBrains Mono", fallback: ["ui-monospace", "monospace"] },
      figure: { family: "Lexend Deca", fallback: ["Inter", "sans-serif"] },
    },
    contract: contractNames.map((n) => ({ name: n, kind: kindFor(n) })),
    roles: {
      surface: "--m-paper",
      body: "--m-body",
      ink: "--m-ink",
      accent: "--m-accent",
      identity: "--m-rail-bar",
      identitySurface: "--m-rail",
      semantic: [
        { name: "ok", fg: "--m-ok", bg: "--m-ok-bg" },
        { name: "warn", fg: "--m-warn", bg: "--m-warn-bg" },
        { name: "crit", fg: "--m-crit", bg: "--m-crit-bg" },
      ],
    },
    modes,
    closed: true,
    rules: [
      { id: "A5-1", text: "Blue leads, gold identifies.", kind: "invariant", mechanical: false },
      { id: "B5-1", text: "Every mode declares all contract tokens.", kind: "check", mechanical: true },
      { id: "A6-1", text: "Warnings are advisory; access is never blocked.", kind: "product", mechanical: false },
    ],
    exceptions: [],
  };
}

describe("brand-schema model", () => {
  it("accepts the reference schema as structurally valid", () => {
    expect(isBrandSchema(referenceSchema())).toBe(true);
  });

  it("rejects non-schemas without throwing", () => {
    for (const bad of [null, undefined, 42, "brand", {}, { name: "x" }]) {
      expect(isBrandSchema(bad)).toBe(false);
    }
  });

  it("finds the single resting mode", () => {
    const s = referenceSchema();
    expect(restingMode(s)?.name).toBe("standard");
  });

  it("returns null when resting modes are absent or ambiguous", () => {
    const none = referenceSchema();
    for (const m of Object.values(none.modes)) m.resting = false;
    expect(restingMode(none)).toBeNull();

    const many = referenceSchema();
    for (const m of Object.values(many.modes)) m.resting = true;
    expect(restingMode(many)).toBeNull();
  });

  it("splits rules by whether a machine can decide them", () => {
    const s = referenceSchema();
    expect(mechanicalRules(s)).toHaveLength(1);
    expect(advisoryRules(s)).toHaveLength(2);
    expect(mechanicalRules(s).length + advisoryRules(s).length).toBe(s.rules.length);
  });

  it("declares four non-interchangeable type roles", () => {
    expect(declaredFaces(referenceSchema())).toHaveLength(4);
  });

  it("classifies contract tokens by kind, so only colours are contrast-checked", () => {
    const s = referenceSchema();
    expect(contractTokensOfKind(s, "paint").map((t) => t.name)).toEqual(["--m-hazard"]);
    expect(contractTokensOfKind(s, "fontstack")).toHaveLength(4);
    expect(contractTokensOfKind(s, "color").length).toBeGreaterThan(15);
  });
});

describe("contract validation", () => {
  it("the reference corpus is exactly 6 modes of 41 tokens, complete", () => {
    const s = referenceSchema();
    expect(Object.keys(s.modes)).toHaveLength(6);
    expect(contractTokenNames(s)).toHaveLength(41);

    const report = validateContract(s);
    expect(report.contractSize).toBe(41);
    expect(report.modesChecked).toHaveLength(6);
    expect(report.issues).toEqual([]);
    expect(report.valid).toBe(true);
  });

  it("names the mode and every missing token when one is dropped", () => {
    const s = referenceSchema();
    const mode = s.modes.instrument as ModeTokenSet;
    delete mode.tokens["--m-paper"];
    delete mode.tokens["--m-ink"];

    expect(missingContractTokens(s, mode)).toEqual(["--m-paper", "--m-ink"]);

    const report = validateContract(s);
    expect(report.valid).toBe(false);
    const issue = report.issues.find((i) => i.check === "contract:missing-token");
    expect(issue?.mode).toBe("instrument");
    expect(issue?.message).toContain("--m-paper");
    expect(issue?.message).toContain("--m-ink");
  });

  it("treats an empty value as missing, not as declared", () => {
    const s = referenceSchema();
    const mode = s.modes.field as ModeTokenSet;
    mode.tokens["--m-paper"] = "   ";
    expect(missingContractTokens(s, mode)).toContain("--m-paper");
  });

  it("never inherits a missing token from another mode", () => {
    const s = referenceSchema();
    const mode = s.modes.ledger as ModeTokenSet;
    delete mode.tokens["--m-accent"];
    // `standard` still declares --m-accent; the validator must not borrow it.
    expect((s.modes.standard as ModeTokenSet).tokens["--m-accent"]).toBeDefined();
    expect(missingContractTokens(s, mode)).toContain("--m-accent");
  });

  it("flags a token no contract names", () => {
    const s = referenceSchema();
    const mode = s.modes.standard as ModeTokenSet;
    mode.tokens["--m-invented"] = "#ffffff";
    expect(undeclaredContractTokens(s, mode)).toEqual(["--m-invented"]);
    expect(validateContract(s).issues.some((i) => i.check === "contract:undeclared-token")).toBe(true);
  });

  it("rejects an empty contract rather than passing vacuously", () => {
    const s = referenceSchema();
    s.contract = [];
    const report = validateContract(s);
    expect(report.valid).toBe(false);
    expect(report.issues.some((i) => i.check === "contract:empty")).toBe(true);
  });

  it("requires exactly one resting mode", () => {
    const none = referenceSchema();
    for (const m of Object.values(none.modes)) m.resting = false;
    expect(validateContract(none).issues.some((i) => i.check === "contract:no-resting-mode")).toBe(true);

    const many = referenceSchema();
    (many.modes.field as ModeTokenSet).resting = true;
    expect(validateContract(many).issues.some((i) => i.check === "contract:multiple-resting-modes")).toBe(true);
  });

  it("enforces a closed mode set, and allows an open one", () => {
    const closed = referenceSchema();
    expect(canAddMode(closed, "seventh")?.check).toBe("contract:closed-set");

    closed.closed = false;
    expect(canAddMode(closed, "seventh")).toBeNull();
    expect(canAddMode(closed, "standard")?.check).toBe("contract:duplicate-mode");
  });
});

describe("colour maths", () => {
  it("parses three- and six-digit hex, and rejects anything else", () => {
    expect(parseHexColor("#fff")).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseHexColor("#2563EB")).toEqual({ r: 0x25, g: 0x63, b: 0xeb });
    for (const bad of ["repeating-linear-gradient(45deg,#F5A524 0 8px)", "8px", "'Inter',sans-serif", "700"]) {
      expect(parseHexColor(bad)).toBeNull();
    }
  });

  it("puts black and white at the WCAG extremes", () => {
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 5);
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 5);
    expect(hexContrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 2);
    expect(hexContrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
  });

  it("is symmetric regardless of which colour is called the foreground", () => {
    const a = hexContrastRatio("#2563EB", "#EEF1F4") as number;
    const b = hexContrastRatio("#EEF1F4", "#2563EB") as number;
    expect(a).toBeCloseTo(b, 10);
  });

  it("returns null rather than throwing on a gradient", () => {
    expect(hexContrastRatio("repeating-linear-gradient(45deg,#F5A524 0 8px,#0E1216 8px 16px)", "#fff")).toBeNull();
    expect(deltaE76("linear-gradient(90deg,#E6BE6A,#B8912F)", "#fff")).toBeNull();
  });

  it("places identical colours at zero perceptual distance", () => {
    expect(deltaE76("#E6BE6A", "#E6BE6A")).toBe(0);
    expect(hexToLab("#ffffff")?.L).toBeCloseTo(100, 1);
  });
});

describe("widened contrast report against the real brand", () => {
  it("fails the resting mode on all three semantic roles, in both pairings", () => {
    const report = brandContrastReport(referenceSchema());
    const standard = report.failures.filter((f) => f.mode === "standard");

    // ok, warn and crit each fail twice: on the page ground and on their own chip.
    expect(standard).toHaveLength(6);
    for (const token of ["--m-ok", "--m-warn", "--m-crit"]) {
      const forToken = standard.filter((f) => f.foreground === (referenceSchema().modes.standard as ModeTokenSet).tokens[token]);
      expect(forToken.length).toBeGreaterThanOrEqual(2);
    }

    const onChip = standard.filter((f) => f.check.endsWith("on-chip")).map((f) => f.ratio).sort();
    expect(onChip).toEqual([2.58, 2.82, 3.89]);
  });

  it("catches the accent colour, which the brand's own acceptance checks omit", () => {
    const report = brandContrastReport(referenceSchema());
    const accentFailures = report.failures.filter((f) => f.check.includes("--m-accent"));
    expect(accentFailures.map((f) => f.mode).sort()).toEqual(["field", "psikiqPaper"]);
    expect(accentFailures.map((f) => f.ratio).sort()).toEqual([3.64, 4.14]);
  });

  it("judges the identity mark at the non-text threshold and still fails two modes", () => {
    const report = brandContrastReport(referenceSchema());
    const identity = report.failures.filter((f) => f.check.endsWith("on-rail"));
    expect(identity.map((f) => f.mode).sort()).toEqual(["field", "ledger"]);
    for (const f of identity) {
      expect(f.use).toBe("non-text");
      expect(f.threshold).toBe(AA_NON_TEXT);
    }
    expect(identity.map((f) => f.ratio).sort()).toEqual([1.52, 1.56]);
  });

  it("measures 12 failures overall, and skips nothing it was asked to check", () => {
    const report = brandContrastReport(referenceSchema());
    expect(report.passes).toBe(false);
    expect(report.results).toHaveLength(60);
    expect(report.failures).toHaveLength(12);
    expect(report.skipped).toEqual([]);
  });

  it("decides on the unrounded ratio, not the displayed one", () => {
    const report = brandContrastReport(referenceSchema());
    for (const r of report.results) {
      expect(r.passes).toBe(r.exactRatio >= r.threshold);
    }
    // A value that displays as 4.5 but measures just under must still fail.
    const borderline = report.results.find((r) => r.ratio === 4.5 && r.exactRatio < AA_TEXT);
    if (borderline) expect(borderline.passes).toBe(false);
  });

  it("describes each failure with its measurement, for the customer to read", () => {
    const lines = describeContrastFailures(brandContrastReport(referenceSchema()));
    expect(lines).toHaveLength(12);
    expect(lines.some((l) => l.includes("2.58:1") && l.includes("standard"))).toBe(true);
    expect(lines.some((l) => l.includes("graphical objects"))).toBe(true);
  });

  it("never alters the values it judges", () => {
    const before = referenceSchema();
    const snapshot = JSON.stringify(before.modes);
    brandContrastReport(before);
    expect(JSON.stringify(before.modes)).toBe(snapshot);
  });
});

describe("distinguishability against the real brand", () => {
  it("fails the pairs the brand sets to the same value", () => {
    const report = brandDistinguishabilityReport(referenceSchema());
    const identical = report.failures.filter((f) => f.exactDeltaE === 0);
    expect(identical.map((f) => f.mode).sort()).toEqual(["psikiq", "psikiqPaper"]);
    for (const f of identical) expect(f.valueA).toBe(f.valueB);
  });

  it("admits the mode the brand calls its tightest case", () => {
    const report = brandDistinguishabilityReport(referenceSchema());
    const instrument = report.results.filter((f) => f.mode === "instrument");
    expect(instrument.every((r) => r.passes)).toBe(true);
    for (const r of instrument) expect(r.exactDeltaE).toBeGreaterThanOrEqual(MIN_DISTINGUISHABLE_DELTA_E);
  });

  it("measures 4 failures overall", () => {
    const report = brandDistinguishabilityReport(referenceSchema());
    expect(report.passes).toBe(false);
    expect(report.failures).toHaveLength(4);
  });
});

describe("declaration completeness", () => {
  it("accepts the reference schema", () => {
    const report = validateDeclarations(referenceSchema());
    expect(report.issues).toEqual([]);
    expect(report.valid).toBe(true);
    expect(report.facesChecked).toEqual(["display", "body", "data", "figure"]);
  });

  it("rejects an unrecognised light/dark relationship rather than inferring one", () => {
    const s = referenceSchema();
    (s.modes.field as ModeTokenSet).axis = "auto" as ModeTokenSet["axis"];
    const report = validateDeclarations(s);
    expect(report.valid).toBe(false);
    expect(report.issues.some((i) => i.check === "declaration:invalid-axis" && i.subject === "field")).toBe(true);
  });

  it("rejects a typeface with no usable fallback, including a stack of empty strings", () => {
    const s = referenceSchema();
    s.typefaces.body.fallback = ["", "  "];
    const report = validateDeclarations(s);
    expect(report.issues.some((i) => i.check === "declaration:missing-fallback" && i.subject === "body")).toBe(true);
  });

  it("reports a suspected axis mismatch as advisory, separately from defects", () => {
    const s = referenceSchema();
    (s.modes.instrument as ModeTokenSet).axis = "light";
    // The hard validator does not fail it — the declaration is still a valid value.
    expect(validateDeclarations(s).valid).toBe(true);
    const suspicions = suspectedAxisMismatches(s, relativeLuminance);
    expect(suspicions.some((i) => i.subject === "instrument")).toBe(true);
  });

  it("raises no suspicion about the reference schema as declared", () => {
    expect(suspectedAxisMismatches(referenceSchema(), relativeLuminance)).toEqual([]);
  });
});

describe("thresholds are the published WCAG values", () => {
  it("uses 4.5 for body text and 3.0 for graphical objects", () => {
    expect(AA_TEXT).toBe(4.5);
    expect(AA_NON_TEXT).toBe(3);
  });
});
