// SCOPE-106 / T004+T005 — capture a live website's real rendered styling so AI can
// map it onto the SCOPE-062 19-token model. This is the "borrow a look" input adapter:
// it observes colors / fonts / radius / CSS variables; it never reads the site's layout
// or chrome (the customer authors their own header/footer).
//
// Two tiers, then the caller fail-opens (SCOPE-106 FR-003):
//   1. headless Chromium (computed styles — the faithful path)
//   2. static fetch + parse (lightweight fallback when Chromium is unavailable)
// If both throw, the /derive/url route falls open to the wxKanban default theme.
//
// SECURITY: this fetches a user-supplied URL from the server (which carries an AWS
// instance role), so it is an SSRF sink. `assertPublicHttpUrl` resolves the host and
// refuses localhost / private / link-local (incl. the 169.254.169.254 metadata IP)
// before any navigation or fetch.

import puppeteer from "puppeteer";
import puppeteerCore from "puppeteer-core";
import type { Browser } from "puppeteer";
import chromiumPkg from "@sparticuz/chromium";
import { createLogger } from "~/server/lib/logger.js";
import { isPrivateAddress, assertPublicHttpUrl } from "../lib/url-guard.js";

// @sparticuz/chromium ESM/CJS interop — same unwrap as MarkdownPdfRenderer.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const chromium: any =
  typeof (chromiumPkg as any)?.executablePath === "function"
    ? chromiumPkg
    : ((chromiumPkg as any)?.default ?? chromiumPkg);

const logger = createLogger("site-style-capture");

const NAV_TIMEOUT_MS = 15000;
const STATIC_TIMEOUT_MS = 10000;

/** A compact observation of a site's look — colors as CSS color strings (rgb/hex),
 *  fonts, radius, and any :root CSS custom properties. Fed to the AI mapper as text. */
export interface SiteStyleCapture {
  url: string;
  method: "headless" | "static";
  backgroundColor: string | null;
  textColor: string | null;
  /** Dominant button/link background — the "primary" candidate. */
  primaryColor: string | null;
  primaryTextColor: string | null;
  borderColor: string | null;
  radius: string | null;
  fontFamilies: string[];
  cssVars: Record<string, string>;
  /** Observed colors, most-frequent first. */
  palette: string[];
}

interface RawHeadlessCapture {
  backgroundColor: string | null;
  textColor: string | null;
  primaryColor: string | null;
  primaryTextColor: string | null;
  borderColor: string | null;
  radius: string | null;
  fontFamilies: string[];
  palette: string[];
  cssVars: Record<string, string>;
}

// [SCOPE 106 / T004] BEGIN — SSRF guard: only public http(s) URLs may be captured
// MOVED-TO [SCOPE 108 / T011] src/server/lib/url-guard.ts — imported above for internal use
// (captureSiteStyle calls it) and re-exported here for back-compat.
export { isPrivateAddress, assertPublicHttpUrl };
// [SCOPE 106 / T004] END

// App Runner's managed Node runtime has no usable system Chromium (see
// MarkdownPdfRenderer): in production use the serverless build via puppeteer-core;
// locally use full puppeteer + its bundled Chromium.
// [SCOPE 106 / T004] BEGIN — headless Chromium launch (mirrors MarkdownPdfRenderer)
async function launchBrowser(): Promise<Browser> {
  if (process.env.NODE_ENV === "production") {
    return (await puppeteerCore.launch({
      args: [...chromium.args, "--no-sandbox", "--disable-setuid-sandbox"],
      executablePath: await chromium.executablePath(),
      headless: true,
    })) as unknown as Browser;
  }
  return puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
}
// [SCOPE 106 / T004] END

