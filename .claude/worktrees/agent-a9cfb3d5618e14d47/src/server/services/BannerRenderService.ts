import { createLogger } from "~/server/lib/logger.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import {
  BANNER_BRAND,
  type BannerBrandTokens,
  type BannerLayout,
} from "~/server/lib/banner-brand.js";

const logger = createLogger("banner-render-service");

// ── Fonts ────────────────────────────────────────────────────────────────────
// resvg has no browser and no system fonts to fall back on, so we SHIP the brand
// font (Inter Regular + ExtraBold) in the repo and hand resvg the raw buffers.
// This is precisely why the SVG path fixes the prod "text not showing up" bug:
// the previous @sparticuz/chromium render produced blank glyphs because the
// serverless Chromium container has no fonts; here the glyphs travel with the app.
let FONT_CACHE: Buffer[] | null = null;
function loadFontBuffers(): Buffer[] {
  if (FONT_CACHE) return FONT_CACHE;
  const dir = join(process.cwd(), "src", "server", "assets", "fonts");
  const bufs: Buffer[] = [];
  for (const name of ["Inter-Regular.ttf", "Inter-ExtraBold.ttf"]) {
    try {
      bufs.push(readFileSync(join(dir, name)));
    } catch (err) {
      logger.error({ err, font: name }, "Banner font missing — text may not render");
    }
  }
  FONT_CACHE = bufs;
  return bufs;
}

export interface HeadlineSegment {
  text: string;
  accent?: boolean;
}

export interface BannerRenderInput {
  sizepreset: string;
  width: number;
  height: number;
  layout: BannerLayout;
  backgroundUrl: string | null;
  headline?: string | null;
  subhead?: string | null;
  ctatext?: string | null;
  // [SCOPE 070 / Amendment-B] v2 rich-overlay fields
  eyebrow?: string | null;
  headlinesegments?: HeadlineSegment[] | null;
  badge?: string | null;
  bulletslabel?: string | null;
  bullets?: string[] | null;
  ctaurl?: string | null;
  overlayanchor?: string | null;
  brandtokens?: Partial<BannerBrandTokens> | null;
  // [SCOPE 070 / Amendment-D] per-element absolute overrides from the drag/resize
  // editor. Keys: logo, eyebrow, headline, subhead, bullets, cta, badge. x,y are
  // 0..1 fractions of (width,height) for the element top-left; scale multiplies its
  // auto font size (logo height for the logo). When present → absolute layout.
  overlaylayout?: Record<string, OverlayPlacement> | null;
}

export interface OverlayPlacement {
  x: number;
  y: number;
  scale: number;
  // [SCOPE 070 / Amendment-F] true → the element is deleted/hidden in the layout
  // editor and the renderer skips it (e.g. removing a logo that's already baked
  // into an uploaded background). Absent/false = shown.
  hidden?: boolean;
}

// ── Small helpers ─────────────────────────────────────────────────────────────
function clampPx(min: number, preferred: number, max: number): number {
  return Math.max(min, Math.min(preferred, max));
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Rough text width estimate (resvg gives no measurement API pre-render). Inter
// advances ~0.52em regular / ~0.60em extrabold; good enough for pill padding and
// anchored grouping.
function estTextWidth(text: string, size: number, bold: boolean): number {
  return text.length * size * (bold ? 0.6 : 0.52);
}

// Greedy word-wrap to a pixel width. SVG <text> does not auto-wrap the way the
// old flexbox overlay did, so long subheads would run off a narrow banner; this
// breaks them into lines that fit the content column.
function wrapText(
  text: string,
  maxWidth: number,
  size: number,
  bold: boolean,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const word of words) {
    const trial = cur ? `${cur} ${word}` : word;
    if (!cur || estTextWidth(trial, size, bold) <= maxWidth) {
      cur = trial;
    } else {
      lines.push(cur);
      cur = word;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [text];
}

// PNG intrinsic size from the IHDR chunk, so a logo keeps its aspect ratio
// (SVG <image> has no "auto" width). Falls back to a 4:1 wordmark guess.
function pngSize(buf: Buffer): { w: number; h: number } | null {
  if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50) {
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }
  return null;
}

interface FetchedImage {
  dataUri: string;
  w: number;
  h: number;
}

async function fetchImage(url: string): Promise<FetchedImage | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      logger.warn({ url, status: res.status }, "Banner image fetch failed");
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    const mime =
      ct.includes("jpeg") || ct.includes("jpg")
        ? "image/jpeg"
        : ct.includes("webp")
          ? "image/webp"
          : ct.includes("gif")
            ? "image/gif"
            : "image/png";
    const dims = pngSize(buf);
    return {
      dataUri: `data:${mime};base64,${buf.toString("base64")}`,
      w: dims?.w ?? 0,
      h: dims?.h ?? 0,
    };
  } catch (err) {
    logger.warn({ err, url }, "Banner image fetch threw");
    return null;
  }
}

