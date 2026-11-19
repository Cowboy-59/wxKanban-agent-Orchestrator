// SPEC-127 / T005, T006, T007 and the T010 round trip.
//
// Written directly: the fencer rejects test files with no top-level declaration.
import { describe, expect, it } from "vitest";

import type { SiteStyleCapture } from "../../src/server/services/SiteStyleCaptureService.js";
import {
  CAPTURE_CONTRACT,
  UNANSWERED_SECTIONS,
  captureBrandDocument,
  captureToBrand,
  renderCapturedDocument,
} from "../../src/ingest/brandschema/capture.js";
import { parseBrandDocument } from "../../src/ingest/brandschema/parse.js";

/** A product that exposes most of what a page can show. */
function richCapture(): SiteStyleCapture {
  return {
    url: "https://example-plant.com",
    method: "headless",
    backgroundColor: "rgb(238, 241, 244)",
    textColor: "#14181D",
    primaryColor: "rgb(37, 99, 235)",
    primaryTextColor: "#ffffff",
    borderColor: "#DDE3E9",
    radius: "8px",
    fontFamilies: ["Inter", "Lexend Deca"],
    cssVars: {},
    palette: [],
  };
}

/** A product that exposes almost nothing — the static-fallback case. */
function sparseCapture(): SiteStyleCapture {
  return {
    url: "https://example-plant.com",
    method: "static",
    backgroundColor: null,
    textColor: null,
    primaryColor: null,
    primaryTextColor: null,
    borderColor: null,
    radius: null,
    fontFamilies: [],
    cssVars: {},
    palette: [],
  };
}

describe("T006 — measured is never mixed with assumed", () => {
  it("marks every value as measured or default, with no third state", () => {
    const brand = captureToBrand(richCapture());
    for (const v of brand.values) {
      expect(["measured", "default"]).toContain(v.provenance);
    }
  });

  it("marks what the product actually showed as measured", () => {
    const brand = captureToBrand(richCapture());
    const paper = brand.values.find((v) => v.token === "--c-paper");
    expect(paper?.provenance).toBe("measured");
    expect(paper?.value).toBe("#EEF1F4");
  });

  it("converts computed rgb() into hex without inventing a value", () => {
    const brand = captureToBrand(richCapture());
    expect(brand.values.find((v) => v.token === "--c-accent")?.value).toBe("#2563EB");
  });

  it("marks anything absent as default, and says why", () => {
    const brand = captureToBrand(sparseCapture());
    const defaults = brand.values.filter((v) => v.provenance === "default");
    expect(defaults.length).toBeGreaterThan(0);
    for (const d of defaults) {
      expect(d.note, `${d.token} should explain its default`).toBeTruthy();
    }
  });

  it("defaults are neutral, so they cannot be mistaken for design decisions", () => {
    const brand = captureToBrand(sparseCapture());
    expect(brand.values.find((v) => v.token === "--c-paper")?.value).toBe("#FFFFFF");
  });

  it("never claims a data face the product did not show", () => {
    const brand = captureToBrand(richCapture());
    const data = brand.fonts.find((f) => f.role === "data");
    expect(data?.provenance).toBe("default");
  });
});

describe("T006 — nothing is fabricated", () => {
  it("leaves six sections explicitly unanswered", () => {
    const brand = captureToBrand(richCapture());
    expect(brand.unanswered).toHaveLength(6);
    expect(brand.unanswered).toEqual(UNANSWERED_SECTIONS);
  });

  it("asks for product rules, and says why it cannot know them", () => {
    const prompt = UNANSWERED_SECTIONS.find((u) => u.section === "Product rules")?.prompt ?? "";
    expect(prompt).toContain("stylesheet");
    expect(prompt.toLowerCase()).toContain("never recover");
  });

  it("emits no rules of any kind — they are invisible in CSS", () => {
    const doc = renderCapturedDocument(captureToBrand(richCapture()));
    // Every rule-shaped section must be an open prompt, not a statement.
    expect(doc).toContain("> UNANSWERED");
    expect(doc).not.toMatch(/^- Blue leads/m);
    const unansweredCount = (doc.match(/> UNANSWERED/g) ?? []).length;
    expect(unansweredCount).toBe(6);
  });

  it("states the measured/defaulted split in the document header", () => {
    const doc = renderCapturedDocument(captureToBrand(sparseCapture()));
    expect(doc).toMatch(/\d+ value\(s\) measured, \d+ defaulted, 6 section\(s\) unanswered/);
  });

  it("carries a provenance table naming every token", () => {
    const doc = renderCapturedDocument(captureToBrand(richCapture()));
    for (const c of CAPTURE_CONTRACT) {
      expect(doc, `${c.token} should appear in the provenance table`).toContain(c.token);
    }
  });
});

