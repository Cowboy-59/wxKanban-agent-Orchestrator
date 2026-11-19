/**
 * Bio staleness — unit tests for SCOPE-100 / T004 (FR-008).
 *
 * Staleness is DERIVED from marketingassets.updatedat, which already exists. No flag
 * column, no migration. Guards US4: English edited but Translate never pressed.
 */

import { describe, it, expect } from "vitest";
import { localeState, anyStale } from "../../src/shared/bio/staleness";

const EN = new Date("2026-07-16T12:00:00Z");

describe("localeState", () => {
  it("reports untranslated when the locale row is absent", () => {
    expect(localeState(EN, undefined)).toBe("untranslated");
  });

  it("reports stale when the locale predates the English source", () => {
    expect(localeState(EN, { updatedat: new Date("2026-07-15T12:00:00Z") })).toBe("stale");
  });

  it("reports current when the locale postdates the English source", () => {
    expect(localeState(EN, { updatedat: new Date("2026-07-16T12:00:01Z") })).toBe("current");
  });

  it("reports current on an exact timestamp tie", () => {
    expect(localeState(EN, { updatedat: new Date(EN) })).toBe("current");
  });
});

describe("anyStale", () => {
  it("is true when any locale is stale", () => {
    expect(anyStale({ "fr-FR": "current", "de-DE": "stale" })).toBe(true);
  });

  it("is true when any locale is untranslated", () => {
    expect(anyStale({ "fr-FR": "current", "de-DE": "untranslated" })).toBe(true);
  });

  it("is false when every locale is current", () => {
    expect(anyStale({ "fr-FR": "current", "de-DE": "current" })).toBe(false);
  });

  it("is false for no locales", () => {
    expect(anyStale({})).toBe(false);
  });
});
