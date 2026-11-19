// wxKanban landing-page analytics beacon.
// API Gateway (POST /pageview) -> this Lambda -> DynamoDB wxkanban-pageviews.
// No cookies, no third party. Never breaks the page (always returns 204).
import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import { randomUUID } from "crypto";

const ddb = new DynamoDBClient({});
const TABLE = process.env.TABLE;

const CORS = {
  "Access-Control-Allow-Origin": "https://windev.wxperts.com",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Content-Type": "application/json",
};

export const handler = async (event) => {
  if (event.requestContext?.http?.method === "OPTIONS")
    return { statusCode: 204, headers: CORS, body: "" };

  try {
    let body = event.body || "{}";
    if (event.isBase64Encoded) body = Buffer.from(body, "base64").toString("utf8");
    const d = JSON.parse(body || "{}");
    const now = new Date();

    const item = {
      id: randomUUID(),
      ts: now.toISOString(),
      day: now.toISOString().slice(0, 10),
      path: String(d.path || "").slice(0, 300),
      referrer: String(d.referrer || "").slice(0, 500),
      ua: String(event.requestContext?.http?.userAgent || "").slice(0, 400),
      lang: String(d.lang || "").slice(0, 40),
      screen: String(d.screen || "").slice(0, 20),
      // Campaign attribution: set when a tagged email link is clicked
      // (e.g. ?c=cust844&u=<marketingcontacts.id>). Empty for organic visits.
      campaign: String(d.campaign || "").slice(0, 60),
      uid: String(d.uid || "").slice(0, 80),
    };

    await ddb.send(new PutItemCommand({
      TableName: TABLE,
      Item: marshall(item, { removeUndefinedValues: true }),
    }));
  } catch (e) {
    console.error("pageview error (ignored):", e.message);
  }
  // Always succeed — analytics must never break the page.
  return { statusCode: 204, headers: CORS, body: "" };
};
