import { describe, it, expect } from "vitest";
import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  CATALOG_TAGS,
  DESIGN_SYSTEM_CATALOG,
  DESIGN_SYSTEM_CATALOG_SIZE,
  catalogEntryForFolder,
  catalogEntryForSlug,
  validateCatalogMap,
} from "~/shared/designsystemcatalog";

// SCOPE-115 / T002 — the curated catalog map. Two guarantees matter here and neither is
// checkable by reading the file: that the map covers the pack exactly (no folder without an
// identity, no identity without a folder), and that no entry leaks its own originating brand
// into the name or slug a customer sees. The pack-coverage tests read the real directory, so
// they skip when the pack is absent — it is currently untracked — rather than failing a
// checkout that legitimately does not have it.

const PACK_ROOT = resolve(__dirname, "../../marketing/AIBM-Design-Systems-Pack");
const packPresent = existsSync(PACK_ROOT);

// [SCOPE 115 / T002] BEGIN — Curated 50-entry naming map (src/shared/designsystemcatalog…
function packFolders(): string[] {
  return readdirSync(PACK_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}
// [SCOPE 115 / T002] END

describe("catalog map structure", () => {
  it("reports no structural problems", () => {
    expect(validateCatalogMap()).toEqual([]);
  });

  it("has exactly 50 entries", () => {
    expect(DESIGN_SYSTEM_CATALOG).toHaveLength(DESIGN_SYSTEM_CATALOG_SIZE);
  });

  it("has unique slugs", () => {
    const slugs = DESIGN_SYSTEM_CATALOG.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("has unique folders", () => {
    const folders = DESIGN_SYSTEM_CATALOG.map((e) => e.folder);
    expect(new Set(folders).size).toBe(folders.length);
  });

  it("has unique names", () => {
    const names = DESIGN_SYSTEM_CATALOG.map((e) => e.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("uses only url-safe slugs", () => {
    for (const entry of DESIGN_SYSTEM_CATALOG) {
      expect(entry.slug).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("leads every tag list with the native mode", () => {
    for (const entry of DESIGN_SYSTEM_CATALOG) {
      expect(["light", "dark"]).toContain(entry.tags[0]);
    }
  });

  it("draws every tag from the controlled vocabulary", () => {
    const allowed = new Set(CATALOG_TAGS);
    for (const entry of DESIGN_SYSTEM_CATALOG) {
      for (const tag of entry.tags) expect(allowed.has(tag)).toBe(true);
    }
  });

  it("gives every entry at least one character tag beyond its mode", () => {
    for (const entry of DESIGN_SYSTEM_CATALOG) {
      expect(entry.tags.length).toBeGreaterThan(1);
    }
  });

  it("splits 40 light / 10 dark, matching the measured pack", () => {
    const dark = DESIGN_SYSTEM_CATALOG.filter((e) => e.tags[0] === "dark");
    const light = DESIGN_SYSTEM_CATALOG.filter((e) => e.tags[0] === "light");
    expect(dark).toHaveLength(10);
    expect(light).toHaveLength(40);
  });
});

describe("brand containment", () => {
  it("never repeats an entry's own folder inside its name or slug", () => {
    for (const entry of DESIGN_SYSTEM_CATALOG) {
      const brand = entry.folder.toLowerCase();
      const wordRe = new RegExp(`\\b${brand.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&")}\\b`);
      expect(entry.name.toLowerCase()).not.toMatch(wordRe);
      expect(entry.slug.replace(/-/g, " ")).not.toMatch(wordRe);
    }
  });

  it("keeps the brand only on the folder field, which is never customer-facing", () => {
    // The row's `sourcebrand` is derived from `folder` at seed time; the customer-facing
    // surface is name + slug + tags, so those three are all that may be serialised.
    for (const entry of DESIGN_SYSTEM_CATALOG) {
      const customerFacing = `${entry.name} ${entry.slug} ${entry.tags.join(" ")}`;
      expect(customerFacing).not.toContain(entry.folder);
    }
  });
});

describe("lookups", () => {
  it("resolves a known folder", () => {
    const entry = catalogEntryForFolder("Linear");
    expect(entry?.slug).toBe("electric-indigo-on-near-black");
    expect(entry?.tags[0]).toBe("dark");
  });

  it("resolves a known slug", () => {
    expect(catalogEntryForSlug("oat-cream-apothecary")?.folder).toBe("Aesop");
  });

  it("returns undefined for an unknown folder rather than inventing a name", () => {
    expect(catalogEntryForFolder("NotInThePack")).toBeUndefined();
  });

  it("returns undefined for an unknown slug", () => {
    expect(catalogEntryForSlug("no-such-system")).toBeUndefined();
  });

  it("is case-sensitive on folder, matching the filesystem key", () => {
    expect(catalogEntryForFolder("linear")).toBeUndefined();
    expect(catalogEntryForFolder("Linear")).toBeDefined();
  });
});

describe.skipIf(!packPresent)("pack coverage", () => {
  it("covers every folder in the pack", () => {
    const missing = packFolders().filter((folder) => !catalogEntryForFolder(folder));
    expect(missing).toEqual([]);
  });

  it("has no entry pointing at a folder that does not exist", () => {
    const folders = new Set(packFolders());
    const orphans = DESIGN_SYSTEM_CATALOG.map((e) => e.folder).filter((f) => !folders.has(f));
    expect(orphans).toEqual([]);
  });

  it("covers exactly as many folders as the pack contains", () => {
    expect(DESIGN_SYSTEM_CATALOG).toHaveLength(packFolders().length);
  });
});
