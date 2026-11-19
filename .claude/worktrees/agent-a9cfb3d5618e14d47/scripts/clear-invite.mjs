import 'dotenv/config';
import pg from 'pg';

const email = process.argv[2];
if (!email) {
  console.error('usage: node scripts/clear-invite.mjs <email>');
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

const before = await client.query(
  `SELECT id, email, status, invitedat FROM userinvitations WHERE email = $1 ORDER BY invitedat DESC LIMIT 5`,
  [email]
);
console.log('--- before ---');
console.table(before.rows);

const del = await client.query(
  `DELETE FROM userinvitations WHERE email = $1 AND status = 'pending'`,
  [email]
);
console.log(`deleted ${del.rowCount} pending row(s)`);

const after = await client.query(
  `SELECT id, email, status, invitedat FROM userinvitations WHERE email = $1 ORDER BY invitedat DESC LIMIT 5`,
  [email]
);
console.log('--- after ---');
console.table(after.rows);

await client.end();
