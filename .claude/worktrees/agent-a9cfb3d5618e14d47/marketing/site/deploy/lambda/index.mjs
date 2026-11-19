// wxKanban marketing launch-notify intake.
// API Gateway (HTTP API, POST /apply) -> this Lambda -> Postgres (marketingcontacts).
// SES email to NOTIFY_EMAIL is the safety net: a signup is NEVER lost just because
// the database is briefly unreachable — if the insert fails but the email sends, we
// still return ok and the lead lives in andy@wxperts.com's inbox.
//
// Requires env:
//   DATABASE_URL  postgres connection string (must end with ?sslmode=require for RDS)
//   NOTIFY_EMAIL  optional — SES verified address for notifications
// The Lambda must be able to REACH the database: either a publicly-resolvable RDS
// endpoint over TLS (non-VPC Lambda), or attach the Lambda to the DB's VPC/subnets.
import pg from "pg";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { randomUUID } from "crypto";
import { sendWelcomeEmail } from "./welcome-email.mjs";

const { Pool } = pg;
const ses = new SESClient({});
const NOTIFY = process.env.NOTIFY_EMAIL;

// Reused across warm invocations.
let pool;
function getPool() {
  if (!pool) {
    // Strip sslmode from the URL: newer `pg` treats sslmode=require as verify-full
    // (rejecting RDS's self-signed chain) AND lets it override the ssl object below.
    // We still encrypt — we just don't pin the chain. (Standard for RDS.)
    const connectionString = (process.env.DATABASE_URL || "")
      .replace(/([?&])sslmode=[^&]*/i, "$1")
      .replace(/[?&]$/, "");
    pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false }, // RDS forces TLS; chain not pinned here
      max: 2,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 5000,
    });
  }
  return pool;
}

const CORS = {
  "Access-Control-Allow-Origin": "https://windev.wxperts.com",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Content-Type": "application/json",
};

export const handler = async (event) => {
  const method = event.requestContext?.http?.method;
  if (method === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };

  try {
    let body = event.body || "{}";
    if (event.isBase64Encoded) body = Buffer.from(body, "base64").toString("utf8");
    const data = JSON.parse(body);

    const name = String(data.name || "").trim();
    const email = String(data.email || "").trim();
    if (!name || !email) {
      return { statusCode: 400, headers: CORS,
        body: JSON.stringify({ ok: false, error: "Name and email are required." }) };
    }

    const record = {
      id: randomUUID(),
      name: name.slice(0, 500),
      email: email.slice(0, 500),
      cell: String(data.cell || "").trim().slice(0, 100) || null,
      platform: String(data.platform || "").slice(0, 200),
      language: String(data.language || "").slice(0, 200),
      signuplist: String(data.list || "launch-notify").slice(0, 100),
      wantshandson: data.wantsHandsOn === true || String(data.wantsHandsOn || "").toLowerCase() === "yes",
      sourceip: event.requestContext?.http?.sourceIp || "",
      submittedat: new Date().toISOString(),
    };

    // 1) Persist to Postgres. The whole posted body goes into `payload` (jsonb) so new
    //    form fields are captured without a schema change.
    let stored = false;
    try {
      await getPool().query(
        `INSERT INTO marketingcontacts
           (id, name, email, cell, platform, language, signuplist, wantshandson, sourceip, payload, submittedat)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11)`,
        [record.id, record.name, record.email, record.cell, record.platform, record.language,
         record.signuplist, record.wantshandson, record.sourceip, JSON.stringify(data), record.submittedat]
      );
      stored = true;
    } catch (e) {
      console.error("Postgres insert failed (will rely on SES email):", e.message);
    }

    // 2) Notify by email (best-effort, but also the fallback capture if the DB failed).
    let emailed = false;
    if (NOTIFY) {
      try {
        const text =
          `name: ${record.name}\nemail: ${record.email}\ncell: ${record.cell || "—"}\n` +
          `platform: ${record.platform}\n` +
          `language: ${record.language}\nlist: ${record.signuplist}\n` +
          `wants hands-on: ${record.wantshandson ? "YES" : "no"}\n\n` +
          `stored in postgres: ${stored ? "yes" : "NO — DB write failed, this email IS the record"}\n` +
          `submitted: ${record.submittedat}\nip: ${record.sourceip}\nid: ${record.id}`;
        await ses.send(new SendEmailCommand({
          Source: NOTIFY,
          Destination: { ToAddresses: [NOTIFY] },
          ReplyToAddresses: [record.email],
          Message: {
            Subject: { Data: `wxKanban signup — ${record.name}${record.wantshandson ? " (hands-on)" : ""}` },
            Body: { Text: { Data: text } },
          },
        }));
        emailed = true;
      } catch (e) {
        console.error("SES send failed:", e.message);
      }
    }

    if (!stored && !emailed) {
      return { statusCode: 500, headers: CORS,
        body: JSON.stringify({ ok: false, error: "Something went wrong — please email andy@wxperts.com." }) };
    }

    // 3) Welcome the signup (best-effort — never fail the request on a send error).
    //    Requires SES production access to deliver to non-verified recipients; see
    //    welcome-email.mjs. Disable via WELCOME_ENABLED=false.
    await sendWelcomeEmail(ses, { to: record.email, name: record.name });

    return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true, id: record.id }) };
  } catch (e) {
    console.error(e);
    return { statusCode: 500, headers: CORS,
      body: JSON.stringify({ ok: false, error: "Something went wrong — please email andy@wxperts.com." }) };
  }
};