// [SCOPE 106 / T004] BEGIN — headless capture of computed styles / CSS vars / fonts
async function captureViaHeadless(u: URL): Promise<SiteStyleCapture> {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    // tsx/esbuild inject module-scope helpers (e.g. `__name` from keepNames) into
    // transpiled functions. Puppeteer serializes the reader below and runs it in the
    // PAGE context, where those helpers don't exist — so seed a no-op shim first
    // (a plain string, so the bundler can't rewrite it) or page.evaluate throws
    // "__name is not defined" and headless capture always fails.
    await page.evaluateOnNewDocument(
      "globalThis.__name = globalThis.__name || function (t) { return t; };",
    );
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(u.toString(), { waitUntil: "networkidle2", timeout: NAV_TIMEOUT_MS });
    const raw = await page.evaluate((): RawHeadlessCapture => {
      const val = (el: Element, prop: string): string =>
        getComputedStyle(el).getPropertyValue(prop).trim();
      const isColor = (c: string): boolean =>
        Boolean(c) &&
        c !== "transparent" &&
        !/rgba\([^)]*,\s*0(?:\.0+)?\)\s*$/.test(c); // reject any zero-alpha color

      const body = document.body;
      const root = document.documentElement;
      const bodyBg = val(body, "background-color");
      const rootBg = val(root, "background-color");
      const textColor = val(body, "color") || null;

      const fonts = new Set<string>();
      const bodyFont = val(body, "font-family");
      if (bodyFont) fonts.add(bodyFont);
      document.querySelectorAll("h1,h2,h3").forEach((h) => {
        const f = getComputedStyle(h).fontFamily;
        if (f) fonts.add(f);
      });

      const bgCount: Record<string, number> = {};
      const textForBg: Record<string, string> = {};
      let radius: string | null = null;
      const controls = Array.from(
        document.querySelectorAll('button, a, .btn, [role="button"]'),
      ).slice(0, 200);
      controls.forEach((c) => {
        const cs = getComputedStyle(c);
        const bg = cs.backgroundColor;
        if (isColor(bg) && bg !== bodyBg) {
          bgCount[bg] = (bgCount[bg] ?? 0) + 1;
          if (!textForBg[bg]) textForBg[bg] = cs.color;
        }
        if (!radius) {
          const r = cs.borderRadius;
          if (r && r !== "0px") radius = r;
        }
      });
      const primaryColor =
        Object.keys(bgCount).sort((a, b) => bgCount[b] - bgCount[a])[0] ?? null;
      const primaryTextColor = primaryColor ? (textForBg[primaryColor] ?? null) : null;

      let borderColor: string | null = null;
      const bordered = Array.from(document.querySelectorAll("*"))
        .slice(0, 500)
        .find((el) => {
          const cs = getComputedStyle(el);
          return parseFloat(cs.borderTopWidth) > 0 && isColor(cs.borderTopColor);
        });
      if (bordered) borderColor = getComputedStyle(bordered).borderTopColor;

      const freq: Record<string, number> = {};
      const bgFreq: Record<string, number> = {};
      Array.from(document.querySelectorAll("*"))
        .slice(0, 400)
        .forEach((el) => {
          const cs = getComputedStyle(el);
          if (isColor(cs.color)) freq[cs.color] = (freq[cs.color] ?? 0) + 1;
          if (isColor(cs.backgroundColor)) {
            freq[cs.backgroundColor] = (freq[cs.backgroundColor] ?? 0) + 1;
            bgFreq[cs.backgroundColor] = (bgFreq[cs.backgroundColor] ?? 0) + 1;
          }
        });
      const palette = Object.keys(freq)
        .sort((a, b) => freq[b] - freq[a])
        .slice(0, 12);
      // A transparent body background is common (bg lives on a wrapper) — fall back to
      // the most frequent opaque element background.
      const commonBg = Object.keys(bgFreq).sort((a, b) => bgFreq[b] - bgFreq[a])[0] ?? null;
      const backgroundColor = isColor(bodyBg) ? bodyBg : isColor(rootBg) ? rootBg : commonBg;

      const cssVars: Record<string, string> = {};
      try {
        for (const sheet of Array.from(document.styleSheets)) {
          let rules: CSSRuleList | null = null;
          try {
            rules = sheet.cssRules;
          } catch {
            continue; // cross-origin stylesheet — not readable
          }
          if (!rules) continue;
          for (const rule of Array.from(rules)) {
            const styleRule = rule as CSSStyleRule;
            if (styleRule.selectorText === ":root" && styleRule.style) {
              for (const name of Array.from(styleRule.style)) {
                if (name.startsWith("--")) {
                  cssVars[name] = styleRule.style.getPropertyValue(name).trim();
                }
              }
            }
          }
        }
      } catch {
        /* best-effort */
      }

      return {
        backgroundColor,
        textColor,
        primaryColor,
        primaryTextColor,
        borderColor,
        radius,
        fontFamilies: Array.from(fonts).filter(Boolean),
        palette,
        cssVars,
      };
    });
    return { url: u.toString(), method: "headless", ...raw };
  } finally {
    await browser.close();
  }
}
// [SCOPE 106 / T004] END

