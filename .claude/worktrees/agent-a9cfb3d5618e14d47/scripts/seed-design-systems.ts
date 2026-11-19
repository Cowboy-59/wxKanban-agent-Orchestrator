// SCOPE-114 / T009 — seed the global design-system catalog from the analysis pack.
//
//   npx tsx -r dotenv/config scripts/seed-design-systems.ts [--url <postgres url>] [--dry-run]
//
// Reads every folder under marketing/AIBM-Design-Systems-Pack, runs the full ingest pipeline
// (parse → map → contrast-repair → synthesize → assemble) and upserts one `designsystems` row
// per system, keyed on the curated slug.
//
// IDEMPOTENCY IS OBSERVABLE, not merely claimed. Rather than blindly UPDATE-ing all 50 rows on
// every run — which would bump `updatedat` and make "did anything actually change?"
// unanswerable — each row's ingested payload is digested and compared against what is already
// stored. Unchanged rows are left completely untouched, so a second consecutive run reports
// `0 inserted, 0 updated, 50 unchanged` and that number is real evidence rather than a promise.
//
// The pack is a DEV-ONLY input. After seeding, the database is the source of truth and no
// runtime code path reads these files — which is why this lives in scripts/ and nothing under
// src/server imports it.
//
// Uses pg.Client directly rather than Drizzle, matching scripts/apply-scope114-migrations.mjs:
// this is operator tooling that must run standalone, and the same TLS handling applies (pg
// 8.12+ reads `sslmode=require` as verify-full, which fails this server's self-signed chain).

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { Client } from "pg";
import { v7 as uuidv7 } from "uuid";
import {
  DESIGN_SYSTEM_CATALOG,
  catalogEntryForFolder,
  validateCatalogMap,
  type DesignSystemCatalogEntry,
} from "../src/shared/designsystemcatalog";
import { missingRequiredKeys, type DesignSystemTokens } from "../src/shared/design-system";
import { themePassesAA, type ProjectTheme } from "../src/shared/theme-tokens";
import {
  intendedFontFamily,
  parseDesignDocument,
  parseShowcase,
} from "../src/ingest/designsystems/parse";
import { detectNativeMode, resolveCanvas } from "../src/ingest/designsystems/color";
import {
  mapToTokenSet,
  radiusFromTokens,
  typographyFromTokens,
} from "../src/ingest/designsystems/map";
import {
  assembleTheme,
  repairContrast,
  synthesizeCounterpart,
} from "../src/ingest/designsystems/synthesize";
import { redactBrand, redactFontStack } from "../src/ingest/designsystems/redact";

const PACK_ROOT = "marketing/AIBM-Design-Systems-Pack";

/** One fully-ingested catalog row, ready to upsert. */
interface SeedRow {
  slug: string;
  name: string;
  description: string;
  sourcebrand: string;
  nativemode: string;
  tags: string[];
  tokens: DesignSystemTokens;
  theme: ProjectTheme;
  synthesizedmode: string;
  analysis: string;
  showcasehtml: string;
  fontstack: string;
  fontimporturl: string | null;
  sortorder: number;
  /** Not persisted — carried so the run report can explain what the pipeline had to do. */
  notes: string[];
  /**
   * Structured counters for the run report.
   *
   * Deliberately explicit rather than derived by grepping `notes` for phrases. An earlier
   * version counted occurrences of "fell back" and reported 8 synthesis fallbacks when the
   * true number was 0 — the mapper uses the same wording for its own fallback CHAINS, which
   * are routine and expected. A report that conflates "a colour key was absent so we used the
   * documented alternative" with "AA synthesis failed and we abandoned the system's palette"
   * is worse than no report, because both numbers look like the same kind of event.
   */
  stats: IngestStats;
}

/** Per-system counters, kept separate by cause so the report cannot mislead. */
export interface IngestStats {
  /** Colour keys absent from this system, resolved through a documented fallback chain. */
  mapperFallbacks: number;
  /** Tokens with no value at all, resolved to a hard default (in practice, `destructive`). */
  mapperDefaults: number;
  /** True when the declared ink could not clear AA on the canvas and was repaired. */
  foregroundRepaired: boolean;
  /** True when no declared ink worked and the foreground was forced to white or black. */
  foregroundForced: boolean;
  /** Foreground tokens nudged in the NATIVE set to clear AA. */
  nativeNudges: number;
  /** Foreground tokens nudged in the SYNTHESIZED set to clear AA. */
  synthesisNudges: number;
  /** True when synthesis abandoned this system's palette for the app default set. */
  synthesisFellBack: boolean;
}

/**
 * Run the full ingest pipeline for one pack folder.
 *
 * Throws on anything unexpected. A folder with no curated identity is an error rather than a
 * default, which is what forces a new pack addition to be named deliberately instead of
 * shipping with a brand name showing.
 */
