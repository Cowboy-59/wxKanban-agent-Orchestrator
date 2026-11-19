#!/usr/bin/env node
/**
 * wxKanban MCP — local stdio bridge (corporate-network fallback).
 *
 * WHY: In locked-down corporate networks (e.g. Cisco Secure Access TLS-inspection
 * proxies), the hosted MCP's long-lived SSE stream (/sse) is buffered/blocked, so
 * Claude Code can't connect. Short request/response calls (/health, /call, /tools)
 * pass the proxy fine. This bridge speaks the MCP protocol to Claude Code over
 * STDIO (zero network on the editor side) and reaches the hosted MCP only via those
 * proven request/response endpoints. It therefore works wherever `/health` returns
 * 200 — no SSE, no streaming, no new transport negotiation, no IT changes.
 *
 * Transport map:
 *   initialize          -> answered locally (advertise tools capability)
 *   tools/list          -> GET  {base}/tools
 *   tools/call          -> POST {base}/call  { tool, args }
 *   ping                -> {}
 *   prompts/list        -> { prompts: [] }   (tools are the surface Claude Code uses)
 *   resources/list      -> { resources: [] }
 *
 * Config (env first, then files):
 *   WXKANBAN_MCP_BASE_URL  (default https://mcp.wxperts.com; else .wxai/project.json kit.mcpBaseUrl)
 *   WXKANBAN_API_TOKEN     (else .env WXKANBAN_API_TOKEN)
 *
 * Protocol framing: MCP stdio = newline-delimited JSON-RPC. stdout carries ONLY
 * JSON-RPC messages; all diagnostics go to stderr (anything else corrupts the stream).
 */

import tls from "node:tls";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// --- Corporate-CA trust (mirrors the kit's system-ca bootstrap) ---------------
// On Node 22.15+/24+, merge the OS trust store into Node's defaults so TLS-inspection
// proxy certs (whose root lives in the OS store) are trusted. NODE_EXTRA_CA_CERTS,
// if set, is still honored by Node globally on every version.
try {
  if (
    typeof tls.setDefaultCACertificates === "function" &&
    typeof tls.getCACertificates === "function"
  ) {
    const bundled = tls.getCACertificates("bundled");
    const system = tls.getCACertificates("system");
    tls.setDefaultCACertificates([...new Set([...bundled, ...system])]);
  }
} catch {
  /* best-effort; fall back to NODE_EXTRA_CA_CERTS / bundled roots */
}

// --- Config resolution --------------------------------------------------------
function readJsonSafe(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function readDotEnvValue(key) {
  try {
    const envPath = join(process.cwd(), ".env");
    if (!existsSync(envPath)) return null;
    for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m && m[1] === key) return m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* ignore */
  }
  return null;
}

function resolveBaseUrl() {
  const env = process.env.WXKANBAN_MCP_BASE_URL || process.env.MCP_BASE_URL;
  if (env) return env.replace(/\/+$/, "");
  const proj = readJsonSafe(join(process.cwd(), ".wxai", "project.json"));
  const fromFile = proj?.kit?.mcpBaseUrl;
  return (fromFile || "https://mcp.wxperts.com").replace(/\/+$/, "");
}

function resolveToken() {
  return process.env.WXKANBAN_API_TOKEN || readDotEnvValue("WXKANBAN_API_TOKEN") || null;
}

const BASE_URL = resolveBaseUrl();
const TOKEN = resolveToken();
const SERVER_INFO = { name: "wxkanban-mcp-bridge", version: "1.0.0" };

function log(...args) {
  // stderr only — never pollute the JSON-RPC stdout stream.
  process.stderr.write(`[wxkanban-bridge] ${args.join(" ")}\n`);
}

function authHeaders(extra = {}) {
  const h = { "Content-Type": "application/json", ...extra };
  if (TOKEN) h["Authorization"] = `Bearer ${TOKEN}`;
  return h;
}

// --- HTTP calls to the hosted MCP (request/response only) ---------------------
async function httpGetTools() {
  const res = await fetch(`${BASE_URL}/tools`, { method: "GET", headers: authHeaders() });
  if (!res.ok) throw new Error(`GET /tools -> ${res.status} ${await res.text().catch(() => "")}`);
  return res.json();
}

async function httpCall(tool, args) {
  const res = await fetch(`${BASE_URL}/call`, {
    method: "POST",
    headers: authHeaders({ Connection: "close" }),
    body: JSON.stringify({ tool, args: args || {} }),
  });
  // A 422 (preflight-blocked) still carries a valid CallToolResult body — pass it through.
  if (!res.ok && res.status !== 422) {
    throw new Error(`POST /call ${tool} -> ${res.status} ${await res.text().catch(() => "")}`);
  }
  return res.json();
}

// --- JSON-RPC plumbing --------------------------------------------------------
function send(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

function reply(id, result) {
  send({ jsonrpc: "2.0", id, result });
}

function replyError(id, code, message) {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

async function handleMessage(msg) {
  // Notifications (no id) require no response.
  const { id, method, params } = msg ?? {};
  const isNotification = id === undefined || id === null;

  try {
    switch (method) {
      case "initialize":
        reply(id, {
          protocolVersion: params?.protocolVersion || "2024-11-05",
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
        });
        return;

      case "notifications/initialized":
      case "initialized":
        return; // notification

      case "ping":
        if (!isNotification) reply(id, {});
        return;

      case "tools/list": {
        const result = await httpGetTools();
        reply(id, result); // { tools: [...] }
        return;
      }

      case "tools/call": {
        const result = await httpCall(params?.name, params?.arguments);
        reply(id, result); // CallToolResult { content: [...] }
        return;
      }

      case "prompts/list":
        if (!isNotification) reply(id, { prompts: [] });
        return;

      case "resources/list":
        if (!isNotification) reply(id, { resources: [] });
        return;

      default:
        if (!isNotification) replyError(id, -32601, `Method not found: ${method}`);
        return;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`error handling ${method}:`, message);
    if (!isNotification) replyError(id, -32603, message);
  }
}

// --- Startup self-check + stdin loop ------------------------------------------
async function selfCheck() {
  if (!TOKEN) {
    log("WARNING: no WXKANBAN_API_TOKEN found (env or .env). Tool calls will fail with 401.");
  }
  try {
    const res = await fetch(`${BASE_URL}/health`, { method: "GET" });
    if (res.ok) log(`connected: ${BASE_URL}/health -> ${res.status}`);
    else log(`WARNING: ${BASE_URL}/health -> ${res.status} (server reachable but unhealthy?)`);
  } catch (err) {
    log(`WARNING: cannot reach ${BASE_URL}/health (${err instanceof Error ? err.message : err}). ` +
        `If behind a corporate proxy, ensure NODE_EXTRA_CA_CERTS points at the proxy root CA.`);
  }
}

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let nl;
  while ((nl = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, nl).trim();
    buffer = buffer.slice(nl + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      log("dropping non-JSON line");
      continue;
    }
    // Handle (a single message, or a JSON-RPC batch array) without blocking the loop.
    if (Array.isArray(msg)) {
      for (const m of msg) void handleMessage(m);
    } else {
      void handleMessage(msg);
    }
  }
});
process.stdin.on("end", () => process.exit(0));

log(`starting — base=${BASE_URL}`);
void selfCheck();
