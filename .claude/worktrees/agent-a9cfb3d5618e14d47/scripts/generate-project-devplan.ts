#!/usr/bin/env tsx
/**
 * SCOPE-081 — Generate per-project Development Plan markdown + PDF, upsert to DB.
 * Exact mirror of generate-project-lifecycle.ts so the Development Plan is
 * generated + updated the same way as the Project Lifecycle.
 *
 * Usage:
 *   npx tsx scripts/generate-project-devplan.ts --project <projectid>
 *   npx tsx scripts/generate-project-devplan.ts --all
 */

import { db } from '../src/db/client.js';
import { companyprojects } from '../src/db/schema/companyproject.js';
import { DevelopmentPlanGenerator } from '../src/server/services/DevelopmentPlanGenerator.js';
import { MarkdownPdfRenderer } from '../src/server/services/MarkdownPdfRenderer.js';
import { ProjectDocumentService } from '../src/server/services/ProjectDocumentService.js';

const DEVPLAN_DOCTYPE = 'DevelopmentPlan';
const DEVPLAN_TITLE = 'Development Plan';

interface Args {
  project?: string;
  all: boolean;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const out: Args = { all: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--all') out.all = true;
    else if (a === '--project') out.project = argv[++i];
  }
  return out;
}

function usage(): never {
  console.log(`
Usage:
  npx tsx scripts/generate-project-devplan.ts --project <projectid>
  npx tsx scripts/generate-project-devplan.ts --all

Generates per-project Development Plan markdown at specs/projects/<id>/developmentplan.md,
renders it to PDF via Puppeteer, and upserts both into projectdocuments.
`);
  process.exit(1);
}

async function processOne(projectid: string, name: string): Promise<void> {
  const startedAt = Date.now();
  console.log(`→ ${projectid}  ${name}`);

  const result = await DevelopmentPlanGenerator.generate(projectid);
  const pdfBytes = await MarkdownPdfRenderer.renderToPdf(
    result.markdown,
    `${name} — Development Plan`
  );
  await ProjectDocumentService.upsertDocumentWithPdf(
    projectid,
    DEVPLAN_DOCTYPE,
    DEVPLAN_TITLE,
    result.markdown,
    pdfBytes,
    null
  );

  const ms = Date.now() - startedAt;
  console.log(
    `  ✓ specs=${result.specCount}  pdf=${pdfBytes.length}B  md=${result.outputPath}  (${ms}ms)`
  );
}

async function main(): Promise<void> {
  const args = parseArgs();
  if (!args.project && !args.all) usage();

  if (args.project) {
    const [row] = await db
      .select({ id: companyprojects.id, name: companyprojects.name })
      .from(companyprojects)
      .where(
        (await import('drizzle-orm')).eq(companyprojects.id, args.project)
      )
      .limit(1);
    if (!row) {
      console.error(`Project not found: ${args.project}`);
      process.exit(2);
    }
    await processOne(row.id, row.name);
    return;
  }

  // --all
  const rows = await db
    .select({ id: companyprojects.id, name: companyprojects.name })
    .from(companyprojects);

  console.log(`Backfilling ${rows.length} project(s)...`);
  let ok = 0;
  let fail = 0;
  for (const r of rows) {
    try {
      await processOne(r.id, r.name);
      ok++;
    } catch (err) {
      fail++;
      console.error(`  ✗ ${r.id} ${r.name}:`, err instanceof Error ? err.message : err);
    }
  }
  console.log(`\nDone. ok=${ok} fail=${fail} total=${rows.length}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal:', err);
    process.exit(1);
  });