// [SCOPE 115 / T009] BEGIN — Idempotent seed script (scripts/seed-design-systems.ts)
export function ingestSystem(
  packRoot: string,
  entry: DesignSystemCatalogEntry,
  sortorder: number,
): SeedRow {
  const dir = join(packRoot, entry.folder);
  const files = readdirSync(dir);
  const mdName = files.find((f) => /^DESIGN-.*\.md$/.test(f));
  const showcaseName = files.find((f) => /-showcase\.html$/.test(f));
  if (!mdName) throw new Error(`${entry.folder}: no DESIGN-*.md`);
  if (!showcaseName) throw new Error(`${entry.folder}: no *-showcase.html`);

  const doc = parseDesignDocument(readFileSync(join(dir, mdName), "utf8"), entry.folder);
  const showcaseHtml = readFileSync(join(dir, showcaseName), "utf8");
  const showcase = parseShowcase(showcaseHtml);

  const gaps = missingRequiredKeys(doc.tokens);
  if (gaps.length > 0) {
    throw new Error(`${entry.folder}: missing required tokens — ${gaps.join(", ")}`);
  }

  const canvasRaw = doc.tokens.colors["canvas"];
  if (!canvasRaw) throw new Error(`${entry.folder}: colors.canvas is required`);
  const canvas = resolveCanvas(canvasRaw, `${entry.folder}.colors.canvas`);
  const nativeMode = detectNativeMode(canvas);

  // The curated mode tag and the computed one must agree. They are derived independently —
  // one hand-authored, one measured — so a disagreement means either the tag is wrong or the
  // pack changed under us, and both deserve a hard stop rather than a quiet preference.
  if (entry.tags[0] !== nativeMode) {
    throw new Error(
      `${entry.folder}: curated mode tag "${String(entry.tags[0])}" disagrees with the ` +
        `computed canvas mode "${nativeMode}"`,
    );
  }

  const mapped = mapToTokenSet(doc.tokens, entry.folder);
  const nativeRepair = repairContrast(mapped.tokens);
  const synthesis = synthesizeCounterpart(nativeRepair.tokens, nativeMode);

  // Redact the originating brand from every field that reaches a client. Excluding the
  // `sourcebrand` COLUMN is not enough on its own — the pack's own description and analysis
  // prose name the product outright, and several font stacks carry a proprietary brand face.
  // Doing it here means the stored row is already safe for every consumer downstream.
  const rawFontStack = showcase.fontStack || intendedFontFamily(doc.tokens);
  const fontStack = redactFontStack(rawFontStack, entry.folder);
  const description = redactBrand(doc.description, entry.folder, entry.name);
  const analysis = redactBrand(doc.analysis, entry.folder, entry.name);
  // The showcase page names the product too — its <title> is literally "Design System Analysis
  // of <Brand>" — and it is served to the preview iframe, so it needs the same treatment.
  // Safe to run over markup here: redaction only rewrites the brand token itself, and no
  // curated folder name collides with an HTML tag, attribute or CSS identifier.
  const redactedShowcase = redactBrand(showcaseHtml, entry.folder, entry.name);
  const theme = assembleTheme(
    nativeRepair.tokens,
    synthesis.tokens,
    nativeMode,
    radiusFromTokens(doc.tokens),
    typographyFromTokens(doc.tokens, fontStack),
    entry.slug,
  );

  // Belt and braces: the pipeline already gates synthesis on AA, but the ASSEMBLED theme is
  // what actually ships, so it is checked in its final form too.
  if (!themePassesAA(theme)) {
    throw new Error(`${entry.folder}: assembled theme fails AA after repair and synthesis`);
  }

  return {
    slug: entry.slug,
    name: entry.name,
    description,
    // The folder name IS the originating brand. Stored for traceability, never rendered.
    sourcebrand: entry.folder,
    nativemode: nativeMode,
    tags: [...entry.tags],
    tokens: doc.tokens,
    theme,
    // The slot that was approximated is the one the system did NOT define.
    synthesizedmode: nativeMode === "dark" ? "light" : "dark",
    analysis,
    showcasehtml: redactedShowcase,
    fontstack: fontStack,
    fontimporturl: showcase.fontImportUrl,
    sortorder,
    notes: [...mapped.notes, ...nativeRepair.notes, ...synthesis.notes],
    stats: {
      mapperFallbacks: mapped.notes.filter((n) => n.includes("fell back to")).length,
      mapperDefaults: mapped.notes.filter((n) => n.endsWith(": defaulted")).length,
      foregroundRepaired: mapped.notes.some((n) => n.startsWith("foreground: repaired")),
      foregroundForced: mapped.notes.some((n) => n.includes("forced to")),
      nativeNudges: nativeRepair.notes.filter((n) => n.includes("nudged")).length,
      synthesisNudges: synthesis.notes.filter((n) => n.includes("nudged")).length,
      synthesisFellBack: synthesis.fellBack,
    },
  };
}
// [SCOPE 115 / T009] END

