// Build the wxKanban Manual (SCOPE-141): generate the Command Reference, compose the Customer and
// Internal editions, build each with build_docs.py (HTML) and Puppeteer (PDF), run the release
// checks, and publish the Customer edition to public/manual/.
//
//   npx tsx docs-workspace/tooling/manual/build-manual.mts               full build + publish
//   npx tsx docs-workspace/tooling/manual/build-manual.mts --no-publish  build and check only
//   npx tsx docs-workspace/tooling/manual/build-manual.mts --self-test   prove a planted leak fails
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";
import { buildModel, readCommandSources, renderReference, type CommandModel } from "./command-reference.mjs";
import { checkCommandMentions, scanForLeaks, unsafeOutputReason, type LeakHit } from "./checks.mjs";
import {
  composeEdition, orderSections, parseSection, partPage, validateIds,
  type Edition, type ManualPart, type ManualSection,
} from "./sections.mjs";

// [SCOPE 141 / T014] BEGIN — Paths and configuration
const HERE = path.dirname(fileURLToPath(import.meta.url));
const WS = path.resolve(HERE, "..", "..");
const REPO = path.resolve(WS, "..");
const SECTIONS = path.join(WS, "sections");
const REFERENCE = path.join(SECTIONS, "reference");
const BUILD = path.join(WS, "build");
const PUBLISH = path.join(REPO, "public", "manual");
const BUILD_DOCS = path.join(REPO, ".claude", "skills", "wxHelpGenerate", "scripts", "build_docs.py");
const PDF_NAME = "wxKanban-Manual.pdf";

interface ManualConfig {
  product_name: string;
  theme: Record<string, string>;
  parts: ManualPart[];
}

function loadConfig(): ManualConfig {
  return JSON.parse(readFileSync(path.join(WS, "config.json"), "utf8")) as ManualConfig;
}

function appVersion(): string {
  const m = /APP_VERSION = '([^']+)'/.exec(readFileSync(path.join(REPO, "src", "client", "version.ts"), "utf8"));
  return m ? m[1] : "unknown";
}

function fail(message: string): never {
  process.stderr.write(`\nMANUAL BUILD FAILED: ${message}\n`);
  process.exit(1);
}
// [SCOPE 141 / T014] END

// [SCOPE 141 / T005] BEGIN — Write the generated Command Reference
function generateReference(): CommandModel {
  const exclude = (JSON.parse(readFileSync(path.join(HERE, "exclude.json"), "utf8")) as { commands: Record<string, string> }).commands;
  const model = buildModel(readCommandSources(REPO), exclude);
  const { files, registry } = renderReference(model);
  rmSync(REFERENCE, { recursive: true, force: true });
  mkdirSync(REFERENCE, { recursive: true });
  for (const [name, content] of files) writeFileSync(path.join(REFERENCE, name), content);
  writeFileSync(path.join(WS, "commands.json"), registry);
  return model;
}
// [SCOPE 141 / T005] END

// [SCOPE 141 / T014] BEGIN — Load sections, compose and stage one edition
function loadSections(): ManualSection[] {
  const files: string[] = [];
  for (const dir of [SECTIONS, REFERENCE]) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).sort()) if (f.endsWith(".md")) files.push(path.join(dir, f));
  }
  return files.map((f) => parseSection(readFileSync(f, "utf8"), path.relative(REPO, f).split(path.sep).join("/")));
}