function anchorAlign(
  anchor: string | null | undefined,
  layout: BannerLayout,
): { align: "left" | "center" | "right"; justify: "top" | "center" | "bottom" } {
  if (!anchor) {
    return layout === "vertical"
      ? { align: "left", justify: "bottom" }
      : { align: "left", justify: "center" };
  }
  const a = anchor.toLowerCase();
  let align: "left" | "center" | "right" = "left";
  let justify: "top" | "center" | "bottom" = "center";
  if (a.includes("right")) align = "right";
  else if (a.includes("center")) align = "center";
  if (a.includes("top")) justify = "top";
  else if (a.includes("bottom")) justify = "bottom";
  return { align, justify };
}

interface TypeScale {
  headline: number;
  eyebrow: number;
  body: number;
  cta: number;
  ctaUrl: number;
  badge: number;
  logoH: number;
}

function typeScale(layout: BannerLayout, w: number, h: number): TypeScale {
  if (layout === "horizontal") {
    return {
      headline: clampPx(11, 0.34 * h, 28),
      eyebrow: clampPx(8, 0.16 * h, 13),
      body: clampPx(8, 0.16 * h, 13),
      cta: clampPx(9, 0.26 * h, 17),
      ctaUrl: clampPx(8, 0.18 * h, 14),
      badge: clampPx(8, 0.18 * h, 13),
      logoH: clampPx(14, 0.4 * h, 30),
    };
  }
  if (layout === "vertical") {
    return {
      headline: clampPx(14, Math.min(0.052 * h, 0.12 * w), 32),
      eyebrow: clampPx(8, Math.min(0.019 * h, 0.05 * w), 14),
      body: clampPx(9, Math.min(0.022 * h, 0.06 * w), 16),
      cta: clampPx(10, Math.min(0.024 * h, 0.065 * w), 16),
      ctaUrl: clampPx(8, Math.min(0.019 * h, 0.05 * w), 14),
      badge: clampPx(8, Math.min(0.019 * h, 0.05 * w), 13),
      logoH: clampPx(16, 0.045 * h, 34),
    };
  }
  // hero (og, mrec)
  return {
    headline: clampPx(16, 0.085 * h, 56),
    eyebrow: clampPx(9, 0.026 * h, 20),
    body: clampPx(10, 0.03 * h, 22),
    cta: clampPx(10, 0.032 * h, 22),
    ctaUrl: clampPx(9, 0.024 * h, 18),
    badge: clampPx(9, 0.024 * h, 17),
    logoH: clampPx(18, 0.06 * h, 44),
  };
}

