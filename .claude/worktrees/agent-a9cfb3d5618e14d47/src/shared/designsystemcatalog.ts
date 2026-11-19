// SCOPE-114 / T002 — the curated catalog map: pack folder → customer-facing identity.
//
// The 50 analysed design systems live on disk in folders named after the product each was
// captured from, and roughly 45 of those names are live trademarks. That is fine for an
// analysis document sitting in a marketing folder; it is not fine as a picklist inside a
// paid product, or baked into artifacts a customer ships. So the catalog is renamed at the
// boundary: every entry gets a name describing what it actually looks like, and the folder
// name — which IS the originating brand — is stored on the row as `sourcebrand` purely for
// traceability and is never serialised to a client or written into a generated file.
//
// Renaming also happens to be the better product. "Electric Indigo on Near-Black" tells a
// customer choosing a look far more than a company name does, and it keeps the choice about
// design rather than about brand affinity.
//
// This map is hand-curated rather than derived. Each name was authored from that system's
// own `description` frontmatter, so it reflects the analysis rather than a guess, and it is
// checked in so the catalog is reproducible: re-seeding cannot silently rename anything, and
// a reviewer can read all 50 decisions in one place. Array order is the catalog's
// `sortorder`; entries are kept folder-alphabetical so this file diffs cleanly against the
// pack directory listing.
//
// Adding a 51st system means adding its folder to the pack AND an entry here. The seed
// script treats a folder with no entry as an error rather than inventing a name.

/** One curated catalog identity, mapping a pack folder to what the customer sees. */
export interface DesignSystemCatalogEntry {
  /**
   * The pack folder name under `marketing/AIBM-Design-Systems-Pack/`. This is the ingest
   * key and is also the originating brand — it becomes the row's `sourcebrand` and must
   * never reach a response payload, a generated artifact, or the UI.
   */
  folder: string;
  /** URL-safe unique identifier; the upsert key for idempotent re-seeding. */
  slug: string;
  /** The descriptive, user-visible title. Says what the system looks like. */
  name: string;
  /**
   * Filter facets for the browse surface. The first tag is always the native mode
   * (`light` or `dark`); the rest describe character. All values come from `CATALOG_TAGS`.
   */
  tags: readonly string[];
}

/**
 * The controlled tag vocabulary. Kept closed so the browse filter shows a stable, small
 * set of chips instead of a long tail of near-synonyms, and so a typo in an entry below
 * fails the catalog test rather than quietly creating a new one-item facet.
 */
export const CATALOG_TAGS: readonly string[] = [
  // mode
  "light",
  "dark",
  // character
  "monochrome",
  "minimal",
  "editorial",
  "playful",
  "luxury",
  "warm",
  "technical",
  "geometric",
  "rounded",
  "squared",
  "monospace",
  "high-contrast",
  "vivid-accent",
  "pastel",
  "product",
  "retail",
  "fintech",
  "developer",
];

