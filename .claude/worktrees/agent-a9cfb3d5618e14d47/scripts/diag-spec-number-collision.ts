#!/usr/bin/env tsx
/**
 * Read-only diagnostic for the SCOPE-129 spec-number collision.
 *
 * Establishes the actual blast radius before any repair is proposed:
 *   - which project each colliding spec row belongs to (a collision across projects is not one)
 *   - what my create_specs calls created versus matched-and-overwrote
 *   - the highest specnumber actually in use, per project
 *   - whether anything else points at the affected rows
 *
 * Writes nothing.
 */
import { Client } from "pg";
import { config } from "dotenv";

config();

// Updated 2026-09-20 after the Option A repair: ac79dae6 is SCOPE-127's adapter spec again and
// is NOT ours; the brand-capture spec moved to a new row numbered 130.
const MINE: Record<string, string> = {
  "c6678562-79f7-41c1-98d1-46de51ba5654": "126 Brand Schema Model and Storage",
  "8f5f4a0e-e5b0-4962-956e-eaab39aa2395": "128 Brand Execution and Artifact Generation",
  "359531c4-4968-497d-be83-96015db818fa": "129 wxBrand Entrance and Rule Enforcement",
  "01a0bf87-9937-71d6-9f4a-fb1402e28858": "130 Brand Document Capture and Ingest",
};

const WXKANBAN = "ba924193-0335-4080-9fa6-33cd6b81300a";

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
    console.log("=== 1. Colliding spec rows, WITH their project ===\n");
    const rows = await c.query(
      `select s.id, s.specnumber, s.title, s.projectid, s.createdat,
              p.name as projectname,
              (select count(*)::int from projecttasks t where t.specid = s.id) as taskcount
         from projectspecifications s
         left join companyprojects p on p.id = s.projectid
        where s.specnumber in ('126','127','128','129','130')
        order by s.specnumber, s.createdat`,
    );
    for (const r of rows.rows) {
      const mine = MINE[String(r.id)] ? "  <-- MINE" : "";
      const scope = String(r.projectid) === WXKANBAN ? "wxKanban" : `OTHER (${String(r.projectname ?? r.projectid).slice(0, 28)})`;
      console.log(
        `  #${r.specnumber}  ${String(r.id).slice(0, 8)}  ${String(r.createdat).slice(0, 10)}  ` +
          `${String(r.taskcount).padStart(3)} tasks  [${scope}]  ${String(r.title).slice(0, 44)}${mine}`,
      );
    }

    console.log("\n=== 2. Tasks under MY spec rows, split by when they were created ===\n");
    for (const [id, label] of Object.entries(MINE)) {
      const t = await c.query(
        `select case when createdat < '2026-09-15' then 'pre-existing' else 'mine (this session)' end as origin,
                count(*)::int as n, min(createdat) as first, max(createdat) as last
           from projecttasks where specid = $1 group by 1 order by 1`,
        [id],
      );
      console.log(`  ${label}`);
      if (t.rows.length === 0) console.log("      (no tasks)");
      for (const r of t.rows) {
        console.log(`      ${String(r.origin).padEnd(20)} ${String(r.n).padStart(3)}   ${String(r.first).slice(0, 10)} .. ${String(r.last).slice(0, 10)}`);
      }
    }

    console.log("\n=== 3. Pre-existing tasks now attached to my spec 127 ===\n");
    const orphans = await c.query(
      `select name, status from projecttasks
        where specid = 'ac79dae6-28e9-4ed2-a3bf-2ac0d199dada'
        order by name`,
    );
    for (const r of orphans.rows) console.log(`      [${String(r.status).padEnd(5)}] ${String(r.name).slice(0, 66)}`);

    console.log("\n=== 4. Highest specnumber in use, wxKanban project ===\n");
    const hi = await c.query(
      `select specnumber, title from projectspecifications
        where projectid = $1 and specnumber ~ '^[0-9]+$'
        order by specnumber::int desc limit 8`,
      [WXKANBAN],
    );
    for (const r of hi.rows) console.log(`      #${r.specnumber}  ${String(r.title).slice(0, 56)}`);

    console.log("\n=== 5. Documents pointing at the affected spec rows ===\n");
    for (const [id, label] of Object.entries(MINE)) {
      const d = await c.query(
        `select doctype, count(*)::int n from projectdocuments where specid = $1 group by doctype order by doctype`,
        [id],
      );
      const parts = d.rows.map((x) => `${x.doctype}=${x.n}`).join("  ") || "(none)";
      console.log(`      ${label.slice(0, 40).padEnd(42)} ${parts}`);
    }
  } finally {
    await c.end();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
