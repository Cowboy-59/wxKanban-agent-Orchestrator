// Remove an orphaned companysubscriptions row whose Stripe subscription exists
// in NEITHER live nor test (a seed/test-insert leftover or a dead account).
//
// Dry-run by default — prints exactly what WOULD be deleted and nothing else.
// Pass --apply to actually delete. Child rows in subscriptionbillingevents and
// subscriptionbillinghistory cascade automatically (onDelete: cascade), so this
// deletes only the one companysubscriptions row; the company itself is left
// untouched.
//
// Usage:
//   node scripts/cleanup-orphan-subscription.mjs <stripeSubscriptionId>            # dry run
//   node scripts/cleanup-orphan-subscription.mjs <stripeSubscriptionId> --apply    # delete
//
// Safety: it refuses to delete a row whose status is not 'incomplete'/'canceled'
// (won't touch an active/trialing subscription) unless you also pass --force.

import 'dotenv/config';
import pg from 'pg';

const subId = process.argv[2];
const apply = process.argv.includes('--apply');
const force = process.argv.includes('--force');

if (!subId || subId.startsWith('--')) {
  console.error('usage: node scripts/cleanup-orphan-subscription.mjs <stripeSubscriptionId> [--apply] [--force]');
  process.exit(2);
}

const url = new URL(process.env.DATABASE_URL);
url.searchParams.delete('sslmode');
url.searchParams.delete('ssl');
const client = new pg.Client({
  connectionString: url.toString(),
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const { rows } = await client.query(
  `SELECT s.id, s.stripesubscriptionid, s.stripecustomerid, s.planname, s.status,
          s.createdat, s.canceledat, s.companyid, c.name AS companyname
     FROM companysubscriptions s
     LEFT JOIN companies c ON c.id = s.companyid
    WHERE s.stripesubscriptionid = $1`,
  [subId],
);

if (rows.length === 0) {
  console.log(`No companysubscriptions row with stripesubscriptionid = ${subId}. Nothing to do.`);
  await client.end();
  process.exit(0);
}
if (rows.length > 1) {
  console.log(`WARNING: ${rows.length} rows match that stripesubscriptionid — refusing to act. Inspect manually.`);
  console.table(rows);
  await client.end();
  process.exit(1);
}

const row = rows[0];
const [{ rows: ev }, { rows: hist }] = await Promise.all([
  client.query(`SELECT count(*)::int AS n FROM subscriptionbillingevents WHERE companysubscriptionid = $1`, [row.id]),
  client.query(`SELECT count(*)::int AS n FROM subscriptionbillinghistory WHERE companysubscriptionid = $1`, [row.id]),
]);

console.log('\nTarget row:');
console.log(`  company        : ${row.companyname ?? '(unknown)'}  (companyid ${row.companyid})`);
console.log(`  plan / status  : ${row.planname} / ${row.status}`);
console.log(`  stripe sub id  : ${row.stripesubscriptionid}`);
console.log(`  stripe cust id : ${row.stripecustomerid}`);
console.log(`  created        : ${row.createdat?.toISOString?.() ?? row.createdat}`);
console.log(`  cascade deletes: ${ev[0].n} billing event(s), ${hist[0].n} history row(s)`);
console.log(`  NOTE: the company "${row.companyname}" is NOT deleted by this script.\n`);

const safeStatus = row.status === 'incomplete' || row.status === 'canceled';
if (!safeStatus && !force) {
  console.log(`REFUSING: status is "${row.status}" (not incomplete/canceled). Re-run with --force if you really mean it.`);
  await client.end();
  process.exit(1);
}

if (!apply) {
  console.log('DRY RUN — no changes made. Re-run with --apply to delete the row above (children cascade).');
  await client.end();
  process.exit(0);
}

await client.query('BEGIN');
try {
  const del = await client.query(`DELETE FROM companysubscriptions WHERE id = $1`, [row.id]);
  await client.query('COMMIT');
  console.log(`DELETED ${del.rowCount} companysubscriptions row (id ${row.id}); dependent billing rows cascaded.`);
} catch (err) {
  await client.query('ROLLBACK');
  console.error(`Delete failed, rolled back: ${err?.message ?? err}`);
  process.exitCode = 1;
}

await client.end();