// [SCOPE 070 / T003] BEGIN — BannerRenderService (SVG overlay → PNG via resvg-js)
// Composites the brand overlay (eyebrow / multi-line accent headline / badge /
// bullets / CTA+URL / logo) over the AI background and rasterizes to PNG with
// resvg-js. Replaces the Amendment-B Puppeteer/HTML screenshot, which rendered
// blank text in the App Runner container (no Chrome fonts). The AI background is
// untouched — it is fetched and embedded as the base <image>; only the text
// overlay compositing changed. Output is 2× the preset size for crisp text.
export class BannerRenderService {
  static async render(input: BannerRenderInput): Promise<Buffer> {
    const brand: BannerBrandTokens = {
      ...BANNER_BRAND,
      ...(input.brandtokens ?? {}),
    };

    const [bg, logo] = await Promise.all([
      input.backgroundUrl ? fetchImage(input.backgroundUrl) : Promise.resolve(null),
      brand.logoUrl ? fetchImage(brand.logoUrl) : Promise.resolve(null),
    ]);

    const svg = buildBannerSvg(input, brand, bg, logo);

    const resvg = new Resvg(svg, {
      fitTo: { mode: "width", value: Math.max(1, Math.round(input.width * 2)) },
      font: {
        fontBuffers: loadFontBuffers(),
        defaultFontFamily: "Inter",
        loadSystemFonts: false,
      },
      background: "rgba(0,0,0,0)",
    });
    const png = resvg.render().asPng();
    logger.info(
      { bytes: png.length, preset: input.sizepreset },
      "Banner rendered to PNG (svg/resvg)",
    );
    return Buffer.from(png);
  }
}

function buildBannerSvg(
  input: BannerRenderInput,
  brand: BannerBrandTokens,
  bg: FetchedImage | null,
  logo: FetchedImage | null,
): string {
  const w = input.width;
  const h = input.height;
  const padX = input.layout === "horizontal" ? 0.035 * w : 0.07 * w;

  // Background layer: AI image (cover) or a navy radial fallback. A left→right
  // dark scrim guarantees text contrast regardless of the generated background.
  const bgLayer = bg
    ? `<image x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice" href="${bg.dataUri}"/>`
    : `<rect x="0" y="0" width="${w}" height="${h}" fill="url(#navy)"/>`;

  const hasLayout =
    input.overlaylayout && Object.keys(input.overlaylayout).length > 0;
  const overlay = hasLayout
    ? buildAbsoluteOverlay(input, brand, logo)
    : input.layout === "horizontal"
      ? buildRowOverlay(input, brand, logo, padX)
      : buildColumnOverlay(input, brand, logo, padX);

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
    `<defs>`,
    `<radialGradient id="navy" cx="0.5" cy="-0.2" r="1.25"><stop offset="0" stop-color="#1b2840"/><stop offset="0.6" stop-color="#0f1722"/></radialGradient>`,
    `<linearGradient id="scrim" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${w}" y2="0"><stop offset="0" stop-color="#0f1722" stop-opacity="0.82"/><stop offset="0.45" stop-color="#0f1722" stop-opacity="0.45"/><stop offset="1" stop-color="#0f1722" stop-opacity="0.12"/></linearGradient>`,
    `<linearGradient id="accent" gradientUnits="userSpaceOnUse" x1="${padX}" y1="0" x2="${w - padX}" y2="0"><stop offset="0" stop-color="#28e0b0"/><stop offset="1" stop-color="#19b8e6"/></linearGradient>`,
    `</defs>`,
    bgLayer,
    `<rect x="0" y="0" width="${w}" height="${h}" fill="url(#scrim)"/>`,
    overlay,
    `</svg>`,
  ].join("");
}

function logoRenderWidth(logo: FetchedImage | null, logoH: number): number {
  if (!logo) return 0;
  const aspect = logo.w && logo.h ? logo.w / logo.h : 4;
  return logoH * aspect;
}

function textEl(
  s: string,
  x: number,
  baselineY: number,
  size: number,
  weight: number,
  fill: string,
  anchor: "start" | "middle" | "end",
  extra = "",
): string {
  return `<text x="${x.toFixed(1)}" y="${baselineY.toFixed(1)}" font-family="Inter" font-size="${size.toFixed(1)}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}"${extra}>${escapeXml(s)}</text>`;
}

function anchorX(
  align: "left" | "center" | "right",
  padX: number,
  w: number,
): { x: number; anchor: "start" | "middle" | "end" } {
  if (align === "center") return { x: w / 2, anchor: "middle" };
  if (align === "right") return { x: w - padX, anchor: "end" };
  return { x: padX, anchor: "start" };
}

