// SCOPE-108 / T011 — Website Page Source capture: fetch a public URL and statically parse
// its HTML (cheerio, NO headless Chromium) into a structural outline that the DOM→BlockNode
// mapper turns into editable, on-brand composer blocks.
//
// SECURITY: fetches a user-supplied URL from the server → an SSRF sink. Reuses the SCOPE-106
// `assertPublicHttpUrl` guard (resolves the host; refuses localhost/private/link-local incl.
// the cloud metadata IP) before any fetch. Bounded timeout + response-size cap.
//
// Static parse only — a purely client-rendered SPA yields little/no structure; the caller
// (rebuild route) then fails open, leaving the user's canvas untouched (FR-009).

import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import { assertPublicHttpUrl } from "../lib/url-guard.js";
import type {
  PageOutline,
  OutlineSection,
  OutlineImage,
  OutlineLink,
} from "./pageBlockMapper.js";
import { createLogger } from "../lib/logger.js";

const logger = createLogger("site-page-capture");

const FETCH_TIMEOUT_MS = 10000;
const MAX_HTML_BYTES = 2_000_000; // 2 MB of HTML is plenty for a marketing page
const MAX_SECTIONS = 12;
const MAX_PARAGRAPHS = 5;
const MAX_IMAGES = 5;
const MAX_LINKS = 4;

// [SCOPE 108 / T011] BEGIN — url/text helpers + static HTML → structural outline (cheerio)
function norm(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}
function absUrl(src: string, base: string): string | null {
  try {
    const u = new URL(src, base);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function parseHtmlToOutline(html: string, baseUrl: string): PageOutline {
  const $ = cheerio.load(html);
  const title = norm($("title").first().text()) || null; // read before stripping <head>
  $("script, style, noscript, template, svg, head").remove();

  const sectionOf = (el: Element, kind: OutlineSection["kind"]): OutlineSection | null => {
    const $el = $(el);
    const heading = norm($el.find("h1, h2").first().text()).slice(0, 140) || null;
    const subheading = norm($el.find("h3, h4").first().text()).slice(0, 160) || null;

    const paragraphs: string[] = [];
    $el.find("p").each((_i, p) => {
      if (paragraphs.length >= MAX_PARAGRAPHS) return;
      const t = norm($(p).text()).slice(0, 600);
      if (t.length > 1 && !paragraphs.includes(t)) paragraphs.push(t);
    });

    const images: OutlineImage[] = [];
    $el.find("img").each((_i, img) => {
      if (images.length >= MAX_IMAGES) return;
      const rawSrc = $(img).attr("src") ?? "";
      if (!rawSrc || rawSrc.startsWith("data:")) return;
      const src = absUrl(rawSrc, baseUrl);
      if (!src) return;
      images.push({ src, alt: norm($(img).attr("alt") ?? "").slice(0, 140) });
    });

    const links: OutlineLink[] = [];
    $el.find("a, button").each((_i, a) => {
      if (links.length >= MAX_LINKS) return;
      const cls = String($(a).attr("class") ?? "");
      const isButtonish = a.tagName === "button" || /\b(btn|button|cta)\b/i.test(cls);
      if (!isButtonish) return;
      const text = norm($(a).text()).slice(0, 60);
      if (!text) return;
      const href = a.tagName === "a" ? absUrl($(a).attr("href") ?? "#", baseUrl) ?? "#" : "#";
      links.push({ text, href });
    });

    if (!heading && paragraphs.length === 0 && images.length === 0 && links.length === 0) return null;
    return { kind, heading, subheading, paragraphs, images, links };
  };

  const sections: OutlineSection[] = [];

  const kindForTag = (tag: string): OutlineSection["kind"] =>
    tag === "header" ? "header" : tag === "nav" ? "nav" : tag === "footer" ? "footer" : "section";

  // Primary: semantic sections that don't themselves contain another semantic section (leaves).
  const semantic = $("header, nav, section, article, footer")
    .toArray()
    .filter((el) => $(el).find("header, nav, section, article, footer").length === 0);

  for (const el of semantic) {
    if (sections.length >= MAX_SECTIONS) break;
    const sec = sectionOf(el, kindForTag(el.tagName));
    if (sec) sections.push(sec);
  }

  // Fallback: no usable semantic sections → anchor sections on top-level headings.
  if (sections.length === 0) {
    const scope = $("main").first().length ? $("main").first() : $("body").first();
    scope.find("h1, h2").each((_i, h) => {
      if (sections.length >= MAX_SECTIONS) return;
      const $h = $(h);
      const between = $h.nextUntil("h1, h2");
      const paragraphs: string[] = [];
      between.find("p").addBack("p").each((_j, p) => {
        if (paragraphs.length >= MAX_PARAGRAPHS) return;
        const t = norm($(p).text()).slice(0, 600);
        if (t.length > 1 && !paragraphs.includes(t)) paragraphs.push(t);
      });
      const images: OutlineImage[] = [];
      between.find("img").each((_j, img) => {
        if (images.length >= MAX_IMAGES) return;
        const rawSrc = $(img).attr("src") ?? "";
        if (!rawSrc || rawSrc.startsWith("data:")) return;
        const src = absUrl(rawSrc, baseUrl);
        if (src) images.push({ src, alt: norm($(img).attr("alt") ?? "") });
      });
      const heading = norm($h.text()).slice(0, 140) || null;
      if (heading || paragraphs.length || images.length) {
        sections.push({ kind: "section", heading, subheading: null, paragraphs, images, links: [] });
      }
    });
  }

  // Mark the first content section as a hero (centered) for a stronger reconstruction.
  const heroIdx = sections.findIndex((s) => s.kind === "section" && !!s.heading);
  if (heroIdx !== -1) sections[heroIdx].kind = "hero";

  return { url: baseUrl, title, sections };
}
// [SCOPE 108 / T011] END

// [SCOPE 108 / T011] BEGIN — fetch a public URL (SSRF-guarded, capped) → outline
export async function capturePageOutline(rawUrl: string): Promise<PageOutline> {
  const u = await assertPublicHttpUrl(rawUrl); // SSRF guard + bare-domain https prefix
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(u.toString(), {
      signal: controller.signal,
      redirect: "follow",
      headers: { "user-agent": "wxKanban-PageRebuild/1.0", accept: "text/html,application/xhtml+xml" },
    });
    if (!res.ok) throw new Error(`fetch failed: HTTP ${res.status}`);
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType && !contentType.includes("html")) throw new Error(`not an HTML page (${contentType})`);
    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared && declared > MAX_HTML_BYTES) throw new Error("page too large");
    const html = (await res.text()).slice(0, MAX_HTML_BYTES);
    return parseHtmlToOutline(html, u.toString());
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw new Error("page fetch timed out");
    logger.warn({ err, url: u.toString() }, "page capture failed");
    throw err instanceof Error ? err : new Error("page capture failed");
  } finally {
    clearTimeout(timer);
  }
}
// [SCOPE 108 / T011] END
