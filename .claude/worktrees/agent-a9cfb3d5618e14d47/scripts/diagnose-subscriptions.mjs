// Read-only diagnostic for the "subscriptions cancelled / not on Stripe" issue.
//
// For each recent companysubscriptions row it:
//   1. prints the local DB state (status, plan, promo/trial, created/canceled),
//   2. attempts to retrieve the referenced subscription from Stripe using the
//      server's STRIPE_API_KEY, and reports:
//        - whether it exists in THIS Stripe mode/account (404 => mismatch),
//        - Stripe status, latest invoice status,
//        - PaymentIntent status + last_payment_error (why a charge failed),
//        - cancellation_details.reason (why Stripe canceled it),
//        - trial_end (trial-tier edge case).
//
// Nothing is written. Usage:
//   node scripts/diagnose-subscriptions.mjs [limit]
// Requires DATABASE_URL and STRIPE_API_KEY in .env (the same ones the server uses).

import 'dotenv/config';
import pg from 'pg';
import Stripe from 'stripe';

const limit = Number(process.argv[2] ?? 10);

const stripeKey = process.env.STRIPE_API_KEY;
if (!stripeKey) {
  console.error('STRIPE_API_KEY not set — cannot query Stripe. Aborting.');
  process.exit(2);
}
const mode = stripeKey.startsWith('sk_live_')
  ? 'LIVE'
  : stripeKey.startsWith('sk_test_')
    ? 'TEST'
    : 'UNKNOWN';
console.log(`\nServer Stripe key mode: ${mode}  (${stripeKey.slice(0, 8)}…)`);
console.log('If your DB rows are not found below, you are very likely viewing the OTHER mode in the Stripe dashboard.\n');

const stripe = new Stripe(stripeKey, { apiVersion: '2023-10-16' });

const url = new URL(process.env.DATABASE_URL);
url.searchParams.delete('sslmode');
url.searchParams.delete('ssl');
const client = new pg.Client({
  connectionString: url.toString(),
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const { rows } = await client.query(
  `SELECT s.id,
          s.stripesubscriptionid,
          s.stripecustomerid,
          s.planname,
          s.status,
          s.promotrialdays,
          s.createdat,
          s.canceledat,
          c.name AS companyname
     FROM companysubscriptions s
     LEFT JOIN companies c ON c.id = s.companyid
    ORDER BY s.createdat DESC
    LIMIT $1`,
  [limit],
);

console.log(`Found ${rows.length} companysubscriptions row(s) (most recent first):\n`);

for (const r of rows) {
  console.log('────────────────────────────────────────────────────────');
  console.log(`company       : ${r.companyname ?? '(unknown)'}`);
  console.log(`db status     : ${r.status}`);
  console.log(`plan          : ${r.planname}   promoTrialDays: ${r.promotrialdays ?? '—'}`);
  console.log(`created       : ${r.createdat?.toISOString?.() ?? r.createdat}`);
  console.log(`db canceledat : ${r.canceledat?.toISOString?.() ?? r.canceledat ?? '—'}`);
  console.log(`stripe sub id : ${r.stripesubscriptionid}`);
  console.log(`stripe cust id: ${r.stripecustomerid}`);

  try {
    const sub = await stripe.subscriptions.retrieve(r.stripesubscriptionid, {
      expand: ['latest_invoice.payment_intent'],
    });
    const inv = typeof sub.latest_invoice === 'object' ? sub.latest_invoice : null;
    const pi = inv && typeof inv.payment_intent === 'object' ? inv.payment_intent : null;
    console.log(`STRIPE        : FOUND ✓`);
    console.log(`  status              : ${sub.status}`);
    console.log(`  latest invoice      : ${inv ? `${inv.status} (${inv.id})` : '—'}`);
    console.log(`  payment intent      : ${pi ? pi.status : '—'}`);
    if (pi?.last_payment_error) {
      console.log(`  last_payment_error  : ${pi.last_payment_error.code} — ${pi.last_payment_error.message}`);
    }
    if (sub.cancellation_details?.reason) {
      console.log(`  cancellation reason : ${sub.cancellation_details.reason}`);
    }
    console.log(`  trial_end           : ${sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : '—'}`);
  } catch (err) {
    const code = err?.statusCode ?? err?.raw?.statusCode;
    if (code === 404) {
      console.log(`STRIPE        : NOT FOUND ✗  — this id does not exist in the ${mode} Stripe account/mode.`);
      console.log(`                => either created in the other mode, a different Stripe account, or a fabricated id.`);
    } else {
      console.log(`STRIPE        : ERROR querying — ${err?.message ?? err}`);
    }
  }
  console.log('');
}

await client.end();
console.log('Done (read-only — nothing was modified).');
