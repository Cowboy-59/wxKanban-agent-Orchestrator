// wxHelpGenerate driver — Puppeteer substitute for the Claude-in-Chrome tools.
// Logs into the app once and exposes helpers to capture a screen (screenshot +
// DOM element inventory) and to click/interrogate elements.
//
// Credentials come from env only (WXK_EMAIL / WXK_PASS) — never written to disk.

import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Output workspace: WXK_WS lets one toolchain build many per-language workspaces
// (e.g. docs-workspace for English, docs-workspace/i18n/fr-FR for French).
export const WORKSPACE = process.env.WXK_WS
  ? path.resolve(process.env.WXK_WS)
  : path.resolve(__dirname, "..");
const BASE = process.env.WXK_BASE || "http://localhost:5173";
const EMAIL = process.env.WXK_EMAIL;
const PASS = process.env.WXK_PASS;
// WXK_LANG is the app locale code (en-US, fr-FR, es-ES, it-IT, de-DE, pt-BR).
export const LOCALE = process.env.WXK_LANG || "";
const VIEWPORT = { width: 1440, height: 900, deviceScaleFactor: 2 };

// Force the app's UI locale by seeding localStorage before any page script runs.
export async function applyLocale(page) {
  if (!LOCALE) return;
  await page.evaluateOnNewDocument((code) => {
    try { localStorage.setItem("wxkanban_locale", code); } catch { /* ignore */ }
  }, LOCALE);
}

export async function launch() {
  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: VIEWPORT,
    args: ["--no-sandbox", "--disable-gpu", `--window-size=${VIEWPORT.width},${VIEWPORT.height}`],
  });
  const page = (await browser.pages())[0] || (await browser.newPage());
  await page.setViewport(VIEWPORT);
  await applyLocale(page);
  return { browser, page };
}

export async function login(page) {
  if (!EMAIL || !PASS) throw new Error("WXK_EMAIL / WXK_PASS env vars required");
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle2", timeout: 60000 });
  await page.waitForSelector('input[type="email"]', { timeout: 30000 });
  await page.type('input[type="email"]', EMAIL, { delay: 10 });
  await page.type('input[type="password"]', PASS, { delay: 10 });
  await Promise.all([
    page.click('button[type="submit"]'),
    page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 }).catch(() => {}),
  ]);
  // SPA may not fire a full navigation; wait for the URL to leave /login.
  await page.waitForFunction(() => !location.pathname.startsWith("/login"), { timeout: 30000 })
    .catch(() => {});
  await sleep(1500);
  return page.url();
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Wait until the app content has settled (no visible spinner, body has text).
export async function settle(page, ms = 1200) {
  await page.waitForFunction(
    () => document.body && document.body.innerText.trim().length > 40,
    { timeout: 20000 }
  ).catch(() => {});
  await sleep(ms);
}

// Enumerate interactive elements on the current page from the DOM (not the pixels).
export async function inventory(page) {
  return page.evaluate(() => {
    const seen = new Set();
    const out = [];
    const vis = (el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
    };
    const label = (el) =>
      (el.getAttribute("aria-label") ||
        el.innerText ||
        el.value ||
        el.getAttribute("placeholder") ||
        el.getAttribute("title") ||
        "").trim().replace(/\s+/g, " ").slice(0, 80);
    const sel = "a[href], button, [role='button'], [role='tab'], input, select, textarea, [role='menuitem']";
    for (const el of document.querySelectorAll(sel)) {
      if (!vis(el)) continue;
      const lbl = label(el);
      const tag = el.tagName.toLowerCase();
      const role = el.getAttribute("role");
      const type = tag === "a" ? "link" : tag === "input" ? (el.type || "input") : role || tag;
      const href = el.getAttribute("href");
      const key = `${type}|${lbl}|${href || ""}`;
      if (seen.has(key)) continue;
      if (!lbl && !href) continue;
      seen.add(key);
      out.push({ label: lbl, type, href, ariaLabel: el.getAttribute("aria-label") || null });
    }
    return out;
  });
}

// Sidebar / top-nav links only (for screen discovery).
export async function navLinks(page) {
  return page.evaluate(() => {
    const out = [];
    const seen = new Set();
    const scopes = document.querySelectorAll("nav, aside, [class*='sidebar'], [class*='Sidebar'], header");
    for (const scope of scopes) {
      for (const a of scope.querySelectorAll("a[href^='/']")) {
        const href = a.getAttribute("href");
        const text = (a.innerText || a.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ");
        if (!href || seen.has(href)) continue;
        seen.add(href);
        out.push({ href, text });
      }
    }
    return out;
  });
}

export async function shot(page, id, name) {
  const dir = path.join(WORKSPACE, "screens", id, "raw");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return file;
}

export async function shotFull(page, id, name) {
  const dir = path.join(WORKSPACE, "screens", id, "raw");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

export async function pageText(page) {
  return page.evaluate(() => document.body.innerText.slice(0, 6000));
}
