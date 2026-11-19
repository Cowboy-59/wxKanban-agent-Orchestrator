#!/usr/bin/env tsx
/**
 * Spec 127 collision repair — STEP 2: execute. Option A.
 *
 * Runs inside ONE transaction that verifies its own result before committing. If any check
 * fails the whole thing rolls back and nothing changed.
 *
 *   1. insert SPEC-130 "Brand Document Capture and Ingest" (130 confirmed free)
 *   2. move my 10 tasks from the damaged row to it
 *   3. restore the damaged row to SCOPE-127's identity — title AND content
 *
 * Nothing is deleted. Task rows are re-pointed, never recreated, so ids and history survive.
 *
 *   npx tsx scripts/repair-spec127-step2-execute.ts [--commit]
 *
 * Without --commit it rolls back after reporting, so the whole repair can be rehearsed.
 */
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { config } from "dotenv";
import { v7 as uuidv7 } from "uuid";

config();

const DAMAGED = "ac79dae6-28e9-4ed2-a3bf-2ac0d199dada";
const WXKANBAN = "ba924193-0335-4080-9fa6-33cd6b81300a";
const CUTOFF = "2026-09-15";
const COMMIT = process.argv.includes("--commit");

const RESTORED_TITLE = "Test Pipeline Stack Adapters — Adapter Seam Across All Three Layers";

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }

  const newContent = readFileSync("specs/130-brand-document-capture-ingest/spec.md", "utf-8");
  const restoredContent = readFileSync(
    "specs/Project-Scope/127-test-pipeline-stack-adapters.md",
    "utf-8",
  );
  const newId = uuidv7();

  const c = new Client({
    connectionString: url.replace(/[?&]sslmode=[^&]*/, ""),
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  try {
    await c.query("BEGIN");

    // 1. the new home for the brand-capture spec
    await c.query(
      `insert into projectspecifications
         (id, projectid, specnumber, title, content, status, createdat, updatedat, specorder, isoptional)
       values ($1, $2, '130', $3, $4, 'planned', now(), now(), 0, false)`,
      [newId, WXKANBAN, "Brand Document Capture and Ingest", newContent],
    );

    // 2. move my tasks — the date is the discriminator, proven unambiguous in step 1
    const moved = await c.query(
      `update projecttasks set specid = $1, updatedat = now()
        where specid = $2 and createdat >= $3`,
      [newId, DAMAGED, CUTOFF],
    );

    // 3. restore the adapter spec's identity. `content` was overwritten too, not just the title,
    //    so the scope document on disk is the recovery source.
    await c.query(
      `update projectspecifications set title = $1, content = $2, updatedat = now() where id = $3`,
      [RESTORED_TITLE, restoredContent, DAMAGED],
    );

    // ---- verify INSIDE the transaction ----
    const left = await c.query(`select count(*)::int n from projecttasks where specid = $1`, [DAMAGED]);
    const arrived = await c.query(`select count(*)::int n from projecttasks where specid = $1`, [newId]);
    const adapterNamed = await c.query(
      `select count(*)::int n from projecttasks where specid = $1 and name like '[127-%'`,
      [DAMAGED],
    );
    const brandNamed = await c.query(
      `select count(*)::int n from projecttasks where specid = $1 and name not like '[127-%'`,
      [newId],
    );
    const dupes = await c.query(
      `select specnumber, count(*)::int n from projectspecifications
        where projectid = $1 group by specnumber having count(*) > 1`,
      [WXKANBAN],
    );

    const checks: [string, boolean, string][] = [
      ["tasks moved to 130", moved.rowCount === 10, `${moved.rowCount} (expected 10)`],
      ["tasks left on 127", left.rows[0].n === 19, `${left.rows[0].n} (expected 19)`],
      ["tasks now under 130", arrived.rows[0].n === 10, `${arrived.rows[0].n} (expected 10)`],
      ["all 127 tasks are adapter tasks", adapterNamed.rows[0].n === 19, `${adapterNamed.rows[0].n}/19`],
      ["all 130 tasks are brand tasks", brandNamed.rows[0].n === 10, `${brandNamed.rows[0].n}/10`],
      ["no duplicate spec numbers in wxKanban", dupes.rows.length === 0, `${dupes.rows.length} duplicate number(s)`],
    ];

    console.log(`\n=== verification (inside the transaction) ===\n`);
    let ok = true;
    for (const [label, pass, detail] of checks) {
      if (!pass) ok = false;
      console.log(`  ${pass ? "OK  " : "FAIL"}  ${label.padEnd(38)} ${detail}`);
    }

    if (!ok) {
      await c.query("ROLLBACK");
      console.log("\nROLLED BACK — a check failed, nothing changed.");
      process.exit(1);
    }

    if (COMMIT) {
      await c.query("COMMIT");
      console.log(`\nCOMMITTED. New spec 130 id: ${newId}`);
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
