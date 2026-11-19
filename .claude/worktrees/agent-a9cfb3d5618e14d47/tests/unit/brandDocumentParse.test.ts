// SPEC-127 / T009 — the reference corpus.
//
// The real customer document on disk is the fixture. Two things are asserted and both matter:
//
//   1. What it DOES supply parses exactly — 6 modes of 41 contract tokens, zero errors.
//   2. What it does NOT supply is reported precisely, and is never guessed.
//
// The second half is the point. This document is excellent and still not machine-complete: it
// carries no role map, no per-mode light/dark declaration and no resting declaration. A parser
// that inferred those would produce a schema nobody audited, and the inference would be wrong in
// the case that matters — a white-surfaced mode is not necessarily a light mode.
//
// Written directly rather than through the orchestrator: the fencer rejects files that declare
// nothing at top level.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  describeParseIssues,
  parseBrandDocument,
  declaredKind,
} from "../../src/ingest/brandschema/parse.js";

const DOC = readFileSync(
  join(process.cwd(), "docs", "ProActive_Brand_Schema_Instruction.md"),
  "utf-8",
);

describe("reference corpus — what the document supplies", () => {
  const result = parseBrandDocument(DOC);

  it("parses structurally, with no errors", () => {
    expect(result.parsed).toBe(true);
    expect(result.issues.filter((i) => i.severity === "error")).toEqual([]);
  });

  it("finds exactly 6 modes, in document order", () => {
    expect(result.modeOrder).toEqual([
      "standard",
      "instrument",
      "field",
      "ledger",
      "psikiq",
      "psikiqPaper",
    ]);
  });

  it("finds exactly 41 contract tokens, with none duplicated", () => {
    expect(result.contract).toHaveLength(41);
    const names = result.contract.map((t) => t.name);
    expect(new Set(names).size).toBe(41);
  });

  it("every mode declares every contract token — 6 x 41, nothing missing, nothing extra", () => {
    const contractNames = result.contract.map((t) => t.name);
    for (const modeName of result.modeOrder) {
      const mode = result.modes[modeName];
      expect(mode, `mode ${modeName} should exist`).toBeDefined();
      const tokens = Object.keys(mode?.tokens ?? {});
      expect(tokens).toHaveLength(41);
      for (const t of contractNames) {
        expect(mode?.tokens[t], `${modeName} should declare ${t}`).toBeTruthy();
      }
    }
  });

  it("keeps a gradient value intact rather than mangling it into a colour", () => {
    const instrument = result.modes.instrument;
    expect(instrument?.tokens["--m-hazard"]).toContain("repeating-linear-gradient");
  });

  it("keeps font stacks intact, commas and quotes included", () => {
    expect(result.modes.standard?.tokens["--m-font-body"]).toContain("'Inter'");
    expect(result.modes.ledger?.tokens["--m-font-disp"]).toContain("Instrument Serif");
  });
});

describe("reference corpus — what the document does NOT supply", () => {
  const result = parseBrandDocument(DOC);
  const needs = result.issues.filter((i) => i.severity === "required-declaration");

  it("is not complete, despite parsing cleanly", () => {
    expect(result.parsed).toBe(true);
    expect(result.complete).toBe(false);
  });

  it("reports 14 required declarations", () => {
    // 6 modes x (axis + resting) = 12, plus token kinds, plus the role map.
    expect(needs).toHaveLength(14);
  });

  it("asks every mode for its light/dark relationship, and infers none", () => {
    const axis = needs.filter((i) => i.code === "parse:missing-axis");
    expect(axis).toHaveLength(6);
    for (const mode of result.modeOrder) {
      expect(axis.some((i) => i.message.includes(`'${mode}'`))).toBe(true);
    }
  });

  it("asks every mode whether it is the resting mode", () => {
    expect(needs.filter((i) => i.code === "parse:missing-resting")).toHaveLength(6);
  });

  it("asks for a role map, because checks must run against roles not token names", () => {
    const roles = needs.filter((i) => i.code === "parse:missing-roles");
    expect(roles).toHaveLength(1);
    expect(roles[0]?.message).toContain("ROLES");
  });

  it("asks for token kinds rather than guessing them from values", () => {
    const kinds = needs.filter((i) => i.code === "parse:unclassified-tokens");
    expect(kinds).toHaveLength(1);
    expect(kinds[0]?.message).toContain("41");
  });

  it("points at a line for every mode-level finding", () => {
    for (const issue of needs.filter((i) => i.code.startsWith("parse:missing-"))) {
      if (issue.code === "parse:missing-roles") continue;
      expect(issue.location?.line).toBeGreaterThan(0);
      expect(issue.location?.excerpt.length ?? 0).toBeGreaterThan(0);
    }
  });

  it("describes every issue in language a customer can act on", () => {
    const lines = describeParseIssues(result);
    expect(lines).toHaveLength(14);
    expect(lines.every((l) => l.startsWith("NEEDS DECLARING") || l.startsWith("ERROR"))).toBe(true);
  });
});

