#!/usr/bin/env tsx
/**
 * [SCOPE 043 fix] Re-stamp wxperts-team feedback origin to the wxKanban project.
 *
 * "My Feedback" is scoped by project (context.originProjectId), not user. The
 * wxperts team files kit/wxKanban bugs while dogfooding in OTHER repos, so those
 * rows were stamped with the consumer repo's projectId and never surfaced in the
 * wxKanban Cockpit. This sets originProjectId = the wxKanban project for every
 * @wxperts.com submitter's manual feedback. EXTERNAL customers are untouched —
 * their feedback keeps its own project origin.
 *
 * Idempotent. Env: DATABASE_URL. Pass --dry-run to report the affected set only.
 */
import { Client } from "pg";
import { config } from "dotenv";

config();

const WXKANBAN = "ba924193-0335-4080-9fa6-33cd6b81300a";

function clean(u: string): string {
  try {
    const p = new URL(u);
    p.searchParams.delete("sslmode");
    p.searchParams.delete("ssl");
    return p.toString();
  } catch {
    return u;
  }
}

async function main(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }
  const dryRun = process.argv.includes("--dry-run");
  const c = new Client({ connectionString: clean(dbUrl), ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    const affected = await c.query(
      `SELECT up.emailaddr AS email, count(*)::int AS n
       FROM feedbacksubmissions f JOIN userprofiles up ON up.id = f.userid
       WHERE lower(up.emailaddr) LIKE '%@wxperts.com' AND f.type IN ('bug','suggestion')
       GROUP BY up.emailaddr ORDER BY n DESC`,
    );
    console.log("wxperts-team manual feedback to re-stamp to wxKanban:");
    for (const r of affected.rows) console.log(`  ${r.email}: ${r.n}`);
    const total = affected.rows.reduce((s, r) => s + Number(r.n), 0);
    console.log(`  total: ${total}`);

    if (dryRun) {
      console.log("\n--dry-run — no changes.");
      return;
    }

    const res = await c.query(
      `UPDATE feedbacksubmissions f
         SET context = jsonb_set(coalesce(f.context, '{}'::jsonb), '{originProjectId}', to_jsonb($1::text), true),
             updatedat = now()
       FROM userprofiles up
       WHERE up.id = f.userid
         AND lower(up.emailaddr) LIKE '%@wxperts.com'
         AND f.type IN ('bug','suggestion')
       RETURNING f.id`,
      [WXKANBAN],
    );
    console.log(`\nRe-stamped ${res.rowCount} row(s) to originProjectId=${WXKANBAN}.`);
  } finally {
    await c.end();
  }
}

main().catch((e: Error) => {
  console.error(`restamp failed: ${e.message}`);
  process.exit(1);
});
