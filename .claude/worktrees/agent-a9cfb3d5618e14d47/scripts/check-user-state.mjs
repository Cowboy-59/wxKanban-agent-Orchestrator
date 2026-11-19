import 'dotenv/config';
import pg from 'pg';

const email = process.argv[2];
if (!email) {
  console.error('usage: node scripts/check-user-state.mjs <email>');
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

console.log('--- userprofiles (all rows for this email, all companies) ---');
const users = await client.query(
  `SELECT u.id, u.emailaddr, u.fullname, u.usertype, u.companyid, c.name AS companyname, c.billingplan, u.active, u.joinedat
   FROM userprofiles u
   LEFT JOIN companies c ON c.id = u.companyid
   WHERE u.emailaddr = $1
   ORDER BY u.joinedat DESC NULLS LAST`,
  [email]
);
console.table(users.rows);

console.log('--- userinvitations (all statuses) ---');
const invs = await client.query(
  `SELECT i.id, i.email, i.status, i.usertype, i.companyid, c.name AS companyname, c.billingplan, i.invitedat, i.acceptedat
   FROM userinvitations i
   LEFT JOIN companies c ON c.id = i.companyid
   WHERE i.email = $1
   ORDER BY i.invitedat DESC`,
  [email]
);
console.table(invs.rows);

await client.end();
