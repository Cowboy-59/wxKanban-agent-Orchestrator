/**
 * Capture a built product into a brand instruction document — SPEC-127 / T005, T006, T007.
 *
 * Most customers have no written brand. They have a working application whose brand is implicit in
 * its rendered CSS. This turns that into a first draft they can review, correct and complete.
 *
 * It reuses the shipped site-style extraction rather than introducing a second engine: that path
 * already drives a headless browser, already falls back to a static read, and already carries the
 * SSRF guard that keeps a server-side fetch away from loopback, private ranges and the cloud
 * metadata endpoint.
 *
 * THREE RULES THIS MODULE EXISTS TO HOLD
 *
 *   1. NO CREDENTIALS, EVER. Capture accepts a page it can reach or a rendered page the customer
 *      supplies. It never accepts, stores, forwards or replays a credential, and never
 *      authenticates against a customer system. This is a permanent boundary, not a deferred
 *      feature: the whole value of this path is that it only reads public rendering.
 *
 *   2. ONE MODE. A product that has been built has one look. Capture emits a single resting mode
 *      and never fabricates alternatives — a second mode would be an invention presented as an
 *      observation.
 *
 *   3. MEASURED IS NEVER MIXED WITH ASSUMED. Every value is marked. Everything that cannot be
 *      derived is emitted as an explicit unanswered prompt rather than plausible filler. Rules in
 *      particular are invisible in CSS: a captured document that quietly invented one would read
 *      as authoritative, which makes it the most dangerous artifact this system could produce.
 */
import type { SiteStyleCapture } from "../../server/services/SiteStyleCaptureService.js";

/** Where a value in a generated document came from. */
export type Provenance =
  /** Read from the product's own rendering. */
  | "measured"
  /** Not present in the product; a safe placeholder a reviewer must confirm or replace. */
  | "default";

export interface CapturedValue {
  token: string;
  value: string;
  provenance: Provenance;
  /** Why a default was chosen, when it was. */
  note?: string;
}

export interface CapturedBrand {
  /** What was captured, for the document header. */
  sourceLabel: string;
  method: string;
  capturedAt: string;
  values: CapturedValue[];
  fonts: { role: string; family: string; fallback: string[]; provenance: Provenance }[];
  /** Sections a person must complete. Never guessed. */
  unanswered: { section: string; prompt: string }[];
}

/** The token contract a captured brand declares. Small and honest: only what a product can show. */
export const CAPTURE_CONTRACT: { token: string; kind: string; role?: string }[] = [
  { token: "--c-paper", kind: "color", role: "surface" },
  { token: "--c-ink", kind: "color", role: "ink" },
  { token: "--c-body", kind: "color", role: "body" },
  { token: "--c-accent", kind: "color", role: "accent" },
  { token: "--c-accent-ink", kind: "color" },
  { token: "--c-rule", kind: "color" },
  { token: "--c-radius", kind: "length" },
  { token: "--c-font-disp", kind: "fontstack" },
  { token: "--c-font-body", kind: "fontstack" },
  { token: "--c-font-data", kind: "fontstack" },
  { token: "--c-font-fig", kind: "fontstack" },
];

/**
 * Defaults used only when a product does not show a value.
 *
 * Every one is neutral on purpose. A default that looked like a design decision would be mistaken
 * for one, so these are deliberately plain and always labelled.
 */
const DEFAULTS: Record<string, { value: string; note: string }> = {
  "--c-paper": { value: "#FFFFFF", note: "no page background could be read; plain white assumed" },
  "--c-ink": { value: "#111111", note: "no heading colour could be read; near-black assumed" },
  "--c-body": { value: "#333333", note: "no body text colour could be read; dark grey assumed" },
  "--c-accent": { value: "#0055CC", note: "no dominant action colour could be read; a plain blue assumed" },
  "--c-accent-ink": { value: "#FFFFFF", note: "no text colour on the action colour could be read; white assumed" },
  "--c-rule": { value: "#DDDDDD", note: "no border colour could be read; light grey assumed" },
  "--c-radius": { value: "6px", note: "no corner radius could be read; a modest radius assumed" },
};

const MONO_STACK = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
const SANS_FALLBACK = ["system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"];

// [SCOPE 127 / T005] BEGIN — Capture: extend rendered-styling extraction to emit a docum…
function hexish(value: string | null): string | null {
  if (!value) return null;
  const v = value.trim();
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v)) return v.toUpperCase();
  // rgb()/rgba() — convert, because a product reports computed styles in that form.
  const m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(v);
  if (!m) return null;
  const to2 = (n: string): string => Number(n).toString(16).padStart(2, "0");
  return ("#" + to2(String(m[1])) + to2(String(m[2])) + to2(String(m[3]))).toUpperCase();
}
// [SCOPE 127 / T005] END