function groupLeft(
  align: "left" | "center" | "right",
  padX: number,
  w: number,
  groupW: number,
): number {
  if (align === "center") return (w - groupW) / 2;
  if (align === "right") return w - padX - groupW;
  return padX;
}

// hero + vertical: a stacked, anchored column of overlay blocks.
function buildColumnOverlay(
  input: BannerRenderInput,
  brand: BannerBrandTokens,
  logo: FetchedImage | null,
  padX: number,
): string {
  const w = input.width;
  const h = input.height;
  const padY = 0.06 * h;
  const ts = typeScale(input.layout, w, h);
  const showRich = h >= 120;
  const { align, justify } = anchorAlign(input.overlayanchor, input.layout);
  const ax = anchorX(align, padX, w);
  const gap = clampPx(6, 0.022 * h, 26);

  const segs: HeadlineSegment[] =
    input.headlinesegments && input.headlinesegments.length
      ? input.headlinesegments
      : input.headline
        ? [{ text: input.headline, accent: false }]
        : [];

  interface Block {
    h: number;
    render: (top: number) => string;
  }
  const blocks: Block[] = [];

  // Header row: logo + eyebrow (grouped, anchored).
  const eyebrowText = showRich && input.eyebrow ? input.eyebrow.toUpperCase() : "";
  const logoW = logoRenderWidth(logo, ts.logoH);
  if (logo || eyebrowText) {
    const inlineGap = ts.logoH * 0.4;
    const ls = ts.eyebrow * 0.16;
    const eyebrowW = eyebrowText
      ? estTextWidth(eyebrowText, ts.eyebrow, true) + ls * Math.max(0, eyebrowText.length - 1)
      : 0;
    const groupW =
      (logo ? logoW : 0) + (logo && eyebrowText ? inlineGap : 0) + eyebrowW;
    const headerH = Math.max(logo ? ts.logoH : 0, eyebrowText ? ts.eyebrow : 0);
    blocks.push({
      h: headerH,
      render: (top) => {
        const left = groupLeft(align, padX, w, groupW);
        let out = "";
        if (logo) {
          out += `<image x="${left.toFixed(1)}" y="${(top + (headerH - ts.logoH) / 2).toFixed(1)}" width="${logoW.toFixed(1)}" height="${ts.logoH.toFixed(1)}" preserveAspectRatio="xMidYMid meet" href="${logo.dataUri}"/>`;
        }
        if (eyebrowText) {
          const ex = left + (logo ? logoW + inlineGap : 0);
          out += textEl(
            eyebrowText,
            ex,
            top + headerH / 2 + ts.eyebrow * 0.34,
            ts.eyebrow,
            800,
            brand.eyebrowColor,
            "start",
            ` letter-spacing="${ls.toFixed(2)}"`,
          );
        }
        return out;
      },
    });
  }

  // Headline (multi-line, per-line accent).
  if (segs.length) {
    const lineAdv = ts.headline * 1.14;
    blocks.push({
      h: segs.length * lineAdv,
      render: (top) =>
        segs
          .map((s, i) =>
            textEl(
              s.text,
              ax.x,
              top + i * lineAdv + ts.headline * 0.82,
              ts.headline,
              800,
              s.accent ? "url(#accent)" : "#ffffff",
              ax.anchor,
            ),
          )
          .join(""),
    });
  }

  // Subhead (wrapped to the content column).
  if (input.subhead && h >= 80) {
    const lineAdv = ts.body * 1.3;
    const lines = wrapText(input.subhead, w - 2 * padX, ts.body, false);
    blocks.push({
      h: lines.length * lineAdv,
      render: (top) =>
        lines
          .map((ln, i) =>
            textEl(
              ln,
              ax.x,
              top + i * lineAdv + ts.body * 0.82,
              ts.body,
              400,
              brand.onDark,
              ax.anchor,
              ` fill-opacity="0.92"`,
            ),
          )
          .join(""),
    });
  }

  // Bullets (optional label + items).
  if (showRich && input.bullets && input.bullets.length) {
    const lineAdv = ts.body * 1.32;
    const lines: Array<{ text: string; label: boolean }> = [];
    if (input.bulletslabel) lines.push({ text: input.bulletslabel, label: true });
    for (const b of input.bullets) lines.push({ text: `•  ${b}`, label: false });
    blocks.push({
      h: lines.length * lineAdv,
      render: (top) =>
        lines
          .map((l, i) =>
            textEl(
              l.text,
              ax.x,
              top + i * lineAdv + ts.body * 0.82,
              ts.body,
              l.label ? 800 : 400,
              brand.onDark,
              ax.anchor,
              l.label ? "" : ` fill-opacity="0.82"`,
            ),
          )
          .join(""),
    });
  }

  // CTA pill + URL (grouped, anchored).
  const ctaText = input.ctatext || "";
  if (ctaText || input.ctaurl) {
    const pillH = ts.cta * 2.0;
    const pillPadX = ts.cta * 0.9;
    const pillW = ctaText ? estTextWidth(ctaText, ts.cta, true) + 2 * pillPadX : 0;
    const inlineGap = ts.cta * 0.8;
    const urlW = input.ctaurl ? estTextWidth(input.ctaurl, ts.ctaUrl, true) : 0;
    const groupW =
      (ctaText ? pillW : 0) +
      (ctaText && input.ctaurl ? inlineGap : 0) +
      (input.ctaurl ? urlW : 0);
    blocks.push({
      h: pillH,
      render: (top) => {
        const left = groupLeft(align, padX, w, groupW);
        let out = "";
        if (ctaText) {
          out += `<rect x="${left.toFixed(1)}" y="${top.toFixed(1)}" width="${pillW.toFixed(1)}" height="${pillH.toFixed(1)}" rx="${(ts.cta * 0.5).toFixed(1)}" fill="url(#accent)"/>`;
          out += textEl(
            ctaText,
            left + pillW / 2,
            top + pillH / 2 + ts.cta * 0.34,
            ts.cta,
            800,
            brand.onAccent,
            "middle",
          );
        }
        if (input.ctaurl) {
          const ux = left + (ctaText ? pillW + inlineGap : 0);
          out += textEl(
            input.ctaurl,
            ux,
            top + pillH / 2 + ts.ctaUrl * 0.34,
            ts.ctaUrl,
            800,
            brand.eyebrowColor,
            "start",
          );
        }
        return out;
      },
    });
  }

  // Vertically place the stack per the justify anchor.
  const totalH =
    blocks.reduce((sum, b) => sum + b.h, 0) + gap * Math.max(0, blocks.length - 1);
  let startY: number;
  if (justify === "top") startY = padY;
  else if (justify === "bottom") startY = Math.max(padY, h - padY - totalH);
  else startY = Math.max(padY, (h - totalH) / 2);

  let cursor = startY;
  let out = "";
  for (const b of blocks) {
    out += b.render(cursor);
    cursor += b.h + gap;
  }

  // Badge (absolute, top-right).
  if (showRich && input.badge) {
    const bs = ts.badge;
    const pillH = bs * 1.9;
    const pillW = estTextWidth(input.badge, bs, true) + 2 * (bs * 0.8);
    const bx = w - 0.06 * w - pillW;
    const by = 0.07 * h;
    out += `<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${pillW.toFixed(1)}" height="${pillH.toFixed(1)}" rx="${(pillH / 2).toFixed(1)}" fill="${brand.accent}"/>`;
    out += textEl(
      input.badge,
      bx + pillW / 2,
      by + pillH / 2 + bs * 0.34,
      bs,
      800,
      brand.onAccent,
      "middle",
    );
  }

  return out;
}

