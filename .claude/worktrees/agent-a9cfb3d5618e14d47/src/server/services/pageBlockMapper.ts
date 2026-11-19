// SCOPE-108 / T012 — deterministic DOM-outline → BlockNode[] mapper (Website Page Source).
// Pure and self-contained (type-only import of BlockNode, inline id generation) so it maps
// a captured page outline into real, on-brand composer blocks with zero runtime deps and is
// trivially unit-testable. An optional LLM refinement runs on top of this (see the rebuild
// route); this deterministic mapping is the guaranteed base that always yields valid nodes.

import type { BlockNode, BlockNodeType, PropValue } from "../../shared/block-model.js";

export interface OutlineImage {
  src: string;
  alt: string;
}
export interface OutlineLink {
  text: string;
  href: string;
}
export interface OutlineCard {
  heading: string | null;
  text: string | null;
  image: OutlineImage | null;
  link: OutlineLink | null;
}
export interface OutlineSection {
  kind: "hero" | "header" | "nav" | "section" | "footer";
  heading: string | null;
  subheading: string | null;
  paragraphs: string[];
  images: OutlineImage[];
  links: OutlineLink[];
  /** A repeated card/feature grid detected inside the section (≥2 items). */
  cards?: OutlineCard[];
}
export interface PageOutline {
  url: string;
  title: string | null;
  sections: OutlineSection[];
}

// [SCOPE 108 / T012] BEGIN — outline → BlockNode tree (deterministic)
let idCounter = 0;
function nid(): string {
  const c = globalThis.crypto;
  return c?.randomUUID ? c.randomUUID() : `n-${Date.now().toString(36)}-${(idCounter++).toString(36)}`;
}
function node(type: BlockNodeType, props: Record<string, PropValue>, children?: BlockNode[]): BlockNode {
  const n: BlockNode = { id: nid(), type, props };
  if (children) n.children = children;
  return n;
}

function cardToPanel(card: OutlineCard): BlockNode {
  const kids: BlockNode[] = [];
  if (card.image) kids.push(node("image", { src: card.image.src, alt: card.image.alt, width: 0 }));
  if (card.heading) kids.push(node("subheading", { text: card.heading })); // card title
  if (card.text) kids.push(node("paragraph", { text: card.text }));
  if (card.link) kids.push(node("button", { label: card.link.text, href: card.link.href }));
  return node("panel", { padded: true }, kids);
}

function sectionToPanel(s: OutlineSection): BlockNode {
  const kids: BlockNode[] = [];
  if (s.heading) kids.push(node("heading", { text: s.heading }));
  if (s.subheading) kids.push(node("subheading", { text: s.subheading }));
  for (const p of s.paragraphs) kids.push(node("paragraph", { text: p }));
  for (const img of s.images) kids.push(node("image", { src: img.src, alt: img.alt, width: 0 }));
  for (const link of s.links) kids.push(node("button", { label: link.text, href: link.href }));
  // A detected card/feature grid → a real cardgrid (3+) or a side-by-side row (2).
  if (s.cards && s.cards.length >= 2) {
    const cardNodes = s.cards.map(cardToPanel);
    if (s.cards.length === 2) {
      kids.push(node("row", { align: "center", valign: "top" }, cardNodes));
    } else {
      kids.push(node("cardgrid", { columns: Math.min(s.cards.length, 3) }, cardNodes));
    }
  }
  const props: Record<string, PropValue> = { padded: true };
  if (s.kind === "hero") props.align = "center"; // heroes center their content
  return node("panel", props, kids);
}

/** Map a captured page outline to a tree of composer blocks (one panel per section). */
export function outlineToBlocks(outline: PageOutline): BlockNode[] {
  return outline.sections.map(sectionToPanel);
}

/** True when an outline has at least one section carrying real content. */
export function outlineHasStructure(outline: PageOutline): boolean {
  return outline.sections.some(
    (s) => s.heading || s.paragraphs.length > 0 || s.images.length > 0 || s.links.length > 0,
  );
}
// [SCOPE 108 / T012] END