function appRoutes(): Set<string> {
  const app = readFileSync(path.join(REPO, "src", "client", "App.tsx"), "utf8");
  const routes = new Set<string>(["api", "manual"]);
  for (const m of app.matchAll(/path="\/([A-Za-z0-9-]+)/g)) routes.add(m[1].toLowerCase());
  return routes;
}

interface StagedEdition {
  dir: string;
  order: string[];
  sections: ManualSection[];
}

function stageEdition(edition: Edition, all: ManualSection[], config: ManualConfig, model: CommandModel, outRoot: string): StagedEdition {
  const sections = composeEdition(all, edition);
  const byId = new Map(sections.map((s) => [s.meta.id ?? "", s]));
  const order = orderSections(config.parts, new Set(byId.keys()));
  const placed = new Set(order);
  const unplaced = sections.filter((s) => !placed.has(s.meta.id ?? ""));
  if (edition === "customer" && unplaced.length) {
    fail(`customer sections not placed in any part: ${unplaced.map((s) => s.meta.id).join(", ")}`);
  }
  const finalOrder = [...order, ...unplaced.map((s) => s.meta.id ?? "")];

  const problems: string[] = [];
  if (edition === "customer") {
    const live = new Set(model.entries.filter((e) => !e.excluded && e.kind !== "cockpit").map((e) => e.key.replace(/^cli:/, "").replace(/:/g, "")));
    const retired = new Map(model.entries.filter((e) => e.excluded).map((e) => [e.key.replace(/^cli:/, "").replace(/:/g, ""), e.excludedReason ?? ""]));
    const routes = appRoutes();
    for (const s of sections) {
      if (s.meta.generated) continue;
      for (const p of checkCommandMentions(s.file, s.body, live, retired, routes)) problems.push(`${p.file}:${p.line} names ${p.name} (${p.reason})`);
      if (/!\[[^\]]*\]\(/.test(s.body)) problems.push(`${s.file}: contains an image; tonight's Customer edition is text only`);
      for (const m of s.body.matchAll(/\]\(([a-z0-9-]+)\.md\)/g)) {
        // Part landing pages are synthesized below, so they count as present when listed in the order.
        if (!byId.has(m[1]) && !finalOrder.includes(m[1])) problems.push(`${s.file}: links to "${m[1]}", which is not in the Customer edition`);
      }
    }
  }
  if (problems.length) fail(`customer content check:\n  ${problems.join("\n  ")}`);

  const dir = path.join(outRoot, edition);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(path.join(dir, "sections"), { recursive: true });
  for (const s of sections) writeFileSync(path.join(dir, "sections", `${s.meta.id}.md`), s.body);
  for (const part of config.parts) {
    if (finalOrder.includes(`part-${part.id}`)) writeFileSync(path.join(dir, "sections", `part-${part.id}.md`), partPage(part, byId));
  }
  writeFileSync(path.join(dir, "config.json"), JSON.stringify({ product_name: config.product_name, theme: config.theme, section_order: finalOrder }, null, 2));
  return { dir, order: finalOrder, sections };
}
// [SCOPE 141 / T014] END

// [SCOPE 141 / T014] BEGIN — Build HTML and PDF for a staged edition, stamped with version and date
async function renderPdf(sourceHtml: string, out: string, footerLabel: string): Promise<void> {
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage();
    await page.goto(`file:///${sourceHtml.split(path.sep).join("/")}`, { waitUntil: "networkidle2", timeout: 120000 });
    await page.pdf({
      path: out, format: "Letter", printBackground: true, displayHeaderFooter: true,
      headerTemplate: "<div></div>",
      footerTemplate: `<div style="font-size:8px;width:100%;padding:0 12mm;color:#888;display:flex;justify-content:space-between;"><span>${footerLabel}</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`,
      margin: { top: "14mm", bottom: "16mm", left: "12mm", right: "12mm" },
    });
  } finally {
    await browser.close();
  }
}

async function buildEdition(staged: StagedEdition, edition: Edition, version: string, date: string): Promise<{ site: string; pdfSource: string; pdf: string }> {
  const py = process.platform === "win32" ? "python" : "python3";
  const run = spawnSync(py, [BUILD_DOCS, staged.dir, "--html", "--pdf"], { encoding: "utf8" });
  if (run.status !== 0) fail(`build_docs.py exited ${run.status}: ${run.stderr || run.stdout}`);
  if (/WARNING unresolved links/.test(run.stdout)) fail(`unresolved links in the ${edition} edition:\n${run.stdout}`);

  const label = edition === "customer" ? "" : " — Internal edition";
  const stamp = `wxKanban ${version} · built ${date}${label}`;
  const site = path.join(staged.dir, "site");
  for (const f of readdirSync(site)) {
    if (!f.endsWith(".html")) continue;
    const file = path.join(site, f);
    const html = readFileSync(file, "utf8")
      .replace(/wxKanban Help<\/a>/g, `wxKanban Manual${label}</a>`)
      .replace(/ — wxKanban Help<\/title>/g, ` — wxKanban Manual</title>`)
      .replace(/<h1>wxKanban Help<\/h1><p>Select a topic:<\/p>/, `<h1>wxKanban Manual${label}</h1><p>Start with Part 1, or pick a topic.</p>`)
      .replace("</main>", `<footer style="margin-top:3em;color:#57606a;font-size:.8rem;border-top:1px solid #d0d7de;padding-top:.6em">${stamp}</footer></main>`);
    writeFileSync(file, html);
  }

  const pdfSource = path.join(staged.dir, "_pdf_build.html");
  const builtByEngine = path.join(staged.dir, "wxKanban-User-Guide.pdf");
  const pdf = path.join(staged.dir, PDF_NAME);
  if (existsSync(pdfSource)) {
    const html = readFileSync(pdfSource, "utf8").replace("<br>User Guide</h1>", `<br>Manual${label}</h1>`).replace(/<p>\d{4}-\d{2}-\d{2}<\/p>/, `<p>${stamp}</p>`);
    writeFileSync(pdfSource, html);
    await renderPdf(pdfSource, pdf, `wxKanban Manual${label} · ${version}`);
  } else if (existsSync(builtByEngine)) {
    renameSync(builtByEngine, pdf);
  } else {
    fail(`no PDF was produced for the ${edition} edition`);
  }
  return { site, pdfSource, pdf };
}
// [SCOPE 141 / T014] END