/** The curated identity for all 50 analysed systems. Array index is the catalog sortorder. */
export const DESIGN_SYSTEM_CATALOG: readonly DesignSystemCatalogEntry[] = [
  {
    folder: "ActiveTheory",
    slug: "chromeless-white-on-pure-black",
    name: "Chromeless White on Pure Black",
    tags: ["dark", "monochrome", "minimal", "technical"],
  },
  {
    folder: "Adidas",
    slug: "squared-technical-monochrome",
    name: "Squared Technical Monochrome",
    tags: ["light", "monochrome", "squared", "technical", "retail"],
  },
  {
    folder: "Aesop",
    slug: "oat-cream-apothecary",
    name: "Oat-Cream Apothecary",
    tags: ["light", "warm", "minimal", "editorial", "luxury"],
  },
  {
    folder: "Aether Apparel",
    slug: "gallery-white-with-sand",
    name: "Gallery White with Sand",
    tags: ["light", "monochrome", "minimal", "editorial", "retail"],
  },
  {
    folder: "All Birds",
    slug: "oatmeal-humanist-retail",
    name: "Oatmeal Humanist Retail",
    tags: ["light", "warm", "rounded", "retail"],
  },
  {
    folder: "Anthropic",
    slug: "cream-editorial-with-clay-orange",
    name: "Cream Editorial with Clay Orange",
    tags: ["light", "warm", "editorial", "vivid-accent"],
  },
  {
    folder: "Apple",
    slug: "calm-product-white-with-blue-pills",
    name: "Calm Product White with Blue Pills",
    tags: ["light", "minimal", "rounded", "product"],
  },
  {
    folder: "Bang Olufsen",
    slug: "airy-luxury-with-forest-green",
    name: "Airy Luxury with Forest Green",
    tags: ["light", "luxury", "minimal", "warm"],
  },
  {
    folder: "Clay",
    slug: "warm-paper-with-acid-lime",
    name: "Warm Paper with Acid Lime",
    tags: ["light", "warm", "editorial", "vivid-accent", "pastel"],
  },
  {
    folder: "Cohere",
    slug: "outlined-enterprise-with-pastel-tints",
    name: "Outlined Enterprise with Pastel Tints",
    tags: ["light", "pastel", "product", "technical"],
  },
  {
    folder: "Coinbase",
    slug: "crisp-fintech-electric-blue",
    name: "Crisp Fintech Electric Blue",
    tags: ["light", "high-contrast", "vivid-accent", "fintech"],
  },
  {
    folder: "Discord",
    slug: "deep-indigo-with-blurple-and-mint",
    name: "Deep Indigo with Blurple and Mint",
    tags: ["dark", "playful", "high-contrast", "vivid-accent", "rounded"],
  },
  {
    folder: "Duolingo",
    slug: "candy-bright-chunky-green",
    name: "Candy-Bright Chunky Green",
    tags: ["light", "playful", "rounded", "vivid-accent"],
  },
  {
    folder: "Framer",
    slug: "pure-black-geometric-display",
    name: "Pure Black Geometric Display",
    tags: ["dark", "geometric", "minimal", "product"],
  },
  {
    folder: "Glossier",
    slug: "clinical-white-editorial-beauty",
    name: "Clinical White Editorial Beauty",
    tags: ["light", "monochrome", "editorial", "minimal", "retail"],
  },
  {
    folder: "Gucci",
    slug: "ultra-thin-fashion-editorial",
    name: "Ultra-Thin Fashion Editorial",
    tags: ["light", "monochrome", "editorial", "luxury", "squared"],
  },
  {
    folder: "Headspace",
    slug: "sand-toned-calm-with-cobalt",
    name: "Sand-Toned Calm with Cobalt",
    tags: ["light", "warm", "rounded", "playful"],
  },
  {
    folder: "Igloo",
    slug: "grey-blue-terminal-monospace",
    name: "Grey-Blue Terminal Monospace",
    tags: ["light", "monospace", "monochrome", "technical", "developer"],
  },
  {
    folder: "Klarna",
    slug: "off-white-with-candy-pink",
    name: "Off-White with Candy Pink",
    tags: ["light", "warm", "playful", "vivid-accent", "fintech"],
  },
  {
    folder: "Leica",
    slug: "warm-black-geometric-restraint",
    name: "Warm Black Geometric Restraint",
    tags: ["light", "monochrome", "geometric", "minimal", "luxury"],
  },
  {
    folder: "Linear",
    slug: "electric-indigo-on-near-black",
    name: "Electric Indigo on Near-Black",
    tags: ["dark", "minimal", "product", "vivid-accent"],
  },
  {
    folder: "Lusion",
    slug: "gallery-white-with-ultramarine",
    name: "Gallery White with Ultramarine",
    tags: ["light", "minimal", "editorial", "vivid-accent"],
  },
  {
    folder: "Mailchimp",
    slug: "sandy-neutrals-with-cavendish-yellow",
    name: "Sandy Neutrals with Cavendish Yellow",
    tags: ["light", "warm", "playful", "vivid-accent", "product"],
  },
  {
    folder: "Mercedez-Benz",
    slug: "disciplined-monochrome-grey-ramp",
    name: "Disciplined Monochrome Grey Ramp",
    tags: ["light", "monochrome", "luxury", "minimal"],
  },
  {
    folder: "Monzo",
    slug: "rounded-white-with-hot-coral",
    name: "Rounded White with Hot Coral",
    tags: ["light", "rounded", "vivid-accent", "fintech"],
  },
  {
    folder: "Mux",
    slug: "paper-white-with-orange-amber",
    name: "Paper White with Orange-Amber",
    tags: ["light", "high-contrast", "playful", "vivid-accent", "developer"],
  },
  {
    folder: "Nike",
    slug: "militant-monochrome-black-pill",
    name: "Militant Monochrome Black Pill",
    tags: ["light", "monochrome", "high-contrast", "rounded", "retail"],
  },
  {
    folder: "Notion",
    slug: "oatmeal-workspace-with-blue",
    name: "Oatmeal Workspace with Blue",
    tags: ["light", "warm", "minimal", "product"],
  },
  {
    folder: "Off-White",
    slug: "industrial-monospace-cobalt",
    name: "Industrial Monospace Cobalt",
    tags: ["light", "monospace", "squared", "technical", "editorial"],
  },
  {
    folder: "On",
    slug: "swiss-monochrome-with-seafoam",
    name: "Swiss Monochrome with Seafoam",
    tags: ["light", "monochrome", "minimal", "retail"],
  },
  {
    folder: "Patagonia",
    slug: "airy-editorial-slate-and-earth",
    name: "Airy Editorial Slate and Earth",
    tags: ["light", "editorial", "rounded", "warm", "retail"],
  },
  {
    folder: "Pinterest",
    slug: "quiet-plum-with-saturated-red",
    name: "Quiet Plum with Saturated Red",
    tags: ["light", "rounded", "vivid-accent", "product"],
  },
  {
    folder: "Pitch",
    slug: "high-voltage-violet-on-white",
    name: "High-Voltage Violet on White",
    tags: ["light", "vivid-accent", "pastel", "playful", "product"],
  },
  {
    folder: "Polestar",
    slug: "scandinavian-square-monochrome",
    name: "Scandinavian Square Monochrome",
    tags: ["light", "monochrome", "squared", "minimal", "luxury"],
  },
  {
    folder: "Porsche",
    slug: "engineered-monochrome-scale",
    name: "Engineered Monochrome Scale",
    tags: ["light", "monochrome", "technical", "luxury", "minimal"],
  },
  {
    folder: "Raycast",
    slug: "keyboard-first-dark-with-coral",
    name: "Keyboard-First Dark with Coral",
    tags: ["dark", "product", "developer", "vivid-accent"],
  },
  {
    folder: "Ready Mag",
    slug: "image-forward-white-with-hot-orange",
    name: "Image-Forward White with Hot Orange",
    tags: ["light", "editorial", "rounded", "vivid-accent"],
  },
  {
    folder: "Revolut",
    slug: "two-mode-black-and-white-bands",
    name: "Two-Mode Black and White Bands",
    tags: ["light", "high-contrast", "monochrome", "rounded", "fintech"],
  },
  {
    folder: "Rivian",
    slug: "outdoor-tech-with-electric-yellow",
    name: "Outdoor Tech with Electric Yellow",
    tags: ["light", "minimal", "rounded", "vivid-accent"],
  },
  {
    folder: "Robinhood",
    slug: "acid-lime-on-warm-black",
    name: "Acid Lime on Warm Black",
    tags: ["dark", "warm", "vivid-accent", "fintech"],
  },
  {
    folder: "Spotify",
    slug: "dark-stage-with-electric-green",
    name: "Dark Stage with Electric Green",
    tags: ["dark", "geometric", "rounded", "vivid-accent", "product"],
  },
  {
    folder: "Stripe",
    slug: "airy-off-white-with-blurple-gradient",
    name: "Airy Off-White with Blurple Gradient",
    tags: ["light", "product", "vivid-accent", "developer"],
  },
  {
    folder: "Superlist",
    slug: "playful-spectrum-with-coral-gradient",
    name: "Playful Spectrum with Coral Gradient",
    tags: ["light", "playful", "vivid-accent", "product"],
  },
  {
    folder: "Tailwind",
    slug: "code-forward-dark-with-sky-cyan",
    name: "Code-Forward Dark with Sky Cyan",
    tags: ["dark", "developer", "vivid-accent", "technical"],
  },
  {
    folder: "Teenage Engineering",
    slug: "laboratory-white-with-signal-blue",
    name: "Laboratory White with Signal Blue",
    tags: ["light", "minimal", "technical", "squared"],
  },
  {
    folder: "Tesla",
    slug: "photography-first-white-grotesque",
    name: "Photography-First White Grotesque",
    tags: ["light", "monochrome", "minimal", "product"],
  },
  {
    folder: "Vercel",
    slug: "hairline-rings-on-near-black",
    name: "Hairline Rings on Near-Black",
    tags: ["dark", "monochrome", "minimal", "developer"],
  },
  {
    folder: "Webflow",
    slug: "dark-product-with-candy-accents",
    name: "Dark Product with Candy Accents",
    tags: ["dark", "playful", "vivid-accent", "product"],
  },
  {
    folder: "Wise",
    slug: "forest-green-with-bright-green",
    name: "Forest Green with Bright Green",
    tags: ["light", "rounded", "vivid-accent", "fintech"],
  },
  {
    folder: "figma",
    slug: "pure-white-with-electric-blue",
    name: "Pure White with Electric Blue",
    tags: ["light", "monochrome", "editorial", "vivid-accent"],
  },
];