describe("T007 — a captured brand has exactly one mode", () => {
  it("emits one mode, and it is the resting one", () => {
    const parsed = parseBrandDocument(renderCapturedDocument(captureToBrand(richCapture())));
    expect(parsed.modeOrder).toEqual(["captured"]);
    expect(parsed.modes.captured?.resting).toBe(true);
  });

  it("never fabricates an alternative presentation, however rich the capture", () => {
    const busy = { ...richCapture(), palette: ["#000", "#fff", "#f00", "#0f0", "#00f"] };
    const parsed = parseBrandDocument(renderCapturedDocument(captureToBrand(busy)));
    // A palette with five colours is still ONE look.
    expect(parsed.modeOrder).toHaveLength(1);
  });

  it("invites additional presentations rather than inventing them", () => {
    const doc = renderCapturedDocument(captureToBrand(richCapture()));
    expect(doc).toContain("Additional presentations");
    expect(doc).toContain("Capture does not invent them");
  });
});

describe("T010 — a captured document parses through the ingest it was generated for", () => {
  it("round-trips cleanly, with no errors and nothing left to declare", () => {
    const doc = renderCapturedDocument(captureToBrand(richCapture()));
    const parsed = parseBrandDocument(doc);
    expect(parsed.parsed).toBe(true);
    expect(parsed.complete).toBe(true);
    expect(parsed.issues).toEqual([]);
  });

  it("round-trips even when the product showed almost nothing", () => {
    const parsed = parseBrandDocument(renderCapturedDocument(captureToBrand(sparseCapture())));
    expect(parsed.parsed).toBe(true);
    expect(parsed.complete).toBe(true);
  });

  it("declares every contract token in its one mode", () => {
    const parsed = parseBrandDocument(renderCapturedDocument(captureToBrand(richCapture())));
    expect(parsed.contract).toHaveLength(CAPTURE_CONTRACT.length);
    const tokens = Object.keys(parsed.modes.captured?.tokens ?? {});
    expect(tokens).toHaveLength(CAPTURE_CONTRACT.length);
  });

  it("classifies its own token kinds, so nothing is left to guess", () => {
    const parsed = parseBrandDocument(renderCapturedDocument(captureToBrand(richCapture())));
    const kinds = new Map(parsed.contract.map((c) => [c.name, c.kind]));
    expect(kinds.get("--c-paper")).toBe("color");
    expect(kinds.get("--c-radius")).toBe("length");
    expect(kinds.get("--c-font-body")).toBe("fontstack");
  });

  it("declares a role map pointing only at tokens it declares", () => {
    const parsed = parseBrandDocument(renderCapturedDocument(captureToBrand(richCapture())));
    expect(parsed.issues.some((i) => i.code === "parse:role-points-nowhere")).toBe(false);
    expect(parsed.issues.some((i) => i.code === "parse:missing-roles")).toBe(false);
  });
});

describe("T005 — the credential boundary", () => {
  it("captures through an injected reader, and is handed only a URL", async () => {
    const seen: string[] = [];
    const reader = async (url: string): Promise<SiteStyleCapture> => {
      seen.push(url);
      return richCapture();
    };
    const { document, brand } = await captureBrandDocument(
      { url: "https://example-plant.com", label: "ProActive (staging)" },
      reader,
    );
    expect(seen).toEqual(["https://example-plant.com"]);
    expect(brand.sourceLabel).toBe("ProActive (staging)");
    expect(parseBrandDocument(document).complete).toBe(true);
  });

  it("exposes no credential surface at all", () => {
    // The guard is structural: the function takes a URL and a reader, and nothing else. If a
    // credential parameter is ever added, this assertion is the place it will be noticed.
    expect(captureBrandDocument.length).toBe(2);
  });

  it("propagates a reader failure rather than emitting a speculative document", async () => {
    const failing = async (): Promise<SiteStyleCapture> => {
      throw new Error("blocked: private network address");
    };
    await expect(
      captureBrandDocument({ url: "http://169.254.169.254/" }, failing),
    ).rejects.toThrow(/blocked/);
  });
});
