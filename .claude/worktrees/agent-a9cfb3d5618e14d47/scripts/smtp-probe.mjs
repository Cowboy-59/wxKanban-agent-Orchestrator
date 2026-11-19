import 'dotenv/config';
import nodemailer from 'nodemailer';

const host = process.env.SMTP_HOST;
const port = Number(process.env.SMTP_PORT ?? 587);
const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASS;
const from = process.env.SMTP_FROM;

console.log('--- parsed env ---');
console.log('SMTP_HOST:', JSON.stringify(host));
console.log('SMTP_PORT:', JSON.stringify(port));
console.log('SMTP_USER:', JSON.stringify(user));
console.log('SMTP_PASS length:', pass?.length, 'first/last char:', JSON.stringify(pass?.[0]), JSON.stringify(pass?.[pass.length - 1]));
console.log('SMTP_FROM:', JSON.stringify(from));

if (!host || !user || !pass) {
  console.error('missing required env');
  process.exit(2);
}

const tx = nodemailer.createTransport({
  host,
  port,
  secure: port === 465,
  auth: { user, pass },
});

try {
  await tx.verify();
  console.log('--- SMTP verify: OK ---');
} catch (e) {
  console.error('--- SMTP verify FAILED ---');
  console.error('code:', e.code, 'responseCode:', e.responseCode);
  console.error('response:', e.response);
  process.exit(1);
}