/** How many systems the curated catalog covers. Pinned so a dropped entry fails loudly. */
export const DESIGN_SYSTEM_CATALOG_SIZE = 50;

/**
 * Look up the curated identity for a pack folder.
 *
 * Returns `undefined` for an unknown folder rather than inventing a name — the seed script
 * turns that into a hard error, which is what forces a new pack addition to be named
 * deliberately instead of shipping with a brand name showing.
 */
// [SCOPE 115 / T002] BEGIN — Curated 50-entry naming map (src/shared/designsystemcatalog…
export function catalogEntryForFolder(folder: string): DesignSystemCatalogEntry | undefined {
  return DESIGN_SYSTEM_CATALOG.find((entry) => entry.folder === folder);
}
// [SCOPE 115 / T002] END

/** Look up a curated identity by slug — the form every API route and URL uses. */
// [SCOPE 115 / T002] BEGIN — Curated 50-entry naming map (src/shared/designsystemcatalog…
export function catalogEntryForSlug(slug: string): DesignSystemCatalogEntry | undefined {
  return DESIGN_SYSTEM_CATALOG.find((entry) => entry.slug === slug);
}
// [SCOPE 115 / T002] END

/**
 * Report structural problems with the curated map: duplicate slugs, duplicate folders,
 * tags outside `CATALOG_TAGS`, a missing or non-leading mode tag, or a wrong entry count.
 *
 * Returns an empty array when the map is sound. Exists so the catalog test and the seed
 * script share one definition of "valid" rather than each asserting a subset.
 */
