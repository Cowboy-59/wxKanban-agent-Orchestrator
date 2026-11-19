/** Find which database on the DATABASE_URL server holds spec 058 (the hosted MCP's DB). */
import { Client } from 'pg';
import { config } from 'dotenv';
config();

function clean(u: string): string {
  try { const p = new URL(u); p.searchParams.delete('sslmode'); p.searchParams.delete('ssl'); return p.toString(); } catch { return u; }
}
function withDb(u: string, db: string): string {
  const p = new URL(clean(u)); p.pathname = '/' + db; return p.toString();
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL!;
  const admin = new Client({ connectionString: clean(url), ssl: { rejectUnauthorized: false } });
  await admin.connect();
  const dbs = await admin.query<{ datname: string }>(`SELECT datname FROM pg_database WHERE datistemplate=false ORDER BY datname`);
  await admin.end();
  console.log('databases:', dbs.rows.map((r) => r.datname).join(', '));

  for (const { datname } of dbs.rows) {
    const c = new Client({ connectionString: withDb(url, datname), ssl: { rejectUnauthorized: false } });
    try {
      await c.connect();
      const hasTable = await c.query(`SELECT 1 FROM information_schema.tables WHERE table_name='projectspecifications'`);
      if (hasTable.rowCount) {
        const spec = await c.query(`SELECT count(*)::int AS n FROM projectspecifications WHERE specnumber='058'`);
        const col = await c.query(`SELECT 1 FROM information_schema.columns WHERE table_name='projectspecifications' AND column_name='claimedbyid'`);
        console.log(`  ${datname}: spec058=${spec.rows[0].n} claimedbyid=${col.rowCount! > 0}`);
      } else {
        console.log(`  ${datname}: (no projectspecifications table)`);
      }
    } catch (e) {
      console.log(`  ${datname}: connect/err ${(e as Error).message.slice(0, 60)}`);
    } finally {
      await c.end().catch(() => undefined);
    }
  }
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