// [SCOPE 127 / T005] BEGIN — Capture: extend rendered-styling extraction to emit a docum…
function pick(token: string, measured: string | null): CapturedValue {
  const hex = hexish(measured);
  if (hex) return { token, value: hex, provenance: "measured" };
  if (measured && token === "--c-radius") {
    return { token, value: measured.trim(), provenance: "measured" };
  }
  const fallback = DEFAULTS[token];
  return {
    token,
    value: fallback?.value ?? "#000000",
    provenance: "default",
    note: fallback?.note ?? "not present in the captured product",
  };
}
// [SCOPE 127 / T005] END

/**
 * The sections a captured document always leaves open.
 *
 * These are not oversights. Each is something the product genuinely cannot tell us, listed so a
 * reviewer knows exactly what is being asked of them and why.
 */
export const UNANSWERED_SECTIONS: { section: string; prompt: string }[] = [
  {
    section: "Product rules",
    prompt:
      "Nothing in a stylesheet records how this product behaves. State any rule the interface must carry — " +
      "for example whether a warning blocks access or only raises a review. This is usually the most important " +
      "thing a brand document says, and it is the one thing capture can never recover.",
  },
  {
    section: "Invariants",
    prompt:
      "What must remain true on every screen, in every presentation? For example which colour may carry the " +
      "primary action, and which colour is identity only and must never become a button.",
  },
  {
    section: "Prohibitions",
    prompt: "What must never be done? Anything a reviewer should reject on sight.",
  },
  {
    section: "Status colours",
    prompt:
      "Capture reads the colours a page happens to show, which rarely include success, warning and critical " +
      "states. Name them if this product has them — their meaning is fixed across every presentation and they " +
      "are checked for readability.",
  },
  {
    section: "Identity mark",
    prompt:
      "Is there a colour used for identity alone — a logo or a rail marker — that must never be used for an action? " +
      "If so, name it and the surface it sits on, so it can be checked for visibility.",
  },
  {
    section: "Additional presentations",
    prompt:
      "This document describes the one look the product currently has. If other presentations are wanted — a " +
      "high-contrast outdoor mode, a darker workshop display, a print-safe version for documents — describe them " +
      "and they can be added. Capture does not invent them.",
  },
];

/**
 * Turn an observed site style into a captured brand.
 *
 * Takes an already-performed capture rather than a URL, so that the same code serves both accepted
 * inputs: a page we fetched, and a rendered page the customer supplied. Neither carries a credential.
 */
// [SCOPE 127 / T005] BEGIN — Capture: extend rendered-styling extraction to emit a docum…
export function captureToBrand(capture: SiteStyleCapture, sourceLabel?: string): CapturedBrand {
  const values: CapturedValue[] = [
    pick("--c-paper", capture.backgroundColor),
    pick("--c-ink", capture.textColor),
    pick("--c-body", capture.textColor),
    pick("--c-accent", capture.primaryColor),
    pick("--c-accent-ink", capture.primaryTextColor),
    pick("--c-rule", capture.borderColor),
    pick("--c-radius", capture.radius),
  ];

  const observed = capture.fontFamilies.filter((f) => f && f.trim().length > 0);
  const primaryFont = observed[0]?.trim() ?? null;
  const secondFont = observed[1]?.trim() ?? primaryFont;

  const fontFor = (
    role: string,
    family: string | null,
    fallback: string[],
  ): { role: string; family: string; fallback: string[]; provenance: Provenance } =>
    family
      ? { role, family, fallback, provenance: "measured" }
      : { role, family: "system-ui", fallback, provenance: "default" };

  const fonts = [
    fontFor("display", secondFont, SANS_FALLBACK),
    fontFor("body", primaryFont, SANS_FALLBACK),
    // A product almost never exposes a distinct data or figure face; these are labelled defaults
    // rather than pretending the product asked for them.
    { role: "data", family: "ui-monospace", fallback: MONO_STACK.split(", ").slice(1), provenance: "default" as Provenance },
    fontFor("figure", secondFont, SANS_FALLBACK),
  ];

  for (const f of fonts) {
    const token = "--c-font-" + (f.role === "display" ? "disp" : f.role === "figure" ? "fig" : f.role);
    values.push({
      token,
      value: [f.family, ...f.fallback].map((x) => (/\s/.test(x) ? `'${x}'` : x)).join(","),
      provenance: f.provenance,
      note: f.provenance === "default" ? "no distinct face for this role was observed" : undefined,
    });
  }

  return {
    sourceLabel: sourceLabel ?? capture.url,
    method: capture.method,
    capturedAt: new Date().toISOString().slice(0, 10),
    values,
    fonts,
    unanswered: UNANSWERED_SECTIONS,
  };
}
// [SCOPE 127 / T005] END

// [SCOPE 127 / T005] BEGIN — Capture: extend rendered-styling extraction to emit a docum…
function valueFor(brand: CapturedBrand, token: string): string {
  return brand.values.find((v) => v.token === token)?.value ?? "";
}
// [SCOPE 127 / T005] END

