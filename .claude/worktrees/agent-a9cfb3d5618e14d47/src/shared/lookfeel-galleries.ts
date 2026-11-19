// [SCOPE 047 / 055] Curated look-and-feel inspiration galleries.
//
// FR-004 — the look-and-feel reference list lives in ONE maintainable place.
// A non-designer picks a direction by pointing at one of these galleries (and/or
// citing a specific app/page), from which design tokens are derived. Shared by
// the wxKanban web new-project stack walkthrough; the VS Code `/buildstack`
// command embeds an equivalent list (consumers can't import this module).
//
// Update this list to change the galleries offered everywhere in the web app.

export interface LookFeelGallery {
  /** Stable key used to record the chosen gallery in stack.md. */
  key: string;
  /** Display name. */
  name: string;
  /** Canonical URL the user browses. */
  url: string;
  /** One-line description of what the gallery is good for. */
  description: string;
  /** Surfaces this gallery is most useful for. */
  bestFor: Array<"web" | "mobile" | "desktop">;
}

export const LOOKFEEL_GALLERIES: readonly LookFeelGallery[] = [
  {
    key: "mobbin",
    name: "Mobbin",
    url: "https://mobbin.com",
    description: "Real iOS / Android / web app screens and end-to-end user flows.",
    bestFor: ["mobile", "web"],
  },
  {
    key: "land-book",
    name: "Land-book",
    url: "https://land-book.com",
    description: "Curated landing-page and marketing-site aesthetics.",
    bestFor: ["web"],
  },
  {
    key: "dribbble",
    name: "Dribbble",
    url: "https://dribbble.com",
    description: "Broad gallery of UI design shots across every surface.",
    bestFor: ["web", "mobile", "desktop"],
  },
  {
    key: "awwwards",
    name: "Awwwards",
    url: "https://www.awwwards.com",
    description: "High-end, modern, award-winning web design.",
    bestFor: ["web"],
  },
] as const;

export type LookFeelGalleryKey = (typeof LOOKFEEL_GALLERIES)[number]["key"];

/** Galleries relevant to a given application type (FR-004 presents these). */
export function galleriesForAppType(
  appType: "web" | "mobile" | "desktop",
): readonly LookFeelGallery[] {
  return LOOKFEEL_GALLERIES.filter((g) => g.bestFor.includes(appType));
}