// [SCOPE 106 / T005] BEGIN — static fetch + parse fallback (no browser)
async function captureViaStatic(u: URL): Promise<SiteStyleCapture> {
  const res = await fetch(u.toString(), {
    redirect: "follow",
    headers: { "user-agent": "wxKanban-ThemeCapture/1.0 (+https://wxperts.com)" },
    signal: AbortSignal.timeout(STATIC_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Static fetch failed: HTTP ${res.status}`);
  const html = await res.text();
  const styleText =
    (html.match(/<style[\s\S]*?<\/style>/gi) ?? []).join("\n") + "\n" + html;

  const freq: Record<string, number> = {};
  for (const m of styleText.matchAll(/#[0-9a-fA-F]{6}\b|rgba?\([^)]+\)/g)) {
    const c = m[0];
    freq[c] = (freq[c] ?? 0) + 1;
  }
  const palette = Object.keys(freq)
    .sort((a, b) => freq[b] - freq[a])
    .slice(0, 12);
  const fontMatch = styleText.match(/font-family\s*:\s*([^;}"']+)/i);
  const radiusMatch = styleText.match(/border-radius\s*:\s*([^;}"']+)/i);

  return {
    url: u.toString(),
    method: "static",
    backgroundColor: null,
    textColor: null,
    primaryColor: palette[0] ?? null,
    primaryTextColor: null,
    borderColor: null,
    radius: radiusMatch?.[1]?.trim() ?? null,
    fontFamilies: fontMatch ? [fontMatch[1].trim()] : [],
    cssVars: {},
    palette,
  };
}
// [SCOPE 106 / T005] END

/** Capture a site's style: try headless, then static, else throw (caller fail-opens). */
// [SCOPE 106 / T004] BEGIN — captureSiteStyle (headless → static → throw)
export async function captureSiteStyle(rawUrl: string): Promise<SiteStyleCapture> {
  const u = await assertPublicHttpUrl(rawUrl);
  try {
    return await captureViaHeadless(u);
  } catch (headlessErr) {
    logger.warn({ err: headlessErr, url: u.toString() }, "Headless capture failed; trying static fallback");
    return await captureViaStatic(u);
  }
}
// [SCOPE 106 / T004] END

/** Turn a capture into a compact prompt context for deriveThemeViaAI (SCOPE-062). */
// [SCOPE 106 / T004] BEGIN — captureToPromptContext (capture → AI mapping brief)
export function captureToPromptContext(c: SiteStyleCapture): string {
  const lines = [
    `Borrowed look captured from website: ${c.url} (via ${c.method}).`,
    `Map these OBSERVED values onto the 19-token theme, preserving the site's feel while ensuring WCAG AA:`,
    c.backgroundColor ? `- Page background: ${c.backgroundColor}` : "",
    c.textColor ? `- Body text: ${c.textColor}` : "",
    c.primaryColor ? `- Dominant button/link (use as primary): ${c.primaryColor}` : "",
    c.primaryTextColor ? `- Text on that primary: ${c.primaryTextColor}` : "",
    c.borderColor ? `- Border color: ${c.borderColor}` : "",
    c.radius ? `- Corner radius: ${c.radius}` : "",
    c.fontFamilies.length ? `- Fonts: ${c.fontFamilies.join(" | ")}` : "",
    c.palette.length ? `- Observed palette (most frequent first): ${c.palette.join(", ")}` : "",
    Object.keys(c.cssVars).length
      ? `- Site CSS variables: ${Object.entries(c.cssVars).slice(0, 20).map(([k, v]) => `${k}=${v}`).join("; ")}`
      : "",
  ];
  return lines.filter(Boolean).join("\n");
}
// [SCOPE 106 / T004] END