/**
 * Render a captured brand as a brand instruction document.
 *
 * The output is written to satisfy the format reference, so that a captured document can be fed
 * straight back through the same parser that reads a hand-authored one. A generator and a parser
 * that disagree about their shared format is the defect this shape exists to prevent.
 */
// [SCOPE 127 / T005] BEGIN — Capture: extend rendered-styling extraction to emit a docum…
export function renderCapturedDocument(brand: CapturedBrand): string {
  const L: string[] = [];
  const measured = brand.values.filter((v) => v.provenance === "measured").length;
  const defaulted = brand.values.length - measured;

  L.push("# Brand Instruction Document — captured draft", "");
  L.push(`**Source:** ${brand.sourceLabel}`);
  L.push(`**Captured:** ${brand.capturedAt} (via ${brand.method})`);
  L.push(`**Status:** DRAFT — ${measured} value(s) measured, ${defaulted} defaulted, ${brand.unanswered.length} section(s) unanswered`);
  L.push("");
  L.push(
    "> This draft was read from a product that already exists. Everything below marked **measured** was",
    "> taken from what the product actually renders. Everything marked **default** was not present and is a",
    "> placeholder to confirm or replace. Nothing has been invented: the sections at the end are left open",
    "> because a stylesheet cannot answer them.",
  );
  L.push("", "---", "");

  L.push("## Token contract", "");
  L.push("```");
  L.push("COLOUR     " + CAPTURE_CONTRACT.filter((c) => c.kind === "color").map((c) => c.token).join(" "));
  L.push("FORM       " + CAPTURE_CONTRACT.filter((c) => c.kind === "length").map((c) => c.token).join(" "));
  L.push("TYPE       " + CAPTURE_CONTRACT.filter((c) => c.kind === "fontstack").map((c) => c.token).join(" "));
  L.push("```", "");

  L.push("## Token kinds", "");
  L.push("| Token | Kind | Provenance |");
  L.push("|---|---|---|");
  for (const c of CAPTURE_CONTRACT) {
    const v = brand.values.find((x) => x.token === c.token);
    L.push(`| \`${c.token}\` | ${c.kind} | ${v?.provenance ?? "default"} |`);
  }
  L.push("");

  L.push("## Roles", "");
  L.push("```");
  L.push("ROLES");
  L.push("surface: --c-paper");
  L.push("body: --c-body");
  L.push("ink: --c-ink");
  L.push("accent: --c-accent");
  L.push("```", "");

  L.push("## Typefaces", "");
  L.push("| Role | Family | Fallback | Provenance |");
  L.push("|---|---|---|---|");
  for (const f of brand.fonts) {
    L.push(`| ${f.role} | ${f.family} | ${f.fallback.join(", ")} | ${f.provenance} |`);
  }
  L.push("");

  // ONE mode. Never more — see rule 2 at the top of this file.
  L.push("## Modes", "");
  L.push("### `captured` — the product as it stands", "");
  L.push("- Axis: light");
  L.push("- Resting: yes");
  L.push("");
  L.push("```css");
  for (const c of CAPTURE_CONTRACT) {
    L.push(`${c.token}:${valueFor(brand, c.token)};`);
  }
  L.push("```", "");
  L.push(
    "A product that has been built has one look, so this document describes one mode and it is the resting",
    "one. Alternative presentations are added deliberately — see the last unanswered section below.",
    "",
  );

  L.push("## Provenance", "");
  L.push("| Token | Value | Provenance | Note |");
  L.push("|---|---|---|---|");
  for (const v of brand.values) {
    L.push(`| \`${v.token}\` | \`${v.value}\` | **${v.provenance}** | ${v.note ?? ""} |`);
  }
  L.push("");

  L.push("---", "");
  L.push("## Sections this capture could not answer", "");
  L.push(
    "Each of these is something the product genuinely cannot tell us. They are left blank rather than",
    "filled with a plausible guess, because a guessed rule would read as an authoritative one.",
    "",
  );
  for (const u of brand.unanswered) {
    L.push(`### ${u.section}`, "");
    L.push("> UNANSWERED", `> ${u.prompt}`, "");
  }

  return L.join("\n");
}
// [SCOPE 127 / T005] END

/**
 * Capture a reachable page and render it as a brand instruction document.
 *
 * `captureSiteStyle` is passed in rather than imported directly so this module stays testable
 * without a browser, and so the same function serves a supplied rendered page.
 *
 * There is no credential parameter, and adding one would be a change to the scope's boundary
 * rather than to this function.
 */
// [SCOPE 127 / T005] BEGIN — Capture: extend rendered-styling extraction to emit a docum…
export async function captureBrandDocument(
  source: { url: string; label?: string },
// [SCOPE 127 / T005] END
  capture: (url: string) => Promise<SiteStyleCapture>,
): Promise<{ document: string; brand: CapturedBrand }> {
  const observed = await capture(source.url);
  const brand = captureToBrand(observed, source.label);
  return { document: renderCapturedDocument(brand), brand };
}