/**
 * Serialise a value with object keys sorted recursively.
 *
 * Required for the digest to mean anything. Three of the persisted columns are `jsonb`, and
 * Postgres does not store jsonb byte-for-byte — it parses, deduplicates and REORDERS object
 * keys (shortest first, then bytewise). So the object handed to INSERT and the object read
 * back describe the same data with different key order, and a plain `JSON.stringify`
 * comparison reports every row as changed on every run. That is exactly what happened: the
 * first implementation reported `updated 50, unchanged 0` forever, which looks like a working
 * upsert and is in fact a total failure of idempotency.
 *
 * Sorting keys on both sides makes the comparison structural rather than textual, which is
 * what "has the content changed?" actually means.
 */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

/**
 * A digest of everything this row persists.
 *
 * Deliberately excludes `id`, `createdat` and `updatedat` — they are bookkeeping, not content,
 * and including them would make every row look changed on every run and defeat the point.
 */
// [SCOPE 115 / T009] BEGIN — Idempotent seed script (scripts/seed-design-systems.ts)
export function rowDigest(row: {
  name: string;
  description: string;
  sourcebrand: string | null;
  nativemode: string;
  tags: unknown;
  tokens: unknown;
  theme: unknown;
  synthesizedmode: string;
  analysis: string;
  showcasehtml: string;
  fontstack: string;
  fontimporturl: string | null;
  sortorder: number;
}): string {
// [SCOPE 115 / T009] END
  const canonical = canonicalJson([
    row.name,
    row.description,
    row.sourcebrand,
    row.nativemode,
    row.tags,
    row.tokens,
    row.theme,
    row.synthesizedmode,
    row.analysis,
    row.showcasehtml,
    row.fontstack,
    row.fontimporturl,
    row.sortorder,
  ]);
  return createHash("sha256").update(canonical).digest("hex");
}