// [SCOPE 115 / T002] BEGIN — Curated 50-entry naming map (src/shared/designsystemcatalog…
export function validateCatalogMap(): string[] {
  const problems: string[] = [];
  if (DESIGN_SYSTEM_CATALOG.length !== DESIGN_SYSTEM_CATALOG_SIZE) {
    problems.push(
      `expected ${DESIGN_SYSTEM_CATALOG_SIZE} entries, found ${DESIGN_SYSTEM_CATALOG.length}`,
    );
  }
  const seenSlugs = new Set<string>();
  const seenFolders = new Set<string>();
  const allowed = new Set(CATALOG_TAGS);
  for (const entry of DESIGN_SYSTEM_CATALOG) {
    if (seenSlugs.has(entry.slug)) problems.push(`duplicate slug: ${entry.slug}`);
    seenSlugs.add(entry.slug);
    if (seenFolders.has(entry.folder)) problems.push(`duplicate folder: ${entry.folder}`);
    seenFolders.add(entry.folder);
    if (!/^[a-z0-9-]+$/.test(entry.slug)) problems.push(`slug not url-safe: ${entry.slug}`);
    const mode = entry.tags[0];
    if (mode !== "light" && mode !== "dark") {
      problems.push(`${entry.slug}: first tag must be the mode, found ${String(mode)}`);
    }
    for (const tag of entry.tags) {
      if (!allowed.has(tag)) problems.push(`${entry.slug}: tag outside vocabulary: ${tag}`);
    }
  }
  return problems;
}
// [SCOPE 115 / T002] END
