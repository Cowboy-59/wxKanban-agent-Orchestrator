// [SCOPE 084 / T013] Build an illustrated Help PDF per language: capture localized
// app screenshots (login → set language → screenshot each documented screen), then
// render a branded PDF per locale via MarkdownPdfRenderer. Writes public/help.<xx>.pdf.
//
// Requires the app running (dev client + API) and an ADMIN login. Credentials + base
// URL come from env so nothing sensitive lives in the repo:
//   HELP_PDF_EMAIL=... HELP_PDF_PASSWORD=... npx tsx scripts/build-help-pdf.ts
//   (optional) HELP_PDF_BASE=http://localhost:5173  HELP_PDF_RESTORE_LANG=en-US
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import puppeteer from "puppeteer";
import { MarkdownPdfRenderer } from "../src/server/services/MarkdownPdfRenderer.js";
import {
  getLocalizedHelp,
  HELP_UI,
  HELP_LOCALES,
  localeSuffix,
  type HelpLocale,
} from "../src/shared/help/i18n.js";

const BASE = process.env.HELP_PDF_BASE ?? "http://localhost:5173";
const EMAIL = process.env.HELP_PDF_EMAIL;
const PASS = process.env.HELP_PDF_PASSWORD;
const RESTORE_LANG = process.env.HELP_PDF_RESTORE_LANG ?? "en-US";
const SHOTS = join(tmpdir(), "wxkanban-help-shots");
const PUB = join(process.cwd(), "public");

if (!EMAIL || !PASS) {
  console.error("Set HELP_PDF_EMAIL and HELP_PDF_PASSWORD (an ADMIN login).");
  process.exit(1);
}

// Documented features that have a real, screenshot-able app screen (the ones with articles).
const SCREENS: Array<{ id: string; route: string }> = [
  { id: "dashboard", route: "/admin/dashboard" },
  { id: "projects", route: "/admin/projects" },
  { id: "tasks", route: "/tasks" },
  { id: "pmIntegrations", route: "/integrations" },
  { id: "team", route: "/admin/team" },
  { id: "timeTracking", route: "/admin/billing" },
  { id: "invoices", route: "/admin/invoices" },
  { id: "reports", route: "/admin/reports" },
  { id: "workHub", route: "/dashboard/work-hub" },
  { id: "stackProfiles", route: "/admin/stack-profiles" },
  { id: "themeProfiles", route: "/admin/theme-profiles" },
  { id: "settings", route: "/admin/settings" },
  { id: "faq", route: "/faq" },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function setLanguage(page: import("puppeteer").Page, locale: string) {
  await page.evaluate(async (loc) => {
    const t = localStorage.getItem("wxkanban_token");
    await fetch("/api/auth/profile", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...(t ? { Authorization: `Bearer ${t}` } : {}) },
      body: JSON.stringify({ language: loc }),
    });
    localStorage.setItem("wxkanban_locale", loc);
  }, locale);
}

async function capture() {
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]);

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
  await page.type('input[type="email"]', EMAIL!, { delay: 10 });
  await page.type('input[type="password"]', PASS!, { delay: 10 });
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => !location.pathname.includes("/login"), { timeout: 25000 });
  await sleep(2000);

  for (const locale of HELP_LOCALES) {
    mkdirSync(join(SHOTS, locale), { recursive: true });
    await setLanguage(page, locale);
    for (const s of SCREENS) {
      try {
        await page.goto(`${BASE}${s.route}`, { waitUntil: "networkidle0", timeout: 30000 });
        await sleep(1600);
        await page.screenshot({ path: join(SHOTS, locale, `${s.id}.jpg`), type: "jpeg", quality: 82, fullPage: true });
        process.stdout.write(`  ${locale}/${s.id} ✓\n`);
      } catch (e) {
        process.stdout.write(`  ${locale}/${s.id} FAILED: ${(e as Error).message}\n`);
      }
    }
  }

  await setLanguage(page, RESTORE_LANG);
  console.log("restored language to:", RESTORE_LANG);
  await browser.close();
}

function buildMarkdown(locale: HelpLocale): string {
  const L = getLocalizedHelp(locale);
  const U = HELP_UI[locale];
  const byId = new Map(L.features.map((f) => [f.id, f]));
  const parts: string[] = [`# ${U.footer}`, "", U.mdIntro, ""];

  for (const { id } of SCREENS) {
    const f = byId.get(id);
    if (!f) continue;
    const a = L.articles[id];
    parts.push(`\n## ${f.title}\n`);
    const shot = join(SHOTS, locale, `${id}.jpg`);
    if (existsSync(shot)) {
      const b64 = readFileSync(shot).toString("base64");
      parts.push(`<img src="data:image/jpeg;base64,${b64}" style="max-width:100%;border:1px solid #e5e7eb;border-radius:6px;margin:8px 0" />\n`);
    }
    parts.push(`${f.description}\n`);
    if (a?.overview) parts.push(`### ${U.overview}\n\n${a.overview}\n`);
    if (a?.whatYouSee?.length) parts.push(`### ${U.whatYoullSee}\n\n` + a.whatYouSee.map((x) => `- ${x}`).join("\n") + "\n");
    if (a?.controls?.length)
      parts.push(
        `### ${U.controlsOptions}\n\n` +
          a.controls
            .map((c) => `- **${c.label}**${c.adminOnly ? ` _(${U.adminTag})_` : ""} — ${c.does}${c.planNote ? ` _(${c.planNote})_` : ""}`)
            .join("\n") +
          "\n",
      );
    if (a?.tasks?.length) {
      parts.push(`### ${U.commonTasks}\n`);
      for (const t of a.tasks) parts.push(`**${t.title}**\n\n` + t.steps.map((s, i) => `${i + 1}. ${s}`).join("\n") + "\n");
    }
    if (a?.tips?.length) parts.push(`### ${U.tips}\n\n` + a.tips.map((x) => `- ${x}`).join("\n") + "\n");
    if (!a) {
      const g = L.guides[id];
      if (g?.length) parts.push(`### ${U.howToUseHeading}\n\n` + g.map((s, i) => `${i + 1}. ${s}`).join("\n") + "\n");
    }
  }
  return parts.join("\n");
}

async function renderPdfs() {
  for (const locale of HELP_LOCALES) {
    const pdf = await MarkdownPdfRenderer.renderToPdf(buildMarkdown(locale), HELP_UI[locale].pageTitle);
    const out = join(PUB, `help${localeSuffix(locale)}.pdf`);
    writeFileSync(out, pdf);
    console.log("wrote", out, pdf.length, "bytes");
  }
}

console.log("=== capturing screenshots ===");
await capture();
console.log("=== rendering PDFs ===");
await renderPdfs();
console.log("done");