describe("rejection is loud, never partial", () => {
  it("refuses a document with no contract block, and imports nothing", () => {
    const r = parseBrandDocument("# A brand\n\nSome prose and no contract at all.\n");
    expect(r.parsed).toBe(false);
    expect(r.complete).toBe(false);
    expect(r.modeOrder).toEqual([]);
    expect(r.contract).toEqual([]);
    expect(r.issues[0]?.code).toBe("parse:no-contract");
  });

  it("names a mode that omits contract tokens, and lists them", () => {
    const doc = [
      "```",
      "COLOUR  --m-paper --m-ink --m-accent",
      "```",
      "",
      "### `only` — a mode",
      "",
      "- Axis: light",
      "- Resting: yes",
      "",
      "```css",
      "--m-paper:#ffffff;",
      "```",
      "",
    ].join("\n");
    const r = parseBrandDocument(doc);
    const err = r.issues.find((i) => i.code === "parse:incomplete-mode");
    expect(err?.severity).toBe("error");
    expect(err?.message).toContain("--m-ink");
    expect(err?.message).toContain("--m-accent");
    expect(r.parsed).toBe(false);
  });

  it("names a token the contract does not declare", () => {
    const doc = [
      "```",
      "COLOUR  --m-paper",
      "```",
      "",
      "### `only` — a mode",
      "- Axis: light",
      "- Resting: yes",
      "",
      "```css",
      "--m-paper:#fff; --m-stray:#000;",
      "```",
      "",
    ].join("\n");
    const r = parseBrandDocument(doc);
    expect(r.issues.some((i) => i.code === "parse:undeclared-token" && i.message.includes("--m-stray"))).toBe(true);
  });

  it("accepts a single-mode document — a captured product has one look", () => {
    const doc = [
      "```",
      "COLOUR  --m-paper --m-ink --m-body --m-accent",
      "```",
      "",
      "ROLES",
      "surface: --m-paper",
      "body: --m-body",
      "ink: --m-ink",
      "accent: --m-accent",
      "",
      "### `captured` — as built",
      "",
      "- Axis: light",
      "- Resting: yes",
      "",
      "```css",
      "--m-paper:#ffffff; --m-ink:#111111; --m-body:#333333; --m-accent:#0055cc;",
      "```",
      "",
    ].join("\n");
    const r = parseBrandDocument(doc);
    expect(r.modeOrder).toEqual(["captured"]);
    expect(r.issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(r.modes.captured?.axis).toBe("light");
    expect(r.modes.captured?.resting).toBe(true);
  });

  it("rejects a role that points at a token the contract does not declare", () => {
    const doc = [
      "```",
      "COLOUR  --m-paper --m-ink --m-body --m-accent",
      "```",
      "",
      "ROLES",
      "surface: --m-nonexistent",
      "body: --m-body",
      "ink: --m-ink",
      "accent: --m-accent",
      "",
      "### `only` — a mode",
      "- Axis: light",
      "- Resting: yes",
      "",
      "```css",
      "--m-paper:#fff; --m-ink:#000; --m-body:#333; --m-accent:#05c;",
      "```",
      "",
    ].join("\n");
    const r = parseBrandDocument(doc);
    expect(r.issues.some((i) => i.code === "parse:role-points-nowhere")).toBe(true);
    expect(r.parsed).toBe(false);
  });

  it("never throws, whatever it is handed", () => {
    for (const junk of ["", "```\n```", "### `x`", " ", "```\nCOLOUR --m-a\n```"]) {
      expect(() => parseBrandDocument(junk)).not.toThrow();
    }
  });
});

describe("token kind classification", () => {
  it("reads a declared kind and normalises the British spelling", () => {
    const table = new Map([
      ["--m-paper", "colour"],
      ["--m-hazard", "paint"],
      ["--m-row", "length"],
    ]);
    expect(declaredKind(table, "--m-paper")).toBe("color");
    expect(declaredKind(table, "--m-hazard")).toBe("paint");
    expect(declaredKind(table, "--m-row")).toBe("length");
  });

  it("returns null for an undeclared or unrecognised kind, rather than defaulting", () => {
    const table = new Map([["--m-x", "sparkly"]]);
    expect(declaredKind(table, "--m-x")).toBeNull();
    expect(declaredKind(table, "--m-absent")).toBeNull();
  });
});