// [SCOPE 141 / T008] BEGIN — Leak scan of the built Customer edition
function scanCustomer(site: string, pdfSource: string): LeakHit[] {
  const hits: LeakHit[] = [];
  for (const f of readdirSync(site).sort()) {
    if (f.endsWith(".html")) hits.push(...scanForLeaks(path.relative(REPO, path.join(site, f)), readFileSync(path.join(site, f), "utf8")));
  }
  // The PDF is printed from this exact HTML, so its text is the PDF's text.
  if (existsSync(pdfSource)) hits.push(...scanForLeaks(`${path.relative(REPO, pdfSource)} (PDF text)`, readFileSync(pdfSource, "utf8")));
  return hits;
}

function reportLeaks(hits: LeakHit[]): string {
  return hits.slice(0, 40).map((h) => `${h.file}:${h.line} [${h.rule}] ${h.excerpt}`).join("\n  ");
}
// [SCOPE 141 / T008] END

// [SCOPE 141 / T014] BEGIN — Main
async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  const selfTest = args.has("--self-test");
  const publish = !args.has("--no-publish") && !selfTest;
  const config = loadConfig();
  const version = appVersion();
  const date = new Date().toISOString().slice(0, 10);

  const model = generateReference();
  const all = loadSections();
  const idProblems = validateIds(all);
  if (idProblems.length) fail(`section ids:\n  ${idProblems.join("\n  ")}`);

  const outRoot = selfTest ? path.join(BUILD, "self-test") : BUILD;
  const internalReason = unsafeOutputReason(path.join(outRoot, "internal"), REPO);
  if (internalReason) fail(internalReason);

  if (selfTest) {
    // Plant a fake secret in a customer-tagged section; the build must refuse it.
    all.push(parseSection(["---", "id: planted-leak", "part: appendix", "audience: customer", "---", "# Planted leak", "", "The local .env sets DATABASE_URL=postgres://admin:hunter2@db.internal.example:5432/prod", ""].join("\n"), "self-test/planted-leak.md"));
    config.parts = config.parts.map((p) => (p.id === "appendix" ? { ...p, groups: [...p.groups, { title: "", sections: ["planted-leak"] }] } : p));
  }

  const customer = stageEdition("customer", all, config, model, outRoot);
  const builtCustomer = await buildEdition(customer, "customer", version, date);
  const hits = scanCustomer(builtCustomer.site, builtCustomer.pdfSource);
  if (selfTest) {
    if (hits.length === 0) fail("self-test: the planted leak was NOT caught");
    process.stdout.write(`Self-test passed: the planted leak was caught (${hits.length} hits), so a real build would fail.\n  ${reportLeaks(hits)}\n`);
    return;
  }
  if (hits.length) fail(`leak scan found ${hits.length} problem(s) in the Customer edition:\n  ${reportLeaks(hits)}`);

  const internal = stageEdition("internal", all, config, model, outRoot);
  const builtInternal = await buildEdition(internal, "internal", version, date);

  const shown = model.entries.filter((e) => !e.excluded).length;
  process.stdout.write(`\nCommand Reference: ${shown} commands documented, ${model.entries.length - shown} left out, ${model.drift.length} drift findings (Internal: Known drift).\n`);
  process.stdout.write(`Customer edition: ${customer.order.length} pages, PDF ${path.relative(REPO, builtCustomer.pdf)}; leak scan clean.\n`);
  process.stdout.write(`Internal edition: ${internal.order.length} pages, site ${path.relative(REPO, builtInternal.site)}\n`);

  if (publish) {
    rmSync(PUBLISH, { recursive: true, force: true });
    cpSync(builtCustomer.site, PUBLISH, { recursive: true });
    cpSync(builtCustomer.pdf, path.join(PUBLISH, PDF_NAME));
    process.stdout.write(`Published the Customer edition to ${path.relative(REPO, PUBLISH)}/\n`);
  }
}

main().catch((err: unknown) => fail(err instanceof Error ? err.stack ?? err.message : String(err)));
// [SCOPE 141 / T014] END