// [SCOPE 070 / Amendment-D] Absolute per-element layout from the drag/resize
// editor. Each element is placed at its override top-left (x,y as fractions of
// w,h) and sized by its scale × the auto type scale. The client seeds the same
// defaults below so the editor preview and this render stay WYSIWYG-consistent.
function buildAbsoluteOverlay(
  input: BannerRenderInput,
  brand: BannerBrandTokens,
  logo: FetchedImage | null,
): string {
  const w = input.width;
  const h = input.height;
  const ts = typeScale(input.layout, w, h);
  const padX = 0.04 * w;
  const map = input.overlaylayout || {};
  const get = (key: string, dx: number, dy: number): OverlayPlacement =>
    map[key] ?? { x: dx, y: dy, scale: 1 };
  // [SCOPE 070 / Amendment-F] an element deleted in the Layout editor is skipped.
  const isHidden = (key: string): boolean => map[key]?.hidden === true;

  const segs: HeadlineSegment[] =
    input.headlinesegments && input.headlinesegments.length
      ? input.headlinesegments
      : input.headline
        ? [{ text: input.headline, accent: false }]
        : [];
  const eyebrowText = input.eyebrow ? input.eyebrow.toUpperCase() : "";

  let out = "";

  if (logo && !isHidden("logo")) {
    const L = get("logo", 0.06, 0.08);
    const hh = ts.logoH * L.scale;
    const ww = logoRenderWidth(logo, hh);
    out += `<image x="${(L.x * w).toFixed(1)}" y="${(L.y * h).toFixed(1)}" width="${ww.toFixed(1)}" height="${hh.toFixed(1)}" preserveAspectRatio="xMidYMid meet" href="${logo.dataUri}"/>`;
  }

  if (eyebrowText && !isHidden("eyebrow")) {
    const E = get("eyebrow", 0.06, 0.2);
    const sz = ts.eyebrow * E.scale;
    out += textEl(
      eyebrowText,
      E.x * w,
      E.y * h + sz * 0.82,
      sz,
      800,
      brand.eyebrowColor,
      "start",
      ` letter-spacing="${(sz * 0.16).toFixed(2)}"`,
    );
  }

  if (segs.length && !isHidden("headline")) {
    const H = get("headline", 0.06, 0.3);
    const sz = ts.headline * H.scale;
    const adv = sz * 1.14;
    segs.forEach((s, i) => {
      out += textEl(
        s.text,
        H.x * w,
        H.y * h + i * adv + sz * 0.82,
        sz,
        800,
        s.accent ? "url(#accent)" : "#ffffff",
        "start",
      );
    });
  }

  if (input.subhead && !isHidden("subhead")) {
    const S = get("subhead", 0.06, 0.56);
    const sz = ts.body * S.scale;
    const lines = wrapText(input.subhead, w - S.x * w - padX, sz, false);
    lines.forEach((ln, i) => {
      out += textEl(
        ln,
        S.x * w,
        S.y * h + i * sz * 1.3 + sz * 0.82,
        sz,
        400,
        brand.onDark,
        "start",
        ` fill-opacity="0.92"`,
      );
    });
  }

  if (input.bullets && input.bullets.length && !isHidden("bullets")) {
    const B = get("bullets", 0.06, 0.66);
    const sz = ts.body * B.scale;
    const adv = sz * 1.32;
    const lines: Array<{ text: string; label: boolean }> = [];
    if (input.bulletslabel) lines.push({ text: input.bulletslabel, label: true });
    for (const b of input.bullets) lines.push({ text: `•  ${b}`, label: false });
    lines.forEach((l, i) => {
      out += textEl(
        l.text,
        B.x * w,
        B.y * h + i * adv + sz * 0.82,
        sz,
        l.label ? 800 : 400,
        brand.onDark,
        "start",
        l.label ? "" : ` fill-opacity="0.82"`,
      );
    });
  }

  const ctaText = input.ctatext || "";
  if ((ctaText || input.ctaurl) && !isHidden("cta")) {
    const C = get("cta", 0.06, 0.84);
    const sz = ts.cta * C.scale;
    const pillH = sz * 2.0;
    const pillW = ctaText ? estTextWidth(ctaText, sz, true) + 2 * (sz * 0.9) : 0;
    const x0 = C.x * w;
    const y0 = C.y * h;
    if (ctaText) {
      out += `<rect x="${x0.toFixed(1)}" y="${y0.toFixed(1)}" width="${pillW.toFixed(1)}" height="${pillH.toFixed(1)}" rx="${(sz * 0.5).toFixed(1)}" fill="url(#accent)"/>`;
      out += textEl(ctaText, x0 + pillW / 2, y0 + pillH / 2 + sz * 0.34, sz, 800, brand.onAccent, "middle");
    }
    if (input.ctaurl) {
      const usz = ts.ctaUrl * C.scale;
      const ux = x0 + (ctaText ? pillW + sz * 0.8 : 0);
      out += textEl(input.ctaurl, ux, y0 + pillH / 2 + usz * 0.34, usz, 800, brand.eyebrowColor, "start");
    }
  }

  if (input.badge && !isHidden("badge")) {
    const G = get("badge", 0.8, 0.07);
    const sz = ts.badge * G.scale;
    const pillH = sz * 1.9;
    const pillW = estTextWidth(input.badge, sz, true) + 2 * (sz * 0.8);
    const x0 = G.x * w;
    const y0 = G.y * h;
    out += `<rect x="${x0.toFixed(1)}" y="${y0.toFixed(1)}" width="${pillW.toFixed(1)}" height="${pillH.toFixed(1)}" rx="${(pillH / 2).toFixed(1)}" fill="${brand.accent}"/>`;
    out += textEl(input.badge, x0 + pillW / 2, y0 + pillH / 2 + sz * 0.34, sz, 800, brand.onAccent, "middle");
  }

  return out;
}

