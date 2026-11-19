// wxRegenHelp orchestrator — regenerate the end-user help (HTML site + PDF) in a
// chosen language. Maps the language to an app locale, captures the app UI in
// that locale, rebuilds the annotated images, and builds both outputs.
//
//   node docs-workspace/tooling/regen.mjs <language>
//
// <language> accepts the 6 dropdown choices (friendly names or codes):
//   English | French | Español/Spanish | Italiano/Italian | Deutsch/German | Português/Portuguese
//
// Credentials come from env only: WXK_EMAIL, WXK_PASS (never written to disk).
// Non-English builds land in docs-workspace/i18n/<locale>/ so they never clobber
// the English canonical build. Translate that workspace's sections/*.md into the
// target language BEFORE running for a fully localized guide (see wxRegenHelp.md).

import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOOLING = __dirname;
const CANONICAL = path.resolve(__dirname, ".."); // docs-workspace (English)
const SKILL_SCRIPTS = path.resolve(__dirname, "..", "..", ".claude", "skills", "wxHelpGenerate", "scripts");
const PY = process.env.PY || "python";

// language choice -> { code, name }
const LANGS = {
  "english": "en-US", "en": "en-US", "en-us": "en-US",
  "french": "fr-FR", "francais": "fr-FR", "français": "fr-FR", "fr": "fr-FR", "fr-fr": "fr-FR",
  "spanish": "es-ES", "espanol": "es-ES", "español": "es-ES", "es": "es-ES", "es-es": "es-ES",
  "italian": "it-IT", "italiano": "it-IT", "it": "it-IT", "it-it": "it-IT",
  "german": "de-DE", "deutsch": "de-DE", "de": "de-DE", "de-de": "de-DE",
  "portuguese": "pt-BR", "portugues": "pt-BR", "português": "pt-BR", "pt": "pt-BR", "pt-br": "pt-BR", "pt-pt": "pt-BR",
};
const NAMES = { "en-US": "English", "fr-FR": "Français", "es-ES": "Español", "it-IT": "Italiano", "de-DE": "Deutsch", "pt-BR": "Português" };

const raw = (process.argv[2] || "english").trim().toLowerCase();
const code = LANGS[raw];
if (!code) {
  console.error(`Unknown language "${process.argv[2]}". Choose one of: English, French, Español, Italiano, Deutsch, Português.`);
  process.exit(2);
}
if (!process.env.WXK_EMAIL || !process.env.WXK_PASS) {
  console.error("Set WXK_EMAIL and WXK_PASS (the wxKanban login to capture with) in the environment.");
  process.exit(2);
}

const isEnglish = code === "en-US";
const WS = isEnglish ? CANONICAL : path.join(CANONICAL, "i18n", code);
const pdfSuffix = isEnglish ? "" : `-${code}`;

console.log(`\n=== wxRegenHelp — ${NAMES[code]} (${code}) ===`);
console.log(`workspace: ${WS}\n`);

// Seed a non-English workspace from the English canonical (config + sections as a
// starting point; translate the sections before building for a localized guide).
if (!isEnglish) {
  fs.mkdirSync(WS, { recursive: true });
  if (!fs.existsSync(path.join(WS, "config.json"))) {
    fs.copyFileSync(path.join(CANONICAL, "config.json"), path.join(WS, "config.json"));
    console.log("seeded config.json from English canonical");
  }
  if (!fs.existsSync(path.join(WS, "sections"))) {
    fs.cpSync(path.join(CANONICAL, "sections"), path.join(WS, "sections"), { recursive: true });
    console.log("seeded sections/ from English canonical — TRANSLATE these to " + NAMES[code] + " before building for a localized guide");
  }
}

const env = { ...process.env, WXK_WS: WS, WXK_LANG: code, WXK_PDF_SUFFIX: pdfSuffix };
const run = (label, cmd, args) => {
  console.log(`\n--- ${label} ---`);
  execFileSync(cmd, args, { stdio: "inherit", env, cwd: path.resolve(__dirname, "..", "..") });
};

// 1) capture the app UI in the chosen locale  2) rebuild annotated/redacted images
run("capture screens", "node", [path.join(TOOLING, "capture.mjs")]);
run("build images", "node", [path.join(TOOLING, "buildimages.mjs")]);
// 3) build the HTML site (+ prime the PDF HTML)  4) render the PDF via Chrome
run("build HTML site", PY, [path.join(SKILL_SCRIPTS, "build_docs.py"), WS, "--html", "--pdf"]);
run("render PDF", "node", [path.join(TOOLING, "topdf.mjs")]);

// Tidy intermediates. Raw screenshots + text dumps hold UNREDACTED on-screen data
// (real emails, addresses); the published site/ and PDF embed only the redacted
// finals, so purge the raw sources every run to keep the workspace clean.
const rm = (p) => { try { fs.rmSync(p, { recursive: true, force: true }); } catch { /* ignore */ } };
rm(path.join(WS, "_pdf_build.html"));
rm(path.join(WS, "_annotate-specs"));
rm(path.join(WS, "inventory.raw.json"));
try {
  for (const d of fs.readdirSync(path.join(WS, "screens"))) {
    rm(path.join(WS, "screens", d, "raw"));
    rm(path.join(WS, "screens", d, "text.txt"));
  }
} catch { /* ignore */ }

console.log(`\n=== done: ${NAMES[code]} ===`);
console.log(`HTML site : ${path.join(WS, "site", "index.html")}`);
console.log(`PDF       : ${path.join(WS, `wxKanban-User-Guide${pdfSuffix}.pdf`)}`);
