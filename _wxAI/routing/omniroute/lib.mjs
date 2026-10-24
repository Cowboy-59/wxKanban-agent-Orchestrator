// Shared helpers for the OmniRoute local-service scripts (SPEC-143, FR-008). Plain Node ESM, no dependencies.
// OmniRoute (MIT) is a SEPARATE service: nothing from it is bundled, imported or copied here.
// Every setting name below is cited to the read-only checkout at E:\AI_Development\OmniRoute (v3.8.53).
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve, sep } from "node:path";

export const VERSION = "3.8.53"; // package.json:3 of the checkout. Pinned, never :latest.
export const PORT = 20128; // README.md:1050
export const HOST = "127.0.0.1";
export const CONTAINER = "wxai-omniroute";
export const VOLUME = "wxai-omniroute-data";
export const IMAGE = process.env.OMNIROUTE_IMAGE || `diegosouzapw/omniroute:${VERSION}`; // README.md:1092
export const NPM_SPEC = `omniroute@${VERSION}`;
// README.md:1034 - npm 11+ blocks lifecycle scripts unless allowed.
export const NPM_ALLOW_SCRIPTS = "omniroute,keytar,onnxruntime-node,@parcel/watcher,@swc/core,protobufjs,esbuild";
export const NODE_RANGE = ">=22.22.2 <23 || >=24.0.0 <27"; // package.json:73

// Environment that keeps the four features OFF and the gateway private. Written to ~/.wxai/omniroute.env.
// Each is already the documented default; we pin them so a later default change cannot switch one on.
export const SAFE_ENV = Object.freeze({
  ENABLE_TLS_FINGERPRINT: "false", // docs/reference/ENVIRONMENT.md:421, docs/reference/FEATURE_FLAGS.md:71 (stealth, TLS)
  CLI_COMPAT_ALL: "0", // docs/security/STEALTH_GUIDE.md:261-273 (client fingerprint); open-sse/config/cliFingerprints.ts:406-407 reads only "1"/"true"
  REQUIRE_API_KEY: "true", // docs/reference/ENVIRONMENT.md:229 (every /v1 call needs a key)
  OMNIROUTE_SERVER_HOST: HOST, // docs/reference/ENVIRONMENT.md:194 (npm/serve bind address)
  API_HOST: HOST, // docs/reference/ENVIRONMENT.md:166
  HOST: HOST, // docs/reference/ENVIRONMENT.md:192
  PORT: String(PORT), // docs/reference/ENVIRONMENT.md:160
});
// Env names whose value must NOT be on. CLI_COMPAT_<X>=1 per provider is documented at STEALTH_GUIDE.md:263-272.
export const CLI_COMPAT_KEYS = [
  "CODEX", "CLAUDE", "GITHUB", "ANTIGRAVITY", "KIRO", "CURSOR", "KIMI_CODING", "KILOCODE", "CLINE", "ALL",
];

export const isOn = (v) => ["1", "true", "yes", "on"].includes(String(v ?? "").trim().toLowerCase());

export function paths(home = homedir()) {
  const dir = join(home, ".wxai");
  return {
    dir,
    keyFile: join(dir, "omniroute.key"), // generated dashboard/admin password (never printed)
    envFile: join(dir, "omniroute.env"), // container / process environment (secrets + SAFE_ENV)
    tokenFile: join(dir, "omniroute.token"), // scoped inference token the owner creates in the dashboard
  };
}

