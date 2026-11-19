/** Diagnostic: does the local DATABASE_URL DB have the claim columns AND spec 058? */
import { Client } from 'pg';
import { config } from 'dotenv';
config();

function clean(u: string): string {
  try { const p = new URL(u); p.searchParams.delete('sslmode'); p.searchParams.delete('ssl'); return p.toString(); } catch { return u; }
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL!;
  const host = new URL(url).host;
  const client = new Client({ connectionString: clean(url), ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const col = await client.query(`SELECT 1 FROM information_schema.columns WHERE table_name='projectspecifications' AND column_name='claimedbyid'`);
    const spec = await client.query(`SELECT id, specnumber, title FROM projectspecifications WHERE specnumber='058'`);
    console.log(`host: ${host}`);
    console.log(`claimedbyid column present: ${col.rowCount! > 0}`);
    console.log(`spec 058 rows: ${spec.rowCount}`, spec.rows.map((r) => r.id).join(', '));
  } finally {
    await client.end();
  }
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
