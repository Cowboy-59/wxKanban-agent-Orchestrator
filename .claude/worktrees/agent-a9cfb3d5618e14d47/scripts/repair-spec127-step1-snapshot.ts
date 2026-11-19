#!/usr/bin/env tsx
/**
 * Spec 127 collision repair — STEP 1: snapshot and dry-run. WRITES NOTHING.
 *
 * Captures the rollback source and proves every WHERE clause selects exactly what the plan says
 * before any UPDATE is considered. If a count here is not exactly as stated, the repair stops.
 *
 *   npx tsx scripts/repair-spec127-step1-snapshot.ts
 */
import { writeFileSync } from "node:fs";
import { Client } from "pg";
import { config } from "dotenv";

config();

const DAMAGED = "ac79dae6-28e9-4ed2-a3bf-2ac0d199dada";
const WXKANBAN = "ba924193-0335-4080-9fa6-33cd6b81300a";
const CUTOFF = "2026-09-15";
const SNAPSHOT = "docs/spec127-repair-snapshot.json";

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
    const spec = await c.query(`select * from projectspecifications where id = $1`, [DAMAGED]);
    const tasks = await c.query(
      `select id, name, status, specid, createdat from projecttasks where specid = $1 order by createdat, name`,
      [DAMAGED],
    );

    writeFileSync(
      SNAPSHOT,
      JSON.stringify(
        {
          takenAt: new Date().toISOString(),
          purpose: "Rollback source for the spec 127 collision repair (Option A).",
          specRow: spec.rows[0] ?? null,
          tasks: tasks.rows,
        },
        null,
        2,
      ),
      "utf-8",
    );
    console.log(`snapshot written: ${SNAPSHOT}  (1 spec row, ${tasks.rows.length} tasks)\n`);

    console.log("=== DRY RUN — each count must match the plan exactly ===\n");

    const mine = await c.query(
      `select count(*)::int n from projecttasks where specid = $1 and createdat >= $2`,
      [DAMAGED, CUTOFF],
    );
    const theirs = await c.query(
      `select count(*)::int n from projecttasks where specid = $1 and createdat < $2`,
      [DAMAGED, CUTOFF],
    );
    const okMine = mine.rows[0].n === 10;
    const okTheirs = theirs.rows[0].n === 19;

    console.log(`  tasks to MOVE to 130 (createdat >= ${CUTOFF}):  ${mine.rows[0].n}   expected 10   ${okMine ? "OK" : "MISMATCH"}`);
    console.log(`  tasks to LEAVE on 127 (createdat < ${CUTOFF}):  ${theirs.rows[0].n}   expected 19   ${okTheirs ? "OK" : "MISMATCH"}`);

    // Prove the discriminator is unambiguous: the two sets must not overlap in naming style.
    const misnamed = await c.query(
      `select count(*)::int n from projecttasks
        where specid = $1 and createdat >= $2 and name like '[127-%'`,
      [DAMAGED, CUTOFF],
    );
    const strays = await c.query(
      `select count(*)::int n from projecttasks
        where specid = $1 and createdat < $2 and name not like '[127-%'`,
      [DAMAGED, CUTOFF],
    );
    console.log(`\n  cross-check — adapter-named tasks in the MOVE set:   ${misnamed.rows[0].n}   expected 0   ${misnamed.rows[0].n === 0 ? "OK" : "MISMATCH"}`);
    console.log(`  cross-check — brand-named tasks in the LEAVE set:    ${strays.rows[0].n}   expected 0   ${strays.rows[0].n === 0 ? "OK" : "MISMATCH"}`);

    const free = await c.query(
      `select count(*)::int n from projectspecifications where projectid = $1 and specnumber = '130'`,
      [WXKANBAN],
    );
    console.log(`\n  spec 130 already in use in wxKanban:                ${free.rows[0].n}   expected 0   ${free.rows[0].n === 0 ? "OK" : "MISMATCH"}`);

    const allOk =
      okMine && okTheirs && misnamed.rows[0].n === 0 && strays.rows[0].n === 0 && free.rows[0].n === 0;
    console.log(`\n${allOk ? "ALL CHECKS PASS — step 2 may proceed" : "STOP — a count does not match the plan"}`);

    // Can this credential even perform the DML? Tested in a transaction that is always rolled back.
    console.log("\n=== PRIVILEGE PROBE (rolled back, changes nothing) ===\n");
    await c.query("BEGIN");
    try {
      await c.query(`update projectspecifications set title = title where id = $1`, [DAMAGED]);
      await c.query(`update projecttasks set specid = specid where specid = $1`, [DAMAGED]);
      console.log("  UPDATE on projectspecifications: permitted");
      console.log("  UPDATE on projecttasks:          permitted");
    } catch (err) {
      console.log("  DENIED —", err instanceof Error ? err.message : err);
    } finally {
      await c.query("ROLLBACK");
      console.log("  rolled back");
    }
  } finally {
    await c.end();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