// horizontal (leaderboard, mobile): logo + headline left, CTA pill right,
// vertically centered. Too short for the rich extras.
function buildRowOverlay(
  input: BannerRenderInput,
  brand: BannerBrandTokens,
  logo: FetchedImage | null,
  padX: number,
): string {
  const w = input.width;
  const h = input.height;
  const ts = typeScale("horizontal", w, h);
  const midY = h / 2;

  const segs =
    input.headlinesegments && input.headlinesegments.length
      ? input.headlinesegments.map((s) => s.text)
      : input.headline
        ? [input.headline]
        : [];
  const headline = segs.join(" ");
  const ctaText = input.ctatext || "";

  let out = "";

  // CTA pill on the right.
  let pillLeft = w - padX;
  if (ctaText) {
    const pillH = ts.cta * 1.9;
    const pillPadX = ts.cta * 0.85;
    const pillW = estTextWidth(ctaText, ts.cta, true) + 2 * pillPadX;
    pillLeft = w - padX - pillW;
    out += `<rect x="${pillLeft.toFixed(1)}" y="${(midY - pillH / 2).toFixed(1)}" width="${pillW.toFixed(1)}" height="${pillH.toFixed(1)}" rx="${(ts.cta * 0.5).toFixed(1)}" fill="url(#accent)"/>`;
    out += textEl(
      ctaText,
      pillLeft + pillW / 2,
      midY + ts.cta * 0.34,
      ts.cta,
      800,
      brand.onAccent,
      "middle",
    );
  }

  // Logo + headline on the left.
  let x = padX;
  if (logo) {
    const logoW = logoRenderWidth(logo, ts.logoH);
    out += `<image x="${x.toFixed(1)}" y="${(midY - ts.logoH / 2).toFixed(1)}" width="${logoW.toFixed(1)}" height="${ts.logoH.toFixed(1)}" preserveAspectRatio="xMidYMid meet" href="${logo.dataUri}"/>`;
    x += logoW + ts.logoH * 0.5;
  }
  if (headline) {
    out += textEl(
      headline,
      x,
      midY + ts.headline * 0.34,
      ts.headline,
      800,
      "#ffffff",
      "start",
    );
  }

  return out;
}
// [SCOPE 070 / T003] END