// [SCOPE 115 / T009] BEGIN — Idempotent seed script (scripts/seed-design-systems.ts)
async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const flag = (n: string): string | undefined => {
    const i = argv.indexOf(`--${n}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const dryRun = argv.includes("--dry-run");
  const packRoot = resolve(flag("pack") ?? PACK_ROOT);

  if (!existsSync(packRoot)) {
    console.error(`seed-design-systems: pack not found at ${packRoot}`);
    process.exit(1);
  }

  const mapProblems = validateCatalogMap();
  if (mapProblems.length > 0) {
    console.error("seed-design-systems: curated catalog map is invalid:");
    for (const p of mapProblems) console.error(`  ${p}`);
    process.exit(1);
  }

  // Every pack folder must have a curated identity, and vice versa. Checked before any DB
  // work so a mismatch costs nothing.
  const folders = readdirSync(packRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
  const unnamed = folders.filter((f) => !catalogEntryForFolder(f));
  const orphaned = DESIGN_SYSTEM_CATALOG.filter((e) => !folders.includes(e.folder));
  if (unnamed.length || orphaned.length) {
    console.error("seed-design-systems: pack and curated map disagree.");
    for (const f of unnamed) console.error(`  pack folder with no curated entry: ${f}`);
    for (const e of orphaned) console.error(`  curated entry with no pack folder: ${e.folder}`);
    process.exit(1);
  }

  console.log(`seed-design-systems: ${DESIGN_SYSTEM_CATALOG.length} systems from ${packRoot}`);

  // Ingest everything BEFORE touching the database, so a parse failure cannot leave the
  // catalog half-seeded.
  const rows: SeedRow[] = [];
  const failures: string[] = [];
  for (let i = 0; i < DESIGN_SYSTEM_CATALOG.length; i += 1) {
    const entry = DESIGN_SYSTEM_CATALOG[i];
    if (!entry) continue;
    try {
      rows.push(ingestSystem(packRoot, entry, i));
    } catch (err) {
      failures.push(`${entry.folder}: ${(err as Error).message}`);
    }
  }
  if (failures.length > 0) {
    console.error(`  ingest FAILED for ${failures.length} system(s) — nothing written:`);
    for (const f of failures) console.error(`    ${f}`);
    process.exit(1);
  }

  const count = (pick: (s: IngestStats) => boolean): number =>
    rows.filter((r) => pick(r.stats)).length;
  const sum = (pick: (s: IngestStats) => number): number =>
    rows.reduce((n, r) => n + pick(r.stats), 0);
  const dark = rows.filter((r) => r.nativemode === "dark").length;

  console.log(`  ingested ${rows.length}/${DESIGN_SYSTEM_CATALOG.length}`);
  console.log(`  native modes: ${dark} dark, ${rows.length - dark} light`);
  console.log(
    `  mapping: ${sum((s) => s.mapperFallbacks)} fallback-chain hits, ` +
      `${sum((s) => s.mapperDefaults)} hard defaults (expected: destructive, absent in 41 systems)`,
  );
  console.log(
    `  foreground: ${count((s) => s.foregroundRepaired)} repaired from an alternative ink, ` +
      `${count((s) => s.foregroundForced)} forced to plain white/black`,
  );
  console.log(
    `  AA nudges: ${sum((s) => s.nativeNudges)} on native sets (${count((s) => s.nativeNudges > 0)} systems), ` +
      `${sum((s) => s.synthesisNudges)} on synthesized sets`,
  );
  // The number that matters: how many systems lost their own palette entirely.
  const fellBack = count((s) => s.synthesisFellBack);
  console.log(`  synthesis abandoned the source palette: ${fellBack} system(s)`);
  if (fellBack > 0) {
    for (const r of rows.filter((x) => x.stats.synthesisFellBack)) {
      console.log(`    ${r.slug} (${r.nativemode}-native)`);
    }
  }
  const bytes = rows.reduce((n, r) => n + r.showcasehtml.length + r.analysis.length, 0);
  console.log(`  payload: ${(bytes / 1024 / 1024).toFixed(2)} MB of showcase + analysis text`);

  if (dryRun) {
    console.log("  --dry-run: nothing written.");
    return;
  }

  const url = flag("url") ?? process.env["DATABASE_URL"];
  if (!url) {
    console.error("seed-design-systems: no --url and no DATABASE_URL");
    process.exit(1);
  }
  const dbUrl = url.replace(/([?&])sslmode=[^&]*/g, "$1").replace(/[?&]$/, "");
  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const existing = await client.query<{
    slug: string;
    name: string;
    description: string;
    sourcebrand: string | null;
    nativemode: string;
    tags: unknown;
    tokens: unknown;
    theme: unknown;
    synthesizedmode: string;
    analysis: string;
    showcasehtml: string;
    fontstack: string;
    fontimporturl: string | null;
    sortorder: number;
  }>(
    `SELECT slug, name, description, sourcebrand, nativemode, tags, tokens, theme,
            synthesizedmode, analysis, showcasehtml, fontstack, fontimporturl, sortorder
       FROM designsystems`,
  );
  const before = new Map(existing.rows.map((r) => [r.slug, rowDigest(r)]));

  let inserted = 0;
  let updated = 0;
  let unchanged = 0;
  try {
    await client.query("BEGIN");
    for (const row of rows) {
      const digest = rowDigest(row);
      const prior = before.get(row.slug);
      if (prior === digest) {
        unchanged += 1;
        continue;
      }
      const values = [
        row.slug,
        row.name,
        row.description,
        row.sourcebrand,
        row.nativemode,
        JSON.stringify(row.tags),
        JSON.stringify(row.tokens),
        JSON.stringify(row.theme),
        row.synthesizedmode,
        row.analysis,
        row.showcasehtml,
        row.fontstack,
        row.fontimporturl,
        row.sortorder,
      ];
      if (prior === undefined) {
        await client.query(
          `INSERT INTO designsystems
             (id, slug, name, description, sourcebrand, nativemode, tags, tokens, theme,
              synthesizedmode, analysis, showcasehtml, fontstack, fontimporturl, sortorder)
           VALUES ($15, $1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9, $10, $11, $12, $13, $14)`,
          [...values, uuidv7()],
        );
        inserted += 1;
      } else {
        await client.query(
          `UPDATE designsystems SET
             name = $2, description = $3, sourcebrand = $4, nativemode = $5,
             tags = $6::jsonb, tokens = $7::jsonb, theme = $8::jsonb, synthesizedmode = $9,
             analysis = $10, showcasehtml = $11, fontstack = $12, fontimporturl = $13,
             sortorder = $14, updatedat = now()
           WHERE slug = $1`,
          values,
        );
        updated += 1;
      }
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("  FAILED — rolled back, catalog unchanged:", (err as Error).message);
    await client.end();
    process.exit(1);
  }

  const total = await client.query<{ n: number }>(
    "SELECT COUNT(*)::int AS n FROM designsystems",
  );
  console.log(`  inserted ${inserted}, updated ${updated}, unchanged ${unchanged}`);
  console.log(`  designsystems now holds ${total.rows[0]?.n ?? 0} rows`);
  await client.end();
}
// [SCOPE 115 / T009] END

void main();