export function parseEnv(text) {
  const out = {};
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

export function readEnvFile(file) {
  try {
    return parseEnv(readFileSync(file, "utf-8"));
  } catch {
    return null;
  }
}

export function readTokenFile(file) {
  try {
    const t = readFileSync(file, "utf-8").trim();
    return t || null;
  } catch {
    return null;
  }
}

export function insideDir(child, parent) {
  const c = resolve(child);
  const p = resolve(parent);
  return c === p || c.startsWith(p.endsWith(sep) ? p : p + sep);
}

// Which install methods are possible on this machine. Pure given the probe results.
export function chooseMethod({ requested, hasDocker, hasNpm }) {
  if (requested === "docker") return hasDocker ? "docker" : null;
  if (requested === "npm") return hasNpm ? "npm" : null;
  if (hasDocker) return "docker";
  if (hasNpm) return "npm";
  return null;
}

// The exact commands. Docker publishes to 127.0.0.1 only (README.md:1092-1093).
export function planCommands({ method, home = homedir(), image = IMAGE } = {}) {
  const p = paths(home);
  if (method === "npm") {
    return {
      ...p,
      method,
      steps: [
        { label: "install", cmd: ["npm", "install", "-g", `--allow-scripts=${NPM_ALLOW_SCRIPTS}`, NPM_SPEC] },
      ],
      start: ["omniroute", "--no-open"], // serve is the default command: bin/cli/commands/serve.mjs:84,87
    };
  }
  return {
    ...p,
    method: "docker",
    steps: [
      { label: "pull", cmd: ["docker", "pull", image] },
      {
        label: "create",
        cmd: [
          "docker", "create", "--name", CONTAINER, "--restart", "unless-stopped", "--stop-timeout", "40",
          "-p", `${HOST}:${PORT}:${PORT}`, "--env-file", p.envFile, "-v", `${VOLUME}:/app/data`, image,
        ],
      },
    ],
    start: ["docker", "start", CONTAINER],
  };
}

export function buildEnvText({ jwtSecret, apiKeySecret, password }) {
  const lines = [
    "# Written by _wxAI/routing/omniroute/install.mjs. Keep out of every repository.",
    `JWT_SECRET=${jwtSecret}`, // docs/reference/ENVIRONMENT.md:58
    `API_KEY_SECRET=${apiKeySecret}`, // docs/reference/ENVIRONMENT.md:59
    `INITIAL_PASSWORD=${password}`, // docs/reference/ENVIRONMENT.md:60
  ];
  for (const [k, v] of Object.entries(SAFE_ENV)) lines.push(`${k}=${v}`);
  return lines.join("\n") + "\n";
}

// ---- status ---------------------------------------------------------------------------------------------

// /healthz is anonymous and returns 200 "ok" when ready (src/app/healthz/route.ts:5-23).
export async function ping({ url = `http://${HOST}:${PORT}`, timeoutMs = 3000 } = {}) {
  const t0 = Date.now();
  try {
    const res = await fetch(`${url}/healthz`, { signal: AbortSignal.timeout(timeoutMs) });
    const ms = Date.now() - t0;
    return res.status === 200 ? { up: true, ms } : { up: false, ms, error: `HTTP ${res.status}` };
  } catch (e) {
    return { up: false, ms: Date.now() - t0, error: e instanceof Error ? e.message : String(e) };
  }
}

// ---- features-off check ---------------------------------------------------------------------------------
// Result states: "ok" (verified off or safe), "violation" (a feature is on), "unverified" (could not be read).

const row = (feature, state, detail) => ({ feature, state, detail });

async function getJson(url, path, token, timeoutMs) {
  try {
    const res = await fetch(`${url}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    return { data: await res.json() };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

// Static layer: the environment file this kit wrote (or any env map passed in).
export function checkEnv(env) {
  if (!env) {
    return [
      row("stealth", "unverified", "no environment file to read"),
      row("quotaSharing", "unverified", "not controlled by environment"),
    ];
  }
  const out = [];
  const tls = isOn(env.ENABLE_TLS_FINGERPRINT);
  const compat = CLI_COMPAT_KEYS.filter((k) => isOn(env[`CLI_COMPAT_${k}`]));
  out.push(
    tls || compat.length
      ? row("stealth", "violation", [tls ? "ENABLE_TLS_FINGERPRINT" : "", ...compat.map((k) => `CLI_COMPAT_${k}`)].filter(Boolean).join(", "))
      : row("stealth", "ok", "ENABLE_TLS_FINGERPRINT and CLI_COMPAT_* are not on"),
  );
  const host = env.OMNIROUTE_SERVER_HOST ?? env.HOST ?? env.API_HOST;
  out.push(
    host === HOST || host === "localhost"
      ? row("localhostBind", "ok", `bind address ${host}`) // "off" here means "not exposed"
      : row("localhostBind", "violation", `bind address is ${host ?? "unset (default 0.0.0.0)"}; expected ${HOST}`),
  );
  out.push(
    isOn(env.REQUIRE_API_KEY)
      ? row("requireApiKey", "ok", "REQUIRE_API_KEY=true")
      : row("requireApiKey", "violation", "REQUIRE_API_KEY is not true"),
  );
  return out;
}

// Live layer: the gateway's own settings endpoints. Needs a credential with management access.
export async function checkLive({ url = `http://${HOST}:${PORT}`, token, timeoutMs = 4000 } = {}) {
  const out = [];
  if (!token) {
    for (const f of ["compression", "mitm", "mcpServer", "quotaSharing"]) {
      out.push(row(f, "unverified", "no admin token supplied (set OMNIROUTE_CHECK_TOKEN)"));
    }
    return out;
  }
  const comp = await getJson(url, "/api/settings/compression", token, timeoutMs); // src/app/api/settings/compression/route.ts:8-12
  if (comp.error) out.push(row("compression", "unverified", comp.error));
  else {
    const d = comp.data ?? {};
    const mode = d.defaultMode ?? "off";
    const on = d.enabled === true || mode !== "off" || (d.autoTriggerTokens ?? 0) > 0;
    // Defaults: enabled=false, defaultMode="off" (open-sse/services/compression/types.ts:421-423).
    out.push(on ? row("compression", "violation", `enabled=${d.enabled} defaultMode=${mode}`) : row("compression", "ok", "enabled=false defaultMode=off"));
  }
  const mitm = await getJson(url, "/api/settings/mitm", token, timeoutMs); // src/app/api/settings/mitm/route.ts:146-163
  if (mitm.error) out.push(row("mitm", "unverified", mitm.error));
  else {
    const d = mitm.data ?? {};
    const on = d.running === true || d.dnsConfigured === true;
    out.push(on ? row("mitm", "violation", `running=${d.running} dnsConfigured=${d.dnsConfigured}`) : row("mitm", "ok", "not running, no DNS override"));
  }
  const mcp = await getJson(url, "/api/mcp/status", token, timeoutMs); // src/app/api/mcp/status/route.ts:16-75
  if (mcp.error) out.push(row("mcpServer", "unverified", mcp.error));
  else {
    const d = mcp.data ?? {};
    const on = d.enabled === true || d.online === true;
    out.push(on ? row("mcpServer", "violation", `enabled=${d.enabled} online=${d.online}`) : row("mcpServer", "ok", "mcpEnabled=false (default, src/lib/db/settings.ts:185)"));
  }
  // UNVERIFIED: OmniRoute has no master switch for quota sharing. It acts only through pools that give an
  // API key an allocation (src/lib/db/quotaPools.ts:84, :240). "Off" is read as: no pool has two or more allocations.
  const pools = await getJson(url, "/api/quota/pools", token, timeoutMs); // src/app/api/quota/pools/route.ts:23-34
  if (pools.error) out.push(row("quotaSharing", "unverified", pools.error));
  else {
    const list = Array.isArray(pools.data?.pools) ? pools.data.pools : [];
    const shared = list.filter((p) => Array.isArray(p.allocations) && p.allocations.length > 1);
    out.push(shared.length ? row("quotaSharing", "violation", `${shared.length} pool(s) share one connection across keys`) : row("quotaSharing", "ok", "no multi-key quota pool"));
  }
  return out;
}

// Agent side: our agents must not have OmniRoute's MCP server registered, and the Claude subscription must not
// be pointed at the gateway (FR-009). Only key names and URLs are read; nothing from these files is printed.
export function checkAgentConfig({ claudeJson, claudeSettings, projectMcp } = {}) {
  const out = [];
  const regs = [];
  const scan = (file, label) => {
    if (!file || !existsSync(file)) return;
    let j;
    try {
      j = JSON.parse(readFileSync(file, "utf-8"));
    } catch {
      out.push(row("mcpRegistered", "unverified", `${label} is not readable JSON`));
      return;
    }
    const servers = [j?.mcpServers, ...Object.values(j?.projects ?? {}).map((p) => p?.mcpServers)];
    for (const s of servers) {
      for (const [name, def] of Object.entries(s ?? {})) {
        const blob = `${name} ${JSON.stringify(def ?? {})}`.toLowerCase();
        if (blob.includes("omniroute") || blob.includes(`:${PORT}/api/mcp`)) regs.push(`${label}:${name}`);
      }
    }
  };
  scan(claudeJson, "claude.json");
  scan(projectMcp, ".mcp.json");
  out.push(regs.length ? row("mcpRegistered", "violation", `registered in ${regs.join(", ")}`) : row("mcpRegistered", "ok", "no OmniRoute MCP entry in the agent config"));
  let routed = false;
  if (claudeSettings && existsSync(claudeSettings)) {
    try {
      const base = String(JSON.parse(readFileSync(claudeSettings, "utf-8"))?.env?.ANTHROPIC_BASE_URL ?? "");
      routed = base.includes(`:${PORT}`) || base.toLowerCase().includes("omniroute");
    } catch {
      /* unreadable: leave as not routed; reported unverified below */
    }
  }
  out.push(routed ? row("claudeRouted", "violation", "ANTHROPIC_BASE_URL points at the gateway") : row("claudeRouted", "ok", "Claude Code uses its official endpoint"));
  return out;
}

export function verdict(results) {
  if (results.some((r) => r.state === "violation")) return 1;
  if (results.some((r) => r.state === "unverified")) return 2;
  return 0;
}
