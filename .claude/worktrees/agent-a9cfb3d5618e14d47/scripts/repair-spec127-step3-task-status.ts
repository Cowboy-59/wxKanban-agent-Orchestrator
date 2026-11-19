#!/usr/bin/env tsx
/**
 * Spec 127 collision repair — STEP 3: sync task status to the database.
 *
 * `implement` marks a task done in tasks.md but not in the database row, and several tasks could
 * not go through `implement` at all — modify-heavy route edits (its MODIFY path corrupts UTF-8)
 * and every test file (the fencer rejects files with no top-level declaration). The result is a
 * database that understates completion while the files are correct.
 *
 * This reads the FILES as the source of truth and syncs the rows to match, task by task, by name.
 * It never marks a task done that the file does not.
 *
 *   npx tsx scripts/repair-spec127-step3-task-status.ts [--commit]
 */
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { config } from "dotenv";

config();

const COMMIT = process.argv.includes("--commit");

const SPECS: { specId: string; folder: string; label: string }[] = [
  { specId: "c6678562-79f7-41c1-98d1-46de51ba5654", folder: "specs/126-brand-schema-model-storage", label: "126" },
  { specId: "8f5f4a0e-e5b0-4962-956e-eaab39aa2395", folder: "specs/128-brand-execution-artifact-generation", label: "128" },
  { specId: "359531c4-4968-497d-be83-96015db818fa", folder: "specs/129-wxbrand-entrance-rule-enforcement", label: "129" },
  { specId: "01a0bf87-9937-71d6-9f4a-fb1402e28858", folder: "specs/130-brand-document-capture-ingest", label: "130" },
];

/** Task ids the file marks done, read from the machine-readable table. */
function doneTaskIds(folder: string): string[] {
  const md = readFileSync(`${folder}/tasks.md`, "utf-8");
  const ids: string[] = [];
  for (const line of md.split(/\r?\n/)) {
    const m = /^\|\s*\d+\s*\|\s*(T\d+):[^|]*\|[^|]*\|\s*done\s*\|/.exec(line);
    if (m) ids.push(String(m[1]));
  }
  return ids;
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }
  const c = new Client({
    connectionString: url.replace(/[?&]sslmode=[^&]*/, ""),
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  try {
    await c.query("BEGIN");
    let total = 0;

    for (const s of SPECS) {
      const ids = doneTaskIds(s.folder);
      const rows = await c.query(`select id, name, status from projecttasks where specid = $1`, [s.specId]);

      let updated = 0;
      for (const id of ids) {
        // Match the row whose name carries this task id, in either shape the generator has used.
        const match = rows.rows.find(
          (r) => String(r.name).startsWith(`${id} —`) || String(r.name).startsWith(`${id}:`),
        );
        if (!match) {
          console.log(`  ${s.label}  WARN  ${id} marked done in the file but no matching row`);
          continue;
        }
        if (match.status === "done") continue;
        await c.query(`update projecttasks set status = 'done', updatedat = now() where id = $1`, [match.id]);
        updated += 1;
      }
      total += updated;
      console.log(`  ${s.label}  file says done: ${String(ids.length).padStart(2)}   rows updated: ${updated}`);
    }

    const remaining = await c.query(
      `select count(*)::int n from projecttasks where specid = any($1::uuid[]) and status <> 'done'`,
      [SPECS.map((s) => s.specId)],
    );
    console.log(`\n  total rows updated: ${total}`);
    console.log(`  tasks still not done across the four specs: ${remaining.rows[0].n} (expected 0)`);

    if (remaining.rows[0].n !== 0) {
      await c.query("ROLLBACK");
      console.log("\nROLLED BACK — some tasks would have been left unsynced.");
      process.exit(1);
    }

    if (COMMIT) {
      await c.query("COMMIT");
      console.log("\nCOMMITTED.");
    } else {
      await c.query("ROLLBACK");
      console.log("\nrehearsal only — rolled back. Re-run with --commit to apply.");
    }
  } catch (err) {
    await c.query("ROLLBACK").catch(() => undefined);
    console.error("ROLLED BACK —", err instanceof Error ? err.message : err);
    process.exit(1);
  } finally {
    await c.end();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
