#!/usr/bin/env node
/**
 * generate-banners.mjs  (skill: marketing-feature-set)
 * --------------------------------------------------------------------------
 * Renders one branded banner PNG per feature × locale × preset from
 * marketing/feature-set.json, and writes marketing/site/banners/manifest.json
 * for the flipping landing-page carousel.
 *
 *   node .claude/skills/marketing-feature-set/scripts/generate-banners.mjs
 *   node .../generate-banners.mjs --slug unified-task-aggregation   # one feature
 *   node .../generate-banners.mjs --json path/to/feature-set.json --out marketing/site/banners
 *
 * Offline + self-contained: uses @resvg/resvg-js + the shipped Inter fonts. The
 * brand overlay (eyebrow / accent headline / subhead / CTA pill / logo) is
 * composited over the feature's banner.background (local path or URL) or a navy
 * brand gradient fallback when none is given. Brand tokens mirror
 * src/server/lib/banner-brand.ts (SCOPE-070) + the live landing page.
 * --------------------------------------------------------------------------
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname, isAbsolute } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

// ── args ──────────────────────────────────────────────────────────────────────
function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
const ONLY_SLUG = arg('slug', null);
const JSON_PATH = resolve(process.cwd(), arg('json', 'marketing/feature-set.json'));
const OUT_DIR = resolve(process.cwd(), arg('out', 'marketing/site/banners'));

// ── deps (resolved from the project) ───────────────────────────────────────────
const reqCwd = createRequire(pathToFileURL(resolve(process.cwd(), 'package.json')));
const reqHere = createRequire(import.meta.url);
function resolveSpec(spec) { try { return reqCwd.resolve(spec); } catch { return reqHere.resolve(spec); } }
let Resvg;
try {
  ({ Resvg } = await import(pathToFileURL(resolveSpec('@resvg/resvg-js')).href));
} catch (err) {
  console.error('✗ Missing dependency "@resvg/resvg-js". Install it: npm install @resvg/resvg-js');
  process.exit(1);
}

// ── brand (mirrors banner-brand.ts + landing index.html) ────────────────────────
const BRAND = {
  navyA: '#1b2840', navyB: '#0f1722',
  accent: '#c8761b',       // warm amber CTA (landing)
  eyebrow: '#f0b878',      // light amber eyebrow (landing badge)
  onDark: '#e7ecf4',
  white: '#ffffff',
};
const FONT_DIR = resolve(process.cwd(), 'src/server/assets/fonts');
async function fontBuffers() {
  const bufs = [];
  for (const f of ['Inter-Regular.ttf', 'Inter-ExtraBold.ttf']) {
    try { bufs.push(await readFile(resolve(FONT_DIR, f))); }
    catch { console.warn(`  ! font missing: ${f} — text may not render`); }
  }
  return bufs;
}

// ── presets ─────────────────────────────────────────────────────────────────────
const PRESETS = {
  billboard:   { w: 1456, h: 208, layout: 'hero' },
  og:          { w: 1200, h: 630, layout: 'hero' },
  leaderboard: { w: 728,  h: 90,  layout: 'horizontal' },
  mrec:        { w: 300,  h: 250, layout: 'hero' },
  skyscraper:  { w: 160,  h: 600, layout: 'vertical' },
  halfpage:    { w: 300,  h: 600, layout: 'vertical' },
};

// ── helpers ─────────────────────────────────────────────────────────────────────
const clamp = (min, v, max) => Math.max(min, Math.min(v, max));
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const estW = (t, size, bold) => t.length * size * (bold ? 0.6 : 0.52);
function wrap(text, maxW, size) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = []; let cur = '';
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (!cur || estW(t, size, false) <= maxW) cur = t; else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [String(text)];
}
function textEl(s, x, y, size, weight, fill, anchor, extra = '') {
  return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-family="Inter" font-size="${size.toFixed(1)}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}"${extra}>${esc(s)}</text>`;
}

async function backgroundDataUri(bg) {
  if (!bg) return null;
  try {
    if (/^https?:\/\//i.test(bg)) {
      const res = await fetch(bg);
      if (!res.ok) { console.warn(`  ! background fetch ${res.status}: ${bg}`); return null; }
      const ct = (res.headers.get('content-type') || 'image/png').split(';')[0];
      const buf = Buffer.from(await res.arrayBuffer());
      return `data:${ct};base64,${buf.toString('base64')}`;
    }
    const p = isAbsolute(bg) ? bg : resolve(process.cwd(), bg);
    const buf = await readFile(p);
    const mime = /\.jpe?g$/i.test(p) ? 'image/jpeg' : /\.webp$/i.test(p) ? 'image/webp' : 'image/png';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch (e) { console.warn(`  ! background unreadable: ${bg} (${e.message})`); return null; }
}

// ── overlay builders ─────────────────────────────────────────────────────────────
function heroOverlay(t, w, h, logo, billboard) {
  const padX = 0.06 * w, padY = 0.1 * h;
  // Billboard is wide but short, so size its type by a larger scale (width allows it)
  // rather than the height-derived one that made the fonts small.
  const ts = billboard ? {
    logoH:    clamp(16, 0.085 * h, 46),
    eyebrow:  clamp(15, 0.090 * h, 34),
    headline: clamp(40, 0.282 * h, 124),
    body:     clamp(18, 0.102 * h, 38),
    cta:      clamp(24, 0.132 * h, 48),
  } : {
    logoH:    clamp(16, 0.085 * h, 46),
    eyebrow:  clamp(9, 0.045 * h, 22),
    headline: clamp(18, 0.135 * h, 74),
    body:     clamp(10, 0.05 * h, 26),
    cta:      clamp(11, 0.05 * h, 26),
  };
  const gap = clamp(6, 0.03 * h, 26);
  const blocks = [];

  // Logo in the stack — except on the billboard, where the user removed it.
  if (logo && !billboard) blocks.push({ h: ts.logoH, r: (y) => `<image x="${padX.toFixed(1)}" y="${y.toFixed(1)}" height="${ts.logoH.toFixed(1)}" width="${(ts.logoH * (logo.aspect)).toFixed(1)}" preserveAspectRatio="xMidYMid meet" href="${logo.uri}"/>` });
  if (t.eyebrow) blocks.push({ h: ts.eyebrow, r: (y) => textEl(String(t.eyebrow).toUpperCase(), padX, y + ts.eyebrow * 0.82, ts.eyebrow, 800, BRAND.eyebrow, 'start', ` letter-spacing="${(ts.eyebrow * 0.14).toFixed(2)}"`) });
  if (t.headline) {
    const lines = wrap(t.headline, w - 2 * padX, ts.headline);
    const adv = ts.headline * 1.12;
    blocks.push({ h: lines.length * adv, r: (y) => lines.map((ln, i) => textEl(ln, padX, y + i * adv + ts.headline * 0.82, ts.headline, 800, BRAND.white, 'start')).join('') });
  }
  if (t.subhead && h >= 120) {
    const lines = wrap(t.subhead, w - 2 * padX, ts.body);
    const adv = ts.body * 1.32;
    blocks.push({ h: lines.length * adv, r: (y) => lines.map((ln, i) => textEl(ln, padX, y + i * adv + ts.body * 0.82, ts.body, 400, BRAND.onDark, 'start', ' fill-opacity="0.92"')).join('') });
  }
  // Non-billboard CTA stays in the left stack.
  if (t.cta && !billboard) {
    const pillH = ts.cta * 2.0, padP = ts.cta * 0.95;
    const pillW = estW(t.cta, ts.cta, true) + 2 * padP;
    blocks.push({ h: pillH, r: (y) => `<rect x="${padX.toFixed(1)}" y="${y.toFixed(1)}" width="${pillW.toFixed(1)}" height="${pillH.toFixed(1)}" rx="${(ts.cta * 0.5).toFixed(1)}" fill="${BRAND.accent}"/>` + textEl(t.cta, padX + pillW / 2, y + pillH / 2 + ts.cta * 0.34, ts.cta, 800, BRAND.white, 'middle') });
  }

  const totalH = blocks.reduce((s, b) => s + b.h, 0) + gap * Math.max(0, blocks.length - 1);
  let y = Math.max(padY, (h - totalH) / 2), out = '';
  for (const b of blocks) { out += b.r(y); y += b.h + gap; }

  // Billboard CTA is anchored bottom-right instead of in the stack.
  if (t.cta && billboard) {
    const pillH = ts.cta * 2.0, padP = ts.cta * 0.95;
    const pillW = estW(t.cta, ts.cta, true) + 2 * padP;
    const x0 = w - padX - pillW, y0 = h - padY - pillH;
    out += `<rect x="${x0.toFixed(1)}" y="${y0.toFixed(1)}" width="${pillW.toFixed(1)}" height="${pillH.toFixed(1)}" rx="${(ts.cta * 0.5).toFixed(1)}" fill="${BRAND.accent}"/>` + textEl(t.cta, x0 + pillW / 2, y0 + pillH / 2 + ts.cta * 0.34, ts.cta, 800, BRAND.white, 'middle');
  }
  return out;
}

function rowOverlay(t, w, h, logo) {
  const padX = 0.035 * w, midY = h / 2;
  const ts = { logoH: clamp(14, 0.4 * h, 30), headline: clamp(11, 0.34 * h, 26), cta: clamp(9, 0.26 * h, 17) };
  let out = '', pillLeft = w - padX;
  if (t.cta) {
    const pillH = ts.cta * 1.9, pw = estW(t.cta, ts.cta, true) + 2 * (ts.cta * 0.85);
    pillLeft = w - padX - pw;
    out += `<rect x="${pillLeft.toFixed(1)}" y="${(midY - pillH / 2).toFixed(1)}" width="${pw.toFixed(1)}" height="${pillH.toFixed(1)}" rx="${(ts.cta * 0.5).toFixed(1)}" fill="${BRAND.accent}"/>` + textEl(t.cta, pillLeft + pw / 2, midY + ts.cta * 0.34, ts.cta, 800, BRAND.white, 'middle');
  }
  let x = padX;
  if (logo) { const lw = ts.logoH * logo.aspect; out += `<image x="${x.toFixed(1)}" y="${(midY - ts.logoH / 2).toFixed(1)}" height="${ts.logoH.toFixed(1)}" width="${lw.toFixed(1)}" preserveAspectRatio="xMidYMid meet" href="${logo.uri}"/>`; x += lw + ts.logoH * 0.5; }
  if (t.headline) out += textEl(t.headline, x, midY + ts.headline * 0.34, ts.headline, 800, BRAND.white, 'start');
  return out;
}

function colOverlay(t, w, h, logo) {
  // vertical (skyscraper/halfpage): stacked, top-anchored, narrow.
  const padX = 0.08 * w, padY = 0.05 * h;
  const ts = { logoH: clamp(16, 0.045 * h, 34), eyebrow: clamp(8, 0.02 * h, 14), headline: clamp(14, 0.05 * h, 30), body: clamp(9, 0.022 * h, 15), cta: clamp(10, 0.024 * h, 16) };
  const gap = clamp(6, 0.02 * h, 20); const blocks = [];
  if (logo) blocks.push({ h: ts.logoH, r: (y) => `<image x="${padX.toFixed(1)}" y="${y.toFixed(1)}" height="${ts.logoH.toFixed(1)}" width="${(ts.logoH * logo.aspect).toFixed(1)}" preserveAspectRatio="xMidYMid meet" href="${logo.uri}"/>` });
  if (t.eyebrow) blocks.push({ h: ts.eyebrow, r: (y) => textEl(String(t.eyebrow).toUpperCase(), padX, y + ts.eyebrow * 0.82, ts.eyebrow, 800, BRAND.eyebrow, 'start') });
  if (t.headline) { const lines = wrap(t.headline, w - 2 * padX, ts.headline); const adv = ts.headline * 1.12; blocks.push({ h: lines.length * adv, r: (y) => lines.map((ln, i) => textEl(ln, padX, y + i * adv + ts.headline * 0.82, ts.headline, 800, BRAND.white, 'start')).join('') }); }
  if (t.subhead) { const lines = wrap(t.subhead, w - 2 * padX, ts.body); const adv = ts.body * 1.3; blocks.push({ h: lines.length * adv, r: (y) => lines.map((ln, i) => textEl(ln, padX, y + i * adv + ts.body * 0.82, ts.body, 400, BRAND.onDark, 'start', ' fill-opacity="0.9"')).join('') }); }
  if (t.cta) { const pillH = ts.cta * 1.9, pw = estW(t.cta, ts.cta, true) + 2 * (ts.cta * 0.8); blocks.push({ h: pillH, r: (y) => `<rect x="${padX.toFixed(1)}" y="${y.toFixed(1)}" width="${pw.toFixed(1)}" height="${pillH.toFixed(1)}" rx="${(ts.cta * 0.5).toFixed(1)}" fill="${BRAND.accent}"/>` + textEl(t.cta, padX + pw / 2, y + pillH / 2 + ts.cta * 0.34, ts.cta, 800, BRAND.white, 'middle') }); }
  let y = padY, out = ''; for (const b of blocks) { out += b.r(y); y += b.h + gap; } return out;
}

function buildSvg(t, preset, bgUri, logo, presetKey) {
  const { w, h, layout } = preset;
  const bgLayer = bgUri
    ? `<image x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice" href="${bgUri}"/>`
    : `<rect x="0" y="0" width="${w}" height="${h}" fill="url(#navy)"/>`;
  const overlay = layout === 'horizontal' ? rowOverlay(t, w, h, logo) : layout === 'vertical' ? colOverlay(t, w, h, logo) : heroOverlay(t, w, h, logo, presetKey === 'billboard');
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
    `<defs>`,
    `<radialGradient id="navy" cx="0.5" cy="-0.2" r="1.25"><stop offset="0" stop-color="${BRAND.navyA}"/><stop offset="0.6" stop-color="${BRAND.navyB}"/></radialGradient>`,
    `<linearGradient id="scrim" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${w}" y2="0"><stop offset="0" stop-color="${BRAND.navyB}" stop-opacity="0.82"/><stop offset="0.5" stop-color="${BRAND.navyB}" stop-opacity="0.45"/><stop offset="1" stop-color="${BRAND.navyB}" stop-opacity="0.12"/></linearGradient>`,
    `</defs>`,
    bgLayer,
    `<rect x="0" y="0" width="${w}" height="${h}" fill="url(#scrim)"/>`,
    overlay,
    `</svg>`,
  ].join('');
}

// ── banner text for a feature+locale ──────────────────────────────────────────────
function bannerText(feature, locale) {
  const b = feature.banner || {};
  const base = { eyebrow: b.eyebrow || feature.category || '', headline: b.headline || feature.name || '', subhead: b.subhead || feature.valueProp || '', cta: b.cta || (feature.brandCta || 'Learn more →') };
  const lv = feature.locales && feature.locales[locale];
  if (lv) {
    const lb = lv.banner || {};
    return {
      eyebrow: lb.eyebrow || base.eyebrow,
      headline: lb.headline || lv.name || base.headline,
      subhead: lb.subhead || lv.valueProp || base.subhead,
      cta: lb.cta || base.cta,
    };
  }
  return base;
}

function pngAspect(buf) {
  if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50) {
    const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
    if (w && h) return w / h;
  }
  return 4; // wordmark guess
}

async function main() {
  const data = JSON.parse(await readFile(JSON_PATH, 'utf8').catch(() => { throw new Error(`feature-set.json not found: ${JSON_PATH}`); }));
  const features = (data.features || []).filter((f) => !ONLY_SLUG || f.slug === ONLY_SLUG).slice().sort((a, b) => (a.priorityOverride ?? a.rank ?? 999) - (b.priorityOverride ?? b.rank ?? 999));
  if (!features.length) { console.error('No features to render.'); process.exit(1); }

  await mkdir(OUT_DIR, { recursive: true });
  const fonts = await fontBuffers();

  // logo (from brand.logo) as data-uri once.
  let logo = null;
  const logoSrc = data.brand && data.brand.logo;
  const logoUri = await backgroundDataUri(logoSrc);
  if (logoUri) {
    let aspect = 4;
    if (logoSrc && !/^https?:/i.test(logoSrc)) { try { aspect = pngAspect(await readFile(resolve(process.cwd(), logoSrc))); } catch { /* keep guess */ } }
    logo = { uri: logoUri, aspect };
  }

  const localesSeen = new Set();
  const manifestFeatures = [];
  let count = 0;

  for (const f of features) {
    const locales = ['en-US', ...Object.keys(f.locales || {})];
    const presets = (f.banner && f.banner.presets) || ['billboard', 'og'];
    const bgUri = await backgroundDataUri(f.banner && f.banner.background);
    const entry = { slug: f.slug, rank: f.rank ?? 999, name: f.name, category: f.category || '', link: (f.banner && f.banner.link) || '#features', dwellMs: (f.display && f.display.dwellMs) || 5000, enhanced: !!(f.display && f.display.enhanced), billboards: {}, og: {} };

    for (const locale of locales) {
      localesSeen.add(locale);
      const t = bannerText(f, locale);
      for (const key of presets) {
        const preset = PRESETS[key];
        if (!preset) { console.warn(`  ! unknown preset "${key}" (skipped)`); continue; }
        const svg = buildSvg(t, preset, bgUri, logo, key);
        const png = new Resvg(svg, {
          fitTo: { mode: 'width', value: Math.max(1, Math.round(preset.w * 2)) },
          font: { fontBuffers: fonts, defaultFontFamily: 'Inter', loadSystemFonts: false },
          background: 'rgba(0,0,0,0)',
        }).render().asPng();
        const fname = `${f.slug}.${key}.${locale}.png`;
        await writeFile(resolve(OUT_DIR, fname), png);
        const rel = `banners/${fname}`;
        if (key === 'billboard') entry.billboards[locale] = rel;
        if (key === 'og') entry.og[locale] = rel;
        count++;
        console.log(`  ✓ ${fname} (${preset.w}×${preset.h})`);
      }
    }
    manifestFeatures.push(entry);
  }

  const manifest = {
    generatedAt: null,
    locales: [...localesSeen],
    features: manifestFeatures.sort((a, b) => a.rank - b.rank),
  };
  await writeFile(resolve(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`\n✓ ${count} banners + manifest.json → ${OUT_DIR}`);
}

main().catch((err) => { console.error('✗ Failed to generate banners:', err.message || err); process.exit(1); });
