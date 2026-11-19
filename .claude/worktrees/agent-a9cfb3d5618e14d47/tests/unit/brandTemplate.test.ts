// SPEC-127 / T002 — the fillable brand instruction template.
//
// Two properties matter, and they pull in opposite directions:
//
//   1. UNFILLED, it must NOT parse as valid. A template that validated while empty would be a
//      trap: a customer could send back a blank and be told it was fine.
//   2. FILLED, it must parse completely. A template that cannot produce a valid document is
//      worse than no template at all.
//
// Written directly: the fencer rejects test files with no top-level declaration.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { parseBrandDocument } from "../../src/ingest/brandschema/parse.js";

const TEMPLATE = readFileSync(
  join(process.cwd(), "docs", "brand-instruction-template.md"),
  "utf-8",
);

/** Plausible values, as a customer would supply them. */
const FILL: Record<string, string> = {
  "--c-paper": "#FFFFFF",
  "--c-ink": "#14181D",
  "--c-body": "#344256",
  "--c-accent": "#1D4ED8",
  "--c-accent-ink": "#FFFFFF",
  "--c-rule": "#DDE3E9",
  "--c-ok": "#14713A",
  "--c-ok-bg": "#E9F5EC",
  "--c-warn": "#8A5200",
  "--c-warn-bg": "#FFF3E0",
  "--c-crit": "#B3261E",
  "--c-crit-bg": "#FDECEA",
  "--c-identity": "#8A6A00",
  "--c-identity-surface": "#FFFFFF",
  "--c-radius": "8px",
  "--c-font-disp": "'Lexend Deca',system-ui,sans-serif",
  "--c-font-body": "'Inter',system-ui,sans-serif",
  "--c-font-data": "'JetBrains Mono',ui-monospace,monospace",
  "--c-font-fig": "'Lexend Deca',system-ui,sans-serif",
};

/** Fill the template the way a customer would: values in, axis declared. */
function fillTemplate(source: string, values: Record<string, string> = FILL): string {
  let out = source.replace(/^- Axis:\s*$/m, "- Axis: light");
  for (const [token, value] of Object.entries(values)) {
    out = out.replace(new RegExp(`^${token}: ;$`, "m"), `${token}: ${value};`);
  }
  return out;
}

describe("the unfilled template refuses, and says exactly what is outstanding", () => {
  const parsed = parseBrandDocument(TEMPLATE);

  it("does not parse as a valid document", () => {
    expect(parsed.parsed).toBe(false);
    expect(parsed.complete).toBe(false);
  });

  it("still reads the contract, so it can report against it", () => {
    expect(parsed.contract).toHaveLength(19);
  });

  it("names every token still needing a value", () => {
    const incomplete = parsed.issues.find((i) => i.code === "parse:incomplete-mode");
    expect(incomplete?.severity).toBe("error");
    expect(incomplete?.message).toContain("19 of 19");
    for (const token of Object.keys(FILL)) {
      expect(incomplete?.message, `${token} should be listed as outstanding`).toContain(token);
    }
  });

  it("asks for the axis rather than assuming one", () => {
    expect(parsed.issues.some((i) => i.code === "parse:missing-axis")).toBe(true);
  });

  it("carries a role map that already points at real contract tokens", () => {
    // The roles are pre-filled in the template, so they must not be a source of errors.
    expect(parsed.issues.some((i) => i.code === "parse:role-points-nowhere")).toBe(false);
    expect(parsed.issues.some((i) => i.code === "parse:missing-roles")).toBe(false);
  });

  it("declares its token kinds, so nothing is left unclassified", () => {
    expect(parsed.issues.some((i) => i.code === "parse:unclassified-tokens")).toBe(false);
  });
});

describe("the filled template parses completely", () => {
  const parsed = parseBrandDocument(fillTemplate(TEMPLATE));

  it("parses with no errors and nothing left to declare", () => {
    expect(parsed.issues).toEqual([]);
    expect(parsed.parsed).toBe(true);
    expect(parsed.complete).toBe(true);
  });

  it("yields one resting mode", () => {
    expect(parsed.modeOrder).toEqual(["default"]);
    expect(parsed.modes.default?.resting).toBe(true);
    expect(parsed.modes.default?.axis).toBe("light");
  });

  it("carries every one of the 19 tokens", () => {
    expect(Object.keys(parsed.modes.default?.tokens ?? {})).toHaveLength(19);
  });

  it("classifies kinds correctly, including lengths and font stacks", () => {
    const kinds = new Map(parsed.contract.map((c) => [c.name, c.kind]));
    expect(kinds.get("--c-paper")).toBe("color");
    expect(kinds.get("--c-radius")).toBe("length");
    expect(kinds.get("--c-font-body")).toBe("fontstack");
  });

  it("keeps a font stack intact, quotes and commas included", () => {
    expect(parsed.modes.default?.tokens["--c-font-body"]).toBe("'Inter',system-ui,sans-serif");
  });
});

describe("a partly filled template reports only what is left", () => {
  it("names the remaining tokens and no others", () => {
    const partial = { ...FILL };
    delete partial["--c-crit"];
    delete partial["--c-font-fig"];

    const parsed = parseBrandDocument(fillTemplate(TEMPLATE, partial));
    const incomplete = parsed.issues.find((i) => i.code === "parse:incomplete-mode");

    expect(incomplete?.message).toContain("2 of 19");
    expect(incomplete?.message).toContain("--c-crit");
    expect(incomplete?.message).toContain("--c-font-fig");
    // Tokens that WERE filled must not be reported as outstanding.
    expect(incomplete?.message).not.toContain("--c-paper");
  });
});

describe("the template teaches the format it belongs to", () => {
  it("tells the reader that a blank is safe to send", () => {
    expect(TEMPLATE).toContain("reported back to you");
    expect(TEMPLATE).toContain("rather than a silent partial import");
  });

  it("warns that deleting a token means deleting it in both places", () => {
    expect(TEMPLATE).toMatch(/delete it from \*\*both\*\*/i);
  });

  it("says one mode is a complete and normal document", () => {
    expect(TEMPLATE).toMatch(/one mode is a complete and normal document/i);
  });

  it("marks the product rules section as the one that cannot be recovered", () => {
    expect(TEMPLATE).toContain("cannot be recovered from a product");
  });

  it("asks which acceptance checks need a person, rather than implying all are automated", () => {
    expect(TEMPLATE).toContain("needs someone standing");
  });

  it("promises measurement without silent correction", () => {
    expect(TEMPLATE).toContain("Nothing is silently corrected");
  });
});
